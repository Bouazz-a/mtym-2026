import { describe, expect, it } from "vitest";
import { buildConvocation, longDate, recipientsOf, type ConvocationInput, type ConvocationPassage, type ReportState } from "./convocation";

const TEAMS = new Map(["ALFA", "BETA", "GAMA", "DELT"].map((q) => [q, { id: q, quadrigram: q, name: `Équipe ${q}` }]));

// A pool in rotation: in passage i, team i defends problem i
function pool(quads: string[]): ConvocationPassage[] {
  const n = quads.length;
  return quads.map((_, i) => ({
    poolLabel: "CAS-A1",
    slot: i + 1,
    room: i === 0 ? "Amphi A" : null,
    problemNumber: i + 1,
    defenderTeamId: quads[i],
    opponentTeamId: quads[(i + 1) % n],
    reporterTeamId: quads[(i + 2) % n],
    extraTeamId: n === 4 ? quads[(i + 3) % n] : null,
  }));
}

const input = (overrides: Partial<ConvocationInput> = {}, state: ReportState = "attached"): ConvocationInput => ({
  team: TEAMS.get("ALFA")!,
  center: { name: "Casablanca", online: false },
  date: "2026-09-26",
  passages: pool(["ALFA", "BETA", "GAMA", "DELT"]),
  teams: TEAMS,
  reportState: () => state,
  uploadUrl: "mtym.mathmaroc.org",
  ...overrides,
});

describe("convocation email", () => {
  it("dates the day in French", () => {
    expect(longDate("2026-09-26")).toBe("samedi 26 septembre");
  });

  it("gives the day, the center and the timetable", () => {
    const c = buildConvocation(input());
    expect(c.subject).toBe("[MTYM 2026] Problème à défendre et planning des passages");
    expect(c.text).toContain("Date : samedi 26 septembre");
    expect(c.text).toContain("Centre : Casablanca");
    expect(c.text).toContain("- Passage 1 · Amphi A · Défense · problème 1");
  });

  it("opens with the big title, then greets the team with its quadrigram", () => {
    const { text, html } = buildConvocation(input());
    expect(text.startsWith("VOTRE JOURNÉE DU SAMEDI 26 SEPTEMBRE (CASABLANCA)\n\nBonjour à toute l'équipe Équipe ALFA (ALFA),")).toBe(true);
    expect(html).toMatch(/<h1[^>]*>Votre journée du samedi 26 septembre \(Casablanca\)<\/h1>\s*<p[^>]*>Bonjour à toute l'équipe Équipe ALFA \(ALFA\),<\/p>/);
  });

  // In the rotation ALFA defends P1 (passage 1), waits outside during
  // BETA's P2 (passage 2), reports on GAMA vs DELT on P3 (passage 3) and
  // opposes DELT on P4 (passage 4)
  it("has one section per role, with the right problems and teams", () => {
    const { text } = buildConvocation(input());
    expect(text).toContain("Vous défendez : problème 1");
    expect(text).toContain("N'oubliez pas de déposer votre présentation sur votre espace d'équipe sur mtym.mathmaroc.org avant la deadline.");
    expect(text).toContain("Vous opposez : problème 4");
    expect(text).toContain("face à DELT (Équipe DELT), qui défend le problème 4");
    expect(text).toContain("vous aidera à mener une opposition solide");
    expect(text).toContain("Vous rapportez : problème 3");
    expect(text).toContain("entre GAMA (Équipe GAMA) (défense) et DELT (Équipe DELT) (opposition)");
  });

  it("has no observer: the fourth team waits outside the room", () => {
    const { text, html } = buildConvocation(input());
    expect(text).toContain("- Passage 2 · Pause : vous attendez à l'extérieur de la salle");
    expect(text.toLowerCase()).not.toContain("observ");
    expect(html.toLowerCase()).not.toContain("observ");
  });

  it("names the passages by their number, never by a time", () => {
    const { text, html } = buildConvocation(input());
    expect(text).toContain("Vous présenterez votre solution du problème 1 (passage 1).");
    expect(html).toMatch(/>Passage 3<\/td>/);
    for (const s of [text, html]) expect(s).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("uses no long dashes anywhere", () => {
    const { subject, text, html } = buildConvocation(input());
    for (const s of [subject, text, html]) expect(s).not.toMatch(/[—–]/);
  });

  it("puts the upload reminder in bold red, the link aside", () => {
    const { html } = buildConvocation(input());
    const reminder = html.match(/<p[^>]*>N'oubliez pas[\s\S]*?<\/p>/)?.[0] ?? "";
    expect(reminder).toMatch(/font-weight:700/);
    expect(reminder).toMatch(/color:#b23b1b/);
    expect(reminder).toContain('<a href="https://mtym.mathmaroc.org" style="color:#1a5fb4');
    expect(reminder).toContain("avant la deadline.");
  });

  it("says in bold, under « IMPORTANT », that it isn't a convocation, the second « convocation » and « légalisée » underlined", () => {
    const { html, text } = buildConvocation(input());
    const notice = html.match(/<p[^>]*>Ce mail ne constitue pas[\s\S]*?<\/p>/)?.[0] ?? "";
    expect(notice).toMatch(/font-weight:700/);
    expect(notice).toContain("Ce mail ne constitue pas une convocation. L'accès au campus");
    expect(notice).toContain("présentation de votre <u>convocation</u> ainsi que votre autorisation parentale <u>légalisée</u>.");
    expect(notice.match(/<u>/g)).toHaveLength(2);
    // Under a red « ⚠️ IMPORTANT » label, in a box with a red edge
    expect(html).toMatch(/border-left:4px solid #b23b1b[^>]*><div[^>]*color:#b23b1b[^>]*>⚠️ IMPORTANT<\/div><p[^>]*>Ce mail ne constitue/);
    expect(text).toContain("⚠️ IMPORTANT\nCe mail ne constitue pas une convocation.");
    // Before the timetable, in both bodies
    expect(html.indexOf("Ce mail ne constitue")).toBeLessThan(html.indexOf("Votre journée</div>"));
    expect(text).toContain("Ce mail ne constitue pas une convocation. L'accès au campus et la participation au tournoi sont conditionnés par la présentation de votre convocation ainsi que votre autorisation parentale légalisée.");
    expect(text.indexOf("Ce mail ne constitue")).toBeLessThan(text.indexOf("Votre journée"));
  });

  it("heads with the logo, « 2026 Qualifications » and no team name, in the platform's fonts", () => {
    const { html } = buildConvocation(input());
    const header = html.match(/<tr><td style="background:#122019[\s\S]*?<\/td><\/tr>/)?.[0] ?? "";
    expect(header).toContain('src="cid:mtym-logo"');
    expect(header).toMatch(/height="24"/);
    expect(header).toMatch(/>2026<\/span>[\s\S]*>Qualifications<\/span>/);
    expect(header).not.toContain("·");
    expect(header).not.toContain("ALFA");
    expect(html).toContain("'Montserrat', Arial");
    expect(html).toContain("'Open Sans', Arial");
  });

  it("attaches the defending teams' reports it opposes and reports on", () => {
    const c = buildConvocation(input());
    expect(c.attachments).toEqual([
      { teamId: "DELT", problemNumber: 4, filename: "Rapport P4 - DELT.pdf" },
      { teamId: "GAMA", problemNumber: 3, filename: "Rapport P3 - GAMA.pdf" },
    ]);
    expect(c.text).toContain("Le rapport de DELT est joint à cet email");
  });

  it("says when a report isn't filed yet, or too heavy, and attaches nothing", () => {
    const missing = buildConvocation(input({}, "missing"));
    expect(missing.attachments).toHaveLength(0);
    expect(missing.text).toContain("Le rapport de DELT n'a pas encore été déposé");
    const heavy = buildConvocation(input({}, "tooLarge"));
    expect(heavy.attachments).toHaveLength(0);
    expect(heavy.text).toContain("trop volumineux pour être joint");
  });

  it("has no pause in a pool of 3", () => {
    const { text } = buildConvocation(input({ passages: pool(["ALFA", "BETA", "GAMA"]) }));
    expect(text).not.toContain("Pause");
    expect(text).toContain("Vous rapportez : problème 2"); // passage 2: BETA defends, GAMA opposes, ALFA reports
  });

  it("says « en ligne » for the online tournament", () => {
    const c = buildConvocation(input({ center: { name: "En ligne", online: true } }));
    expect(c.text).toContain("Lieu : En ligne");
    expect(c.html).toMatch(/<h1[^>]*>Votre journée du samedi 26 septembre \(En ligne\)<\/h1>/);
  });

  it("escapes the team names in the HTML", () => {
    const teams = new Map(TEAMS);
    teams.set("ALFA", { id: "ALFA", quadrigram: "ALFA", name: "<b>Alfa</b>" });
    const c = buildConvocation(input({ team: teams.get("ALFA")!, teams }));
    expect(c.html).toContain("&lt;b&gt;Alfa&lt;/b&gt;");
    expect(c.html).not.toContain("<b>Alfa</b>");
  });
});

describe("recipients", () => {
  it("keeps each well-formed address once", () => {
    expect(recipientsOf([{ email: " A@x.ma " }, { email: "a@x.ma" }, { email: "pas-un-email" }, { email: "b@y.org" }]))
      .toEqual(["a@x.ma", "b@y.org"]);
  });
});
