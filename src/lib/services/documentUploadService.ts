import type { Document, DocumentType, Passage, Team } from "@/types";
import { v4 as uuidv4 } from "uuid";
import {
  canUploadDocumentAsOrganizer,
  canUploadDocumentAsParticipant,
  getTeamRoleInPassage,
} from "@/lib/permissions";
import {
  getDocuments,
  upsertDocument,
} from "@/lib/repositories/documentRepository";
import { getTeamById } from "@/lib/repositories/teamRepository";
import { getPassageById, getPools } from "@/lib/repositories/poolRepository";
import { nowIso } from "@/utils/dateTime";
import {
  getFinalReportFileName,
  getIntermediateReportFileName,
  getPresentationFileName,
  getSummarySheetFileName,
} from "@/utils/fileNaming";
import {
  getDocumentProblemNumber,
  isValidProblemNumber,
  validateUploadedFile,
  type ValidationResult,
} from "@/utils/validation";
import { ConflictError, ForbiddenError, NotFoundError } from "./errors";
import type { OrganizerSession, ParticipantSession, Session } from "./session";

/**
 * Document upload flow
 */

export interface UploadFileInput {
  size: number; // bytes
  mimeType: string;
  originalName: string;
}

export interface UploadDocumentArgs {
  docType: DocumentType;
  file: UploadFileInput;
  // Only required for passage-scoped documents (fiches synthèse, présentations).
  passageId?: string;
}

export type UploadDocumentResult =
  | { ok: true; document: Document }
  | { ok: false; error: string };

// Upload a document. Resolves filename, checks permission, validates,
// and persists. Returns a user-facing Result for validation errors;
// throws ServiceError for technical/permission failures.
export function uploadDocument(
  session: Session,
  args: UploadDocumentArgs,
): UploadDocumentResult {
  if (session.role === "jury") {
    throw new ForbiddenError("Les jurys ne peuvent pas uploader de documents.");
  }

  // Validate file format and size first
  const fileValidation = validateUploadedFile({
    size: args.file.size,
    mimeType: args.file.mimeType,
  });
  if (!fileValidation.ok) {
    return { ok: false, error: fileValidation.error };
  }

  // Resolve context, team, passage, defending team if relevant
  const team = resolveUploaderTeam(session);
  const passage = args.passageId ? getPassageById(args.passageId) : undefined;
  if (args.passageId && !passage) {
    throw new NotFoundError("Passage", args.passageId);
  }

  // Build canonical filename, this validates docType/passage coherence too
  const renamedAs = buildCanonicalFileName(args.docType, team, passage);

  // Find existing document by exact renamedAs match (lock check + replace)
  const existing = findExistingDocument(team.id, args.docType, renamedAs);

  // Permission check
  if (session.role === "participant") {
    if (!canUploadDocumentAsParticipant(session.participant, team, existing)) {
      if (existing?.isLocked) {
        throw new ConflictError(
          "Ce document est verrouillé. La deadline est passée.",
        );
      }
      throw new ForbiddenError(
        "Seul le créateur de l'équipe peut uploader ce document.",
      );
    }
  } else {
    // organizer
    if (!canUploadDocumentAsOrganizer(session.organizer)) {
      throw new ForbiddenError("Action réservée à l'administrateur.");
    }
  }

  // Build and persist the document
  const uploaderId =
    session.role === "participant"
      ? session.participant.id
      : session.organizer.id;

  const doc: Document = {
    id: existing?.id ?? uuidv4(),
    docType: args.docType,
    uploadedById: uploaderId,
    teamId: team.id,
    originalName: args.file.originalName,
    renamedAs,
    storagePath: `/uploads/${renamedAs}`,
    size: args.file.size,
    mimeType: args.file.mimeType,
    uploadedAt: nowIso(),
    isLocked: existing?.isLocked ?? false,
  };

  upsertDocument(doc);
  return { ok: true, document: doc };
}

// ================== Internal helpers ==================

function resolveUploaderTeam(
  session: ParticipantSession | OrganizerSession,
): Team {
  if (session.role === "participant") {
    return session.team;
  }
  // Organizer must have selected a team in their session before uploading.
  if (!session.selectedTeam) {
    throw new ConflictError(
      "Aucune équipe sélectionnée. L'organisateur doit choisir une équipe avant d'uploader.",
    );
  }
  return session.selectedTeam;
}

// Locate an existing document of the same logical "slot". Two docs of the
// same type+team+passage produce the same canonical renamedAs, so exact
// match on (teamId, docType, renamedAs) uniquely identifies a slot.
function findExistingDocument(
  teamId: string,
  docType: DocumentType,
  renamedAs: string,
): Document | undefined {
  return getDocuments().find(
    (d) =>
      d.teamId === teamId && d.docType === docType && d.renamedAs === renamedAs,
  );
}

function buildCanonicalFileName(
  docType: DocumentType,
  team: Team,
  passage: Passage | undefined,
): string {
  if (docType === "rapport_intermediaire") {
    return getIntermediateReportFileName(team);
  }

  if (docType.startsWith("rapport_final_p")) {
    const problemNumber = getDocumentProblemNumber(docType);
    if (problemNumber === null || !isValidProblemNumber(problemNumber)) {
      throw new ConflictError(`Type de document invalide: ${docType}`);
    }
    return getFinalReportFileName(team, problemNumber);
  }

  if (
    docType.startsWith("fiche_synthese_") ||
    docType.startsWith("presentation_")
  ) {
    if (!passage) {
      throw new ConflictError(
        "Ce type de document doit être lié à un passage.",
      );
    }
    const pool = resolvePoolFromPassage(passage);
    const role = getTeamRoleInPassage(team, passage);

    if (docType.startsWith("fiche_synthese_")) {
      if (role !== "opponent" && role !== "reporter") {
        throw new ConflictError(
          "Seules les équipes opposant et rapporteur peuvent déposer une fiche de synthèse.",
        );
      }
      const defendingTeam = getTeamById(passage.defenderTeamId);
      if (!defendingTeam) {
        throw new NotFoundError("Équipe défenseuse", passage.defenderTeamId);
      }
      return getSummarySheetFileName({
        team,
        role,
        defendingTeam,
        pool,
        passage,
      });
    }

    // presentation
    if (role !== "defender") {
      throw new ConflictError(
        "Seule l'équipe défenseuse peut déposer une présentation.",
      );
    }
    return getPresentationFileName({ team, pool, passage });
  }

  throw new ConflictError(`Type de document non géré: ${docType}`);
}

function resolvePoolFromPassage(passage: Passage) {
  const pool = getPools().find((p) => p.id === passage.poolId);
  if (!pool) throw new NotFoundError("Poule", passage.poolId);
  return pool;
}

// ================== Public helper for callers ==================

// Re-export validation result type so callers don't import from two places.
export type { ValidationResult };
