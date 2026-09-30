import { describe, expect, it } from "vitest";
import { buildCredentialsEmail, buildResetLinkEmail, duration } from "./accountEmails";

const credentials = (kind: "new" | "reset") =>
  buildCredentialsEmail({
    firstName: "Amine",
    email: "amine@example.org",
    password: "Ab3xK9mPq2RsTu",
    loginUrl: "https://mtym-jury.mathmaroc.org",
    kind,
  });

describe("credentials email", () => {
  it("gives the address, the email and the password in both bodies", () => {
    const { text, html } = credentials("new");
    for (const body of [text, html]) {
      expect(body).toContain("https://mtym-jury.mathmaroc.org");
      expect(body).toContain("amine@example.org");
      expect(body).toContain("Ab3xK9mPq2RsTu");
      expect(body).toContain("Bonjour Amine,");
    }
    expect(text).toContain("Mot de passe : Ab3xK9mPq2RsTu");
    expect(html).toContain('src="cid:mtym-logo"');
  });

  it("names a new account and a reset differently", () => {
    expect(credentials("new").subject).toBe("[MTYM 2026] Vos identifiants pour l'espace jury");
    expect(credentials("reset").subject).toBe("[MTYM 2026] Votre nouveau mot de passe");
    expect(credentials("reset").text).toContain("l'ancien ne fonctionne plus");
    expect(credentials("new").text).not.toContain("l'ancien ne fonctionne plus");
  });

  it("escapes what comes from the account", () => {
    const { html, text } = buildCredentialsEmail({
      firstName: "<b>Zo\"é</b>",
      email: "a&b@example.org",
      password: "x",
      loginUrl: "https://mtym-jury.mathmaroc.org",
      kind: "new",
    });
    expect(html).toContain("Bonjour &lt;b&gt;Zo&quot;é&lt;/b&gt;,");
    expect(html).toContain("a&amp;b@example.org");
    expect(html).not.toContain("<b>Zo");
    expect(text).toContain('Bonjour <b>Zo"é</b>,'); // the text body stays as typed
  });
});

describe("reset link email", () => {
  const link = "https://mtym-jury.mathmaroc.org/mot-de-passe#tok_en-123";
  const email = buildResetLinkEmail({ firstName: "Salma", link, validMinutes: 60 });

  it("carries the link in both bodies, and says how long it lasts", () => {
    expect(email.subject).toBe("[MTYM 2026] Choisir un nouveau mot de passe");
    expect(email.text).toContain(link);
    expect(email.html).toContain(`href="${link}"`);
    expect(email.text).toContain("Ce lien est valable 1 heure et ne sert qu'une fois.");
    expect(email.text).toContain("Ignorez cet email : votre mot de passe ne change pas.");
  });

  it("writes durations in French", () => {
    expect(duration(60)).toBe("1 heure");
    expect(duration(120)).toBe("2 heures");
    expect(duration(30)).toBe("30 minutes");
    expect(duration(1)).toBe("1 minute");
  });
});
