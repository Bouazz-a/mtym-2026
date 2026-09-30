// The look shared by every email the platform sends (convocations, account
// emails): the platform's colors and fonts as inline styles — mail clients
// drop stylesheets, and Gmail ignores web fonts and falls back to Arial —
// and the page around the content: a forest header with the logo, then a
// white card. Pure: no config, no database.

export const FOREST = "#122019";
export const SAFFRON = "#f6a806";
export const INK_SOFT = "#4a5550";
export const CLAY = "#b23b1b";
export const LINK = "#1a5fb4";
export const HEADING = "'Montserrat', Arial, Helvetica, sans-serif";
export const BODY = "'Open Sans', Arial, Helvetica, sans-serif";

// The logo in the header: an inline attachment of the email (services/
// mailings.ts attaches assets/mtym-logo.png under this id)
export const LOGO_CID = "mtym-logo";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The whole HTML email: the header (logo, « 2026 », then `tagline`) over a
// card holding `inner`, the email's own content
export function emailPage({ tagline, inner }: { tagline: string; inner: string }): string {
  return `<!doctype html>
<html lang="fr"><head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&amp;family=Open+Sans:wght@400;600;700&amp;display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:24px;background:#faf7ee;font-family:${BODY};color:${FOREST}">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:2px solid ${FOREST}">
    <tr><td style="background:${FOREST};padding:16px 24px">
      <img src="cid:${LOGO_CID}" alt="MTYM" width="117" height="24" style="display:inline-block;vertical-align:middle;border:0;height:24px;width:117px">
      <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-family:${HEADING};font-weight:800;font-size:19px;line-height:24px;color:${SAFFRON}">2026</span>
      <span style="display:inline-block;vertical-align:middle;margin-left:6px;font-family:${HEADING};font-weight:700;font-size:19px;line-height:24px;color:#faf7ee">${esc(tagline)}</span>
    </td></tr>
    <tr><td style="padding:22px 24px">
      ${inner}
    </td></tr>
  </table>
</body></html>`;
}
