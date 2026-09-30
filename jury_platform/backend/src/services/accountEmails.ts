// The emails about an account's access — pure, like convocation.ts: the data
// in, the subject and both bodies (HTML and plain text) out. Sent by
// services/accountMail.ts.
//
// - buildCredentialsEmail: the login address, the email and a password — a
//   new account's, or one an admin just issued (Comptes);
// - buildResetLinkEmail: the « Mot de passe oublié » link, to choose a new
//   password (the page /mot-de-passe of the interface).

import { BODY, CLAY, emailPage, esc, FOREST, HEADING, INK_SOFT, LINK, SAFFRON } from "./emailLayout";

export interface AccountEmail {
  subject: string;
  html: string;
  text: string;
}

// "new": the account was just created; "reset": an admin issued a new password
export type CredentialsKind = "new" | "reset";

const TAGLINE = "Jury";
const SIGNOFF = "L'équipe MTYM";
const HELP = "Une question ? Répondez simplement à cet email.";

// ── HTML pieces ──
const p = (s: string) => `<p style="margin:0 0 10px;font-family:${BODY};font-size:15px;line-height:1.55;color:${FOREST}">${esc(s)}</p>`;
const small = (s: string) => `<p style="margin:0 0 8px;font-family:${BODY};font-size:13px;line-height:1.5;color:${INK_SOFT}">${esc(s)}</p>`;
const h1 = (s: string) => `<h1 style="margin:0 0 18px;font-family:${HEADING};font-weight:900;font-size:24px;line-height:1.25;color:${FOREST}">${esc(s)}</h1>`;
// A link drawn as the platform's primary button (saffron, forest outline)
const button = (href: string, label: string) =>
  `<p style="margin:18px 0"><a href="${esc(href)}" style="display:inline-block;background:${SAFFRON};color:${FOREST};border:2px solid ${FOREST};padding:12px 20px;font-family:${HEADING};font-weight:800;font-size:14px;letter-spacing:1px;text-transform:uppercase;text-decoration:none">${esc(label)}</a></p>`;
// The address in full under a button, for clients that don't show buttons
const fallbackLink = (href: string) =>
  `<p style="margin:0 0 16px;font-family:${BODY};font-size:13px;line-height:1.5;color:${INK_SOFT}">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><a href="${esc(href)}" style="color:${LINK};word-break:break-all">${esc(href)}</a></p>`;
const footer = `<div style="margin-top:24px">${p(SIGNOFF)}<p style="margin:14px 0 0;font-family:${BODY};font-size:13px;color:${INK_SOFT}">${esc(HELP)}</p></div>`;

// "1 heure", "2 heures", "30 minutes"
export function duration(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const h = minutes / 60;
    return `${h} heure${h > 1 ? "s" : ""}`;
  }
  return `${minutes} minute${minutes > 1 ? "s" : ""}`;
}

export function buildCredentialsEmail(input: {
  firstName: string;
  email: string;
  password: string;
  loginUrl: string;
  kind: CredentialsKind;
}): AccountEmail {
  const { firstName, email, password, loginUrl, kind } = input;
  const subject = kind === "new" ? "[MTYM 2026] Vos identifiants pour l'espace jury" : "[MTYM 2026] Votre nouveau mot de passe";
  const title = kind === "new" ? "Votre accès à l'espace jury" : "Votre nouveau mot de passe";
  const lead = kind === "new"
    ? "Votre compte sur la plateforme du jury du MTYM 2026 est prêt. Voici de quoi vous connecter :"
    : "Un nouveau mot de passe a été généré pour votre compte : l'ancien ne fonctionne plus. Voici de quoi vous connecter :";
  const change = "Vous pouvez le changer une fois connecté : menu de votre compte, en haut à droite, puis « Changer le mot de passe ».";
  const forgot = "Mot de passe oublié ? La page de connexion propose un lien pour en choisir un nouveau.";
  const host = loginUrl.replace(/^https?:\/\//, "");

  const text = [
    title.toUpperCase(),
    "",
    `Bonjour ${firstName},`,
    "",
    lead,
    "",
    `Adresse : ${loginUrl}`,
    `Email : ${email}`,
    `Mot de passe : ${password}`,
    "",
    change,
    forgot,
    "",
    SIGNOFF,
    HELP,
  ].join("\n");

  const row = (label: string, value: string, mono = false) =>
    `<tr><td style="padding:6px 16px 6px 0;font-family:${BODY};font-size:14px;color:${INK_SOFT};white-space:nowrap">${esc(label)}</td>`
    + `<td style="padding:6px 0;font-family:${mono ? "'Courier New', Courier, monospace" : HEADING};font-size:${mono ? "20px" : "15px"};font-weight:700;letter-spacing:${mono ? "2px" : "0"};color:${FOREST};word-break:break-all">${value}</td></tr>`;
  const html = emailPage({
    tagline: TAGLINE,
    inner: `${h1(title)}
      ${p(`Bonjour ${firstName},`)}
      ${p(lead)}
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 6px;padding:12px 16px;background:#faf7ee;border:2px solid ${FOREST};border-left:6px solid ${SAFFRON}">
        ${row("Adresse", `<a href="${esc(loginUrl)}" style="color:${LINK}">${esc(host)}</a>`)}
        ${row("Email", esc(email))}
        ${row("Mot de passe", esc(password), true)}
      </table>
      ${button(loginUrl, "Se connecter")}
      ${p(change)}
      ${small(forgot)}
      ${footer}`,
  });
  return { subject, html, text };
}

export function buildResetLinkEmail(input: { firstName: string; link: string; validMinutes: number }): AccountEmail {
  const { firstName, link, validMinutes } = input;
  const subject = "[MTYM 2026] Choisir un nouveau mot de passe";
  const title = "Choisir un nouveau mot de passe";
  const lead = "Vous avez demandé à changer le mot de passe de votre compte sur la plateforme du jury du MTYM 2026.";
  const validity = `Ce lien est valable ${duration(validMinutes)} et ne sert qu'une fois.`;
  const ignore = "Vous n'avez rien demandé ? Ignorez cet email : votre mot de passe ne change pas.";

  const text = [
    title.toUpperCase(),
    "",
    `Bonjour ${firstName},`,
    "",
    lead,
    "Pour choisir un nouveau mot de passe, ouvrez ce lien :",
    link,
    "",
    validity,
    ignore,
    "",
    SIGNOFF,
    HELP,
  ].join("\n");

  const html = emailPage({
    tagline: TAGLINE,
    inner: `${h1(title)}
      ${p(`Bonjour ${firstName},`)}
      ${p(lead)}
      ${button(link, "Choisir un mot de passe")}
      ${fallbackLink(link)}
      <p style="margin:0 0 10px;font-family:${BODY};font-size:15px;line-height:1.55;font-weight:700;color:${CLAY}">${esc(validity)}</p>
      ${small(ignore)}
      ${footer}`,
  });
  return { subject, html, text };
}
