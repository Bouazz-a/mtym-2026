import { readFileSync } from "node:fs";
import path from "node:path";
import { db } from "../db";
import { AppError, BadRequestError, NotFoundError } from "../utils/errors";
import { centerName } from "./centers";
import { buildConvocation, LOGO_CID, recipientsOf, reportFilename, type Convocation, type ReportState } from "./convocation";
import { reportFile, reportFileSize } from "./reportFiles";

// Loads what a team's convocation email is made of — its day, passages,
// the teams it meets, its members' addresses — and the defending teams'
// report files, then hands them to the pure builder (convocation.ts).

// Where the teams upload their presentation
export const UPLOAD_URL = "mtym.mathmaroc.org";
// Above this, a report isn't attached (mailboxes reject heavy emails)
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

// The header's logo: frontend/src/assets/MTYM2.svg rendered as a PNG (mail
// clients don't show SVG), embedded in each email. Same path from src/ and
// dist/ (backend/assets).
let logo: Buffer | undefined;
const logoPng = () => (logo ??= readFileSync(path.join(__dirname, "../../assets/mtym-logo.png")));

export const logoAttachment = () => ({ filename: "mtym-logo.png", content: logoPng(), contentType: "image/png", cid: LOGO_CID });

// The email as a page can show it: the logo inlined instead of referenced
export const withInlineLogo = (html: string) =>
  html.replaceAll(`cid:${LOGO_CID}`, `data:image/png;base64,${logoPng().toString("base64")}`);

const playsIn = (teamId: string) => ({
  OR: [{ defenderTeamId: teamId }, { opponentTeamId: teamId }, { reporterTeamId: teamId }, { extraTeamId: teamId }],
});

export interface AttachmentInfo {
  name: string;
  size: number | null; // bytes; null when the size couldn't be read
  state: ReportState;
  error?: string;
}

export interface ComposedConvocation extends Convocation {
  to: string[];
  attachmentInfo: AttachmentInfo[];
  files: { filename: string; content: Buffer }[]; // only when asked (sending)
}

// `withFiles`: download the reports to attach (sending). Without it (the
// preview), only their sizes are read.
export async function composeConvocation(teamId: string, withFiles: boolean): Promise<ComposedConvocation> {
  const team = await db.team.findUnique({ where: { id: teamId }, include: { centerDay: true, contacts: true } });
  if (!team) throw new NotFoundError("Équipe introuvable");
  const day = team.centerDay;
  if (!day) throw new BadRequestError(`${team.quadrigram} n'a pas encore de jour`);

  const passages = await db.passage.findMany({
    where: { pool: { centerDayId: day.id }, ...playsIn(team.id) },
    include: { pool: { select: { label: true } } },
  });
  if (passages.length === 0) throw new BadRequestError(`${team.quadrigram} n'est dans aucune poule de son jour`);

  const ids = [...new Set(passages.flatMap((p) => [p.defenderTeamId, p.opponentTeamId, p.reporterTeamId, p.extraTeamId]).filter((id): id is string => Boolean(id)))];
  const teams = new Map((await db.team.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, quadrigram: true } })).map((t) => [t.id, t]));

  // The reports the email is about: the defenders the team opposes or reports on
  const wanted = passages.filter((p) => p.opponentTeamId === team.id || p.reporterTeamId === team.id);
  const reports = await db.teamReport.findMany({
    where: { OR: wanted.map((p) => ({ teamId: p.defenderTeamId, problemNumber: p.problemNumber })) },
  });
  const key = (teamId: string, problem: number) => `${teamId}:${problem}`;
  const states = new Map<string, ReportState>();
  const attachmentInfo: AttachmentInfo[] = [];
  const buffers = new Map<string, Buffer>();

  for (const p of wanted) {
    const quad = teams.get(p.defenderTeamId)?.quadrigram ?? "?";
    const name = reportFilename(quad, p.problemNumber);
    const report = reports.find((r) => r.teamId === p.defenderTeamId && r.problemNumber === p.problemNumber);
    if (!report) {
      states.set(key(p.defenderTeamId, p.problemNumber), "missing");
      attachmentInfo.push({ name, size: null, state: "missing" });
      continue;
    }
    let size: number | null = null;
    let error: string | undefined;
    if (withFiles) {
      try {
        const content = await reportFile(report.fileUrl);
        size = content.length;
        buffers.set(key(p.defenderTeamId, p.problemNumber), content);
      } catch (err) {
        // Never send a convocation silently missing a report that exists
        throw new AppError(502, `Impossible de récupérer le rapport de ${quad} (problème ${p.problemNumber}) : ${(err as Error).message}`);
      }
    } else {
      try {
        size = await reportFileSize(report.fileUrl);
      } catch (err) {
        error = (err as Error).message;
      }
    }
    const state: ReportState = size !== null && size > MAX_ATTACHMENT_BYTES ? "tooLarge" : "attached";
    states.set(key(p.defenderTeamId, p.problemNumber), state);
    attachmentInfo.push({ name, size, state, ...(error ? { error } : {}) });
  }

  const convocation = buildConvocation({
    team,
    center: { name: centerName(day.center), online: day.center === "online" },
    date: day.date,
    passages: passages.map((p) => ({ ...p, poolLabel: p.pool.label })),
    teams,
    reportState: (teamId, problem) => states.get(key(teamId, problem)) ?? "missing",
    uploadUrl: UPLOAD_URL,
  });

  const files = convocation.attachments.flatMap((a) => {
    const content = buffers.get(key(a.teamId, a.problemNumber));
    return content ? [{ filename: a.filename, content }] : [];
  });

  return {
    ...convocation,
    to: recipientsOf(team.contacts),
    attachmentInfo,
    files,
  };
}
