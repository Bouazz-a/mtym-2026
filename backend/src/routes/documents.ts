import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "../db";
import { config } from "../config";
import { authenticate, requireRole, requireOrganizerRole } from "../middleware/auth";
import { ForbiddenError, NotFoundError } from "../utils/errors";

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    cb(null, config.uploadsDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

const VALID_DOC_TYPES = [
  "rapport_intermediaire",
  "rapport_final_p1", "rapport_final_p2", "rapport_final_p3", "rapport_final_p4",
  "fiche_synthese_opposant_1", "fiche_synthese_rapporteur_1",
  "fiche_synthese_opposant_2", "fiche_synthese_rapporteur_2",
  "presentation_1", "presentation_2",
] as const;

// GET /api/documents?teamId=&docType=
router.get("/", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    const { teamId, docType } = req.query as Record<string, string | undefined>;

    // Participants only see their team's docs
    if (user.role === "participant" && teamId && teamId !== user.teamId) {
      throw new ForbiddenError();
    }

    const where = {
      ...(user.role === "participant" ? { teamId: user.teamId } : teamId ? { teamId } : {}),
      ...(docType ? { docType } : {}),
    };

    const docs = await db.document.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
    });

    // Jury sees only docs of their assigned teams
    if (user.role === "jury") {
      const assignments = await db.juryAssignment.findMany({
        where: { juryMemberId: user.id },
      });
      const assignedTeamIds = new Set(assignments.map((a) => a.teamId));
      res.json(docs.filter((d) => assignedTeamIds.has(d.teamId)));
      return;
    }

    res.json(docs);
  } catch (err) { next(err); }
});

// POST /api/documents — upload file
router.post("/", authenticate, upload.single("file"), async (req, res, next) => {
  try {
    const user = req.user!;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const { docType, teamId } = z.object({
      docType: z.enum(VALID_DOC_TYPES),
      teamId: z.string().uuid(),
    }).parse(req.body);

    // Permission: participants can only upload for their team, and must be team creator
    if (user.role === "participant") {
      if (teamId !== user.teamId) throw new ForbiddenError();
      const team = await db.team.findUnique({ where: { id: teamId } });
      if (!team || team.creatorId !== user.id) throw new ForbiddenError("Only the team creator can upload documents");
    } else if (user.role === "organizer") {
      if (user.organizerRole !== "admin") throw new ForbiddenError();
    } else {
      throw new ForbiddenError();
    }

    // Check if existing doc of this type for this team is locked
    const existing = await db.document.findFirst({ where: { teamId, docType } });
    if (existing?.isLocked) {
      fs.unlinkSync(file.path);
      res.status(409).json({ error: "Document is locked and cannot be replaced" });
      return;
    }

    // Remove old file if replacing
    if (existing) {
      await db.document.delete({ where: { id: existing.id } });
      const oldPath = existing.storagePath;
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const doc = await db.document.create({
      data: {
        docType,
        teamId,
        uploadedById: user.id,
        originalName: file.originalname,
        renamedAs: file.filename,
        storagePath: file.path,
        size: file.size,
        mimeType: file.mimetype,
        uploadedAt: new Date().toISOString(),
        isLocked: false,
      },
    });

    res.status(201).json(doc);
  } catch (err) { next(err); }
});

// GET /api/documents/:id/download
router.get("/:id/download", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    const doc = await db.document.findUnique({ where: { id: req.params.id } });
    if (!doc) throw new NotFoundError("Document not found");

    // Permission checks
    if (user.role === "participant" && doc.teamId !== user.teamId) {
      throw new ForbiddenError();
    }
    if (user.role === "jury") {
      const assigned = await db.juryAssignment.findFirst({
        where: { juryMemberId: user.id, teamId: doc.teamId },
      });
      if (!assigned) throw new ForbiddenError();
    }

    if (!fs.existsSync(doc.storagePath)) throw new NotFoundError("File not found on disk");
    res.download(doc.storagePath, doc.originalName);
  } catch (err) { next(err); }
});

// PUT /api/documents/:id/lock — toggle lock (admin only)
router.put(
  "/:id/lock",
  authenticate,
  requireRole("organizer"),
  requireOrganizerRole("admin"),
  async (req, res, next) => {
    try {
      const doc = await db.document.findUnique({ where: { id: req.params.id } });
      if (!doc) throw new NotFoundError("Document not found");
      const { locked } = z.object({ locked: z.boolean() }).parse(req.body);
      const updated = await db.document.update({ where: { id: doc.id }, data: { isLocked: locked } });
      res.json(updated);
    } catch (err) { next(err); }
  },
);

// DELETE /api/documents/:id — admin only
router.delete(
  "/:id",
  authenticate,
  requireRole("organizer"),
  requireOrganizerRole("admin"),
  async (req, res, next) => {
    try {
      const doc = await db.document.findUnique({ where: { id: req.params.id } });
      if (!doc) throw new NotFoundError("Document not found");
      await db.document.delete({ where: { id: doc.id } });
      if (fs.existsSync(doc.storagePath)) fs.unlinkSync(doc.storagePath);
      res.status(204).send();
    } catch (err) { next(err); }
  },
);

export default router;
