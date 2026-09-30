// The convocation email of one team — pure: the data in, the subject, both
// bodies (HTML and plain text) and the reports to attach out. Loaded by
// services/mailings.ts, sent by routes/mailings.ts.
//
// For its day: the date and center, its timetable, then one section per
// role — the problem it defends (upload the presentation), the one it
// opposes and the one it reports on (the defending team's report attached,
// to read and analyze beforehand). In a pool of 4, the team that has no
// role in a passage waits outside the room: a pause in its timetable.
//
// The subject, the title and the opening (up to the day's details) are the
// admin's words (MailTemplate), with {variables}; the rest is built here.

import { BODY, CLAY, emailPage, esc, FOREST, HEADING, INK_SOFT, LINK, SAFFRON } from "./emailLayout";

export interface ConvocationTeam {
  id: string;
  name: string;
  quadrigram: string;
}

export interface ConvocationPassage {
  poolLabel: string;
  slot: number;
  room: string | null;
  problemNumber: number;
  defenderTeamId: string;
  opponentTeamId: string;
  reporterTeamId: string;
  extraTeamId: string | null;
}

// Whether a defending team's report can go with the email
export type ReportState = "attached" | "missing" | "tooLarge";

export interface ConvocationInput {
  team: ConvocationTeam;
  center: { name: string; online: boolean };
  date: string; // "YYYY-MM-DD"
  passages: ConvocationPassage[]; // the team's passages, any role
  teams: Map<string, ConvocationTeam>;
  reportState: (teamId: string, problemNumber: number) => ReportState;
  uploadUrl: string; // where teams upload their presentation, e.g. "mtym.mathmaroc.org"
  template?: MailTemplate; // DEFAULT_TEMPLATE when left out
}

// ── The admin's part of the email ──

export interface MailTemplate {
  subject: string;
  title: string;
  intro: string; // paragraphs separated by a blank line
}

// What each {variable} becomes, for one team
export const TEMPLATE_VARIABLES = {
  equipe: "le nom de l'équipe",
  quadrigramme: "son quadrigramme",
  jour: "la date, ex. « samedi 3 octobre »",
  centre: "le centre, ou « En ligne »",
  poule: "sa poule",
} as const;
type Variable = keyof typeof TEMPLATE_VARIABLES;

export const DEFAULT_TEMPLATE: MailTemplate = {
  subject: "[MTYM 2026] Problème à défendre et planning des passages",
  title: "Votre journée du {jour} ({centre})",
  intro: "Bonjour à toute l'équipe {equipe} ({quadrigramme}),\n\nVoici votre programme pour les qualifications du MTYM 2026.",
};

const VARIABLE = /\{([^{}\s]+)\}/g;

// The {variables} of a text that don't exist, each once: "{equipe}" is
// one, "{equpe}" isn't
export function unknownVariables(text: string): string[] {
  return [...new Set([...text.matchAll(VARIABLE)].map((m) => m[1]).filter((v) => !(v in TEMPLATE_VARIABLES)))];
}

const fill = (text: string, values: Record<Variable, string>) =>
  text.replace(VARIABLE, (whole, name: string) => (name in values ? values[name as Variable] : whole));

export interface Convocation {
  subject: string;
  html: string;
  text: string;
  attachments: { teamId: string; problemNumber: number; filename: string }[];
}

type Role = "defense" | "opposition" | "rapport" | "pause";

const ROLE_LABEL: Record<Role, string> = {
  defense: "Défense",
  opposition: "Opposition",
  rapport: "Rapport",
  pause: "Pause",
};
const PAUSE_NOTE = "vous attendez à l'extérieur de la salle";

// "samedi 26 septembre"
export function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

// Passages are named by their order in the pool, not by time: the times
// can still move, the order doesn't
const passageName = (slot: number) => `Passage ${slot}`;

function roleIn(p: ConvocationPassage, teamId: string): Role {
  if (p.defenderTeamId === teamId) return "defense";
  if (p.opponentTeamId === teamId) return "opposition";
  if (p.reporterTeamId === teamId) return "rapport";
  return "pause";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A team's members' addresses, each once, the malformed ones left out
export function recipientsOf(contacts: { email: string }[]): string[] {
  return [...new Set(contacts.map((c) => c.email.trim().toLowerCase()).filter((e) => EMAIL.test(e)))];
}

// "Rapport P3 - AXIO.pdf"
export const reportFilename = (quadrigram: string, problemNumber: number) => `Rapport P${problemNumber} - ${quadrigram}.pdf`;

// A paragraph: plain text (escaped in the HTML), or with its own HTML
type Paragraph = string | { text: string; html: string };

export function buildConvocation(input: ConvocationInput): Convocation {
  const { team, teams } = input;
  const quad = (id: string) => teams.get(id)?.quadrigram ?? "?";
  const named = (id: string) => {
    const t = teams.get(id);
    return t ? `${t.quadrigram} (${t.name})` : "?";
  };
  const day = longDate(input.date);
  const passages = [...input.passages].sort((a, b) => a.slot - b.slot);
  const find = (role: Role) => passages.find((p) => roleIn(p, team.id) === role);
  const attachments: Convocation["attachments"] = [];

  // What the email says about a defending team's report, and its attachment
  const reportNote = (defenderId: string, problem: number): string => {
    const state = input.reportState(defenderId, problem);
    if (state === "attached") {
      const filename = reportFilename(quad(defenderId), problem);
      attachments.push({ teamId: defenderId, problemNumber: problem, filename });
      return `Le rapport de ${quad(defenderId)} est joint à cet email (« ${filename} »).`;
    }
    if (state === "tooLarge") {
      return `Le rapport de ${quad(defenderId)} est trop volumineux pour être joint : répondez à cet email pour le recevoir.`;
    }
    return `Le rapport de ${quad(defenderId)} n'a pas encore été déposé : il n'est donc pas joint.`;
  };

  // ── Sections, shared by both bodies ──
  const sections: { title: string; paragraphs: Paragraph[] }[] = [];
  const defense = find("defense");
  if (defense) {
    const [lead, tail] = ["N'oubliez pas de déposer votre présentation sur votre espace d'équipe sur ", " avant la deadline."];
    sections.push({
      title: `Vous défendez : problème ${defense.problemNumber}`,
      paragraphs: [
        `Vous présenterez votre solution du problème ${defense.problemNumber} (passage ${defense.slot}).`,
        {
          text: `${lead}${input.uploadUrl}${tail}`,
          // Bold, larger and red; the link keeps a link's color
          html: `<p style="margin:0 0 10px;font-family:${BODY};font-size:17px;line-height:1.5;font-weight:700;color:${CLAY}">${esc(lead)}`
            + `<a href="https://${esc(input.uploadUrl)}" style="color:${LINK};text-decoration:underline">${esc(input.uploadUrl)}</a>`
            + `${esc(tail)}</p>`,
        },
      ],
    });
  }
  const opposition = find("opposition");
  if (opposition) {
    sections.push({
      title: `Vous opposez : problème ${opposition.problemNumber}`,
      paragraphs: [
        `Vous serez l'équipe opposante face à ${named(opposition.defenderTeamId)}, qui défend le problème ${opposition.problemNumber} (passage ${opposition.slot}).`,
        reportNote(opposition.defenderTeamId, opposition.problemNumber),
        "Lisez-le attentivement et analysez-le en amont : ses points forts, ses faiblesses, les questions à poser. Cette préparation vous aidera à mener une opposition solide.",
      ],
    });
  }
  const rapport = find("rapport");
  if (rapport) {
    sections.push({
      title: `Vous rapportez : problème ${rapport.problemNumber}`,
      paragraphs: [
        `Vous serez l'équipe rapporteure du débat entre ${named(rapport.defenderTeamId)} (défense) et ${named(rapport.opponentTeamId)} (opposition) sur le problème ${rapport.problemNumber} (passage ${rapport.slot}).`,
        reportNote(rapport.defenderTeamId, rapport.problemNumber),
        "Lisez-le et analysez-le avant le passage : vous suivrez mieux le débat et en ferez un compte rendu plus juste.",
      ],
    });
  }

  const where = input.center.online ? "En ligne" : input.center.name;
  const timetable = passages.map((p) => {
    const role = roleIn(p, team.id);
    return { passage: passageName(p.slot), room: p.room, role, problem: p.problemNumber };
  });
  const pools = [...new Set(passages.map((p) => p.poolLabel))].join(", ");

  const template = input.template ?? DEFAULT_TEMPLATE;
  const values = { equipe: team.name, quadrigramme: team.quadrigram, jour: day, centre: where, poule: pools };
  const subject = fill(template.subject, values);
  const title = fill(template.title, values);
  const opening = fill(template.intro, values).split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  // Under the day's details: an « IMPORTANT » label, then the text in bold,
  // the second « convocation » and « légalisée » underlined in the HTML
  const notice: Paragraph = (() => {
    const label = "⚠️ IMPORTANT";
    const [a, b, c, d] = [
      "Ce mail ne constitue pas une convocation. L'accès au campus et la participation au tournoi sont conditionnés par la présentation de votre ",
      " ainsi que votre autorisation parentale ",
      "légalisée",
      ".",
    ];
    return {
      text: `${label}\n${a}convocation${b}${c}${d}`,
      html: `<div style="margin:0 0 18px;border-left:4px solid ${CLAY};background:#fcf0ec;padding:10px 12px">`
        + `<div style="margin:0 0 4px;font-family:${HEADING};font-weight:900;font-size:14px;letter-spacing:1px;color:${CLAY}">${label}</div>`
        + `<p style="margin:0;font-family:${BODY};font-size:15px;line-height:1.55;font-weight:700;color:${FOREST}">`
        + `${esc(a)}<u>convocation</u>${esc(b)}<u>${esc(c)}</u>${esc(d)}</p></div>`,
    };
  })();
  const signoff = ["Bonne préparation, et à très bientôt !", "L'équipe MTYM"];
  const help = "Une question ? Répondez simplement à cet email.";
  const plain = (p: Paragraph) => (typeof p === "string" ? p : p.text);

  // ── Plain text ──
  const text = [
    title.toUpperCase(),
    "",
    ...opening.flatMap((x) => [x, ""]),
    `Date : ${day}`,
    `${input.center.online ? "Lieu" : "Centre"} : ${where}`,
    ...(pools ? [`Poule : ${pools}`] : []),
    "",
    plain(notice),
    "",
    "Votre journée",
    ...timetable.map((t) => t.role === "pause"
      ? `- ${t.passage} · ${ROLE_LABEL.pause} : ${PAUSE_NOTE}`
      : `- ${t.passage}${t.room ? ` · ${t.room}` : ""} · ${ROLE_LABEL[t.role]} · problème ${t.problem}`),
    ...sections.flatMap((s) => ["", s.title, ...s.paragraphs.map(plain)]),
    "",
    ...signoff,
    help,
  ].join("\n");

  // ── HTML ──
  // A paragraph; a line break in the admin's text stays one
  const p = (s: string) => `<p style="margin:0 0 10px;font-family:${BODY};font-size:15px;line-height:1.55;color:${FOREST}">${esc(s).replace(/\n/g, "<br>")}</p>`;
  const para = (x: Paragraph) => (typeof x === "string" ? p(x) : x.html);
  const cell = `padding:8px 10px;border-bottom:1px solid #e1dcc9;font-family:${BODY}`;
  const rows = timetable
    .map((t) => t.role === "pause"
      ? `<tr>
        <td style="${cell};font-family:${HEADING};font-weight:700;white-space:nowrap;color:${INK_SOFT}">${esc(t.passage)}</td>
        <td style="${cell};color:${INK_SOFT}">${ROLE_LABEL.pause}</td>
        <td colspan="2" style="${cell};color:${INK_SOFT};font-style:italic">${esc(PAUSE_NOTE)}</td>
      </tr>`
      : `<tr>
        <td style="${cell};font-family:${HEADING};font-weight:700;white-space:nowrap">${esc(t.passage)}</td>
        <td style="${cell}">${esc(ROLE_LABEL[t.role])}</td>
        <td style="${cell}">Problème ${t.problem}</td>
        <td style="${cell};color:${INK_SOFT}">${esc(t.room ?? "")}</td>
      </tr>`)
    .join("");
  const label = (s: string) => `<td style="padding:3px 16px 3px 0;font-family:${BODY};color:${INK_SOFT}">${esc(s)}</td>`;
  const value = (s: string) => `<td style="padding:3px 0;font-family:${HEADING};font-weight:700">${esc(s)}</td>`;
  const html = emailPage({
    tagline: "Qualifications",
    inner: `<h1 style="margin:0 0 18px;font-family:${HEADING};font-weight:900;font-size:24px;line-height:1.25;color:${FOREST}">${esc(title)}</h1>
      ${opening.map(p).join("\n      ")}
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:6px 0 18px;font-size:15px">
        <tr>${label("Date")}${value(day)}</tr>
        <tr>${label(input.center.online ? "Lieu" : "Centre")}${value(where)}</tr>
        ${pools ? `<tr>${label("Poule")}${value(pools)}</tr>` : ""}
      </table>
      ${para(notice)}
      <div style="font-family:${HEADING};font-weight:900;font-size:14px;letter-spacing:1px;text-transform:uppercase;margin:0 0 6px">Votre journée</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;border-top:2px solid ${FOREST};margin-bottom:8px">${rows}</table>
      ${sections.map((s) => `
      <div style="margin-top:20px;border-left:4px solid ${SAFFRON};padding-left:12px">
        <div style="font-family:${HEADING};font-weight:800;font-size:16px;margin-bottom:8px">${esc(s.title)}</div>
        ${s.paragraphs.map(para).join("")}
      </div>`).join("")}
      <div style="margin-top:24px">
        ${signoff.map(p).join("")}
        <p style="margin:14px 0 0;font-family:${BODY};font-size:13px;color:${INK_SOFT}">${esc(help)}</p>
      </div>`,
  });

  return { subject, html, text, attachments };
}
