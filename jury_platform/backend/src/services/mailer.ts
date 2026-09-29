import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config";
import { AppError } from "../utils/errors";

// Outgoing email. Through SMTP (SMTP_* in backend/.env), or — when
// MAIL_OUTBOX_DIR is set — written to that folder as .eml files, which any
// mail client opens: nothing leaves the machine (local use, tests). The
// outbox wins when both are set, so a local copy can't mail real teams.

export interface OutgoingMail {
  to: string[];
  subject: string;
  html: string;
  text: string;
  // PDFs by default; `cid` makes it an inline image the HTML shows (src="cid:…")
  attachments: { filename: string; content: Buffer; contentType?: string; cid?: string }[];
}

export const mailConfigured = () => Boolean(config.mail);

let smtp: Transporter | undefined;

export async function sendMail(mail: OutgoingMail): Promise<void> {
  const settings = config.mail;
  if (!settings) throw new AppError(503, "L'envoi d'emails n'est pas configuré");
  const message = {
    from: settings.from,
    replyTo: settings.replyTo,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    attachments: mail.attachments.map((a) => ({ contentType: "application/pdf", ...a })),
  };

  if (settings.outboxDir) {
    const info = await nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" }).sendMail(message);
    await mkdir(settings.outboxDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const slug = mail.subject.normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-").slice(0, 60);
    await writeFile(path.join(settings.outboxDir, `${stamp}-${slug}.eml`), info.message as Buffer);
    return;
  }

  const { smtp: server } = settings;
  if (!server) throw new AppError(503, "L'envoi d'emails n'est pas configuré");
  smtp ??= nodemailer.createTransport({
    host: server.host,
    port: server.port,
    secure: server.secure,
    auth: { user: server.user, pass: server.password },
  });
  try {
    await smtp.sendMail(message);
  } catch (err) {
    throw new AppError(502, `Le serveur d'envoi a refusé l'email : ${(err as Error).message}`);
  }
}
