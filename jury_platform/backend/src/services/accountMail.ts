import { createHash, randomBytes } from "node:crypto";
import { config } from "../config";
import { db } from "../db";
import { buildCredentialsEmail, buildResetLinkEmail, type AccountEmail, type CredentialsKind } from "./accountEmails";
import { mailConfigured, sendMail } from "./mailer";
import { logoAttachment } from "./mailings";

// Sends the emails about an account's access (built by accountEmails.ts)
// through the convocations' sender, and keeps the « Mot de passe oublié »
// links: only a link's SHA-256 is stored, the token itself is only in the
// email.

// How long a « Mot de passe oublié » link works
export const RESET_LINK_MINUTES = 60;
// One link per account at most this often: nobody can flood a juror's inbox
const RESET_COOLDOWN_MS = 2 * 60 * 1000;

async function sendAccountMail(to: string, email: AccountEmail): Promise<void> {
  await sendMail({ to: [to], ...email, attachments: [logoAttachment()] });
}

// A password, to the account's address. Throws when the email can't leave.
export async function emailCredentials(
  account: { firstName: string; email: string },
  password: string,
  kind: CredentialsKind,
): Promise<void> {
  await sendAccountMail(
    account.email,
    buildCredentialsEmail({ firstName: account.firstName, email: account.email, password, loginUrl: config.appUrl, kind }),
  );
}

export const hashResetToken = (token: string) => createHash("sha256").update(token).digest("hex");

// « Mot de passe oublié »: emails a new link to the account behind `email`.
// Does nothing — silently, the route answers the same whatever happens —
// when there's no such account, no way to send email, or a link was sent
// less than two minutes ago.
export async function sendResetLink(email: string): Promise<void> {
  if (!mailConfigured()) return;
  const account = await db.account.findUnique({ where: { email } });
  if (!account) return;
  const now = Date.now();
  const recent = await db.passwordResetToken.count({
    where: { accountId: account.id, createdAt: { gt: new Date(now - RESET_COOLDOWN_MS) } },
  });
  if (recent > 0) return;

  const token = randomBytes(32).toString("base64url");
  const [, created] = await db.$transaction([
    // Links used or expired are of no more use
    db.passwordResetToken.deleteMany({ where: { accountId: account.id, OR: [{ usedAt: { not: null } }, { expiresAt: { lt: new Date(now) } }] } }),
    db.passwordResetToken.create({
      data: { accountId: account.id, tokenHash: hashResetToken(token), expiresAt: new Date(now + RESET_LINK_MINUTES * 60_000) },
    }),
  ]);
  try {
    await sendAccountMail(
      account.email,
      buildResetLinkEmail({ firstName: account.firstName, link: `${config.appUrl}/mot-de-passe#${token}`, validMinutes: RESET_LINK_MINUTES }),
    );
  } catch (err) {
    // Not sent: the link was never seen, and a new request may try again at once
    await db.passwordResetToken.delete({ where: { id: created.id } });
    throw err;
  }
}
