import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { authenticate, requireRole, requireOrganizerRole } from "../middleware/auth";
import { NotFoundError } from "../utils/errors";

const router = Router();

const adminOnly = [authenticate, requireRole("organizer"), requireOrganizerRole("admin")];

const AnnouncementSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  audience: z.enum(["all", "participants", "jury"]),
  attachments: z.array(z.string()).default([]),
});

// GET /api/announcements
router.get("/", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    const all = await db.announcement.findMany({ orderBy: { createdAt: "desc" } });
    if (user.role === "organizer") { res.json(all); return; }
    res.json(all.filter((a) =>
      a.audience === "all" ||
      (user.role === "participant" && a.audience === "participants") ||
      (user.role === "jury" && a.audience === "jury"),
    ));
  } catch (err) { next(err); }
});

// POST /api/announcements
router.post("/", ...adminOnly, async (req, res, next) => {
  try {
    res.status(201).json(await db.announcement.create({
      data: { ...AnnouncementSchema.parse(req.body), createdBy: req.user!.id, createdAt: new Date().toISOString() },
    }));
  } catch (err) { next(err); }
});

// PUT /api/announcements/:id
router.put("/:id", ...adminOnly, async (req, res, next) => {
  try {
    const a = await db.announcement.findUnique({ where: { id: req.params.id } });
    if (!a) throw new NotFoundError("Announcement not found");
    res.json(await db.announcement.update({ where: { id: a.id }, data: AnnouncementSchema.partial().parse(req.body) }));
  } catch (err) { next(err); }
});

// DELETE /api/announcements/:id
router.delete("/:id", ...adminOnly, async (req, res, next) => {
  try {
    const a = await db.announcement.findUnique({ where: { id: req.params.id } });
    if (!a) throw new NotFoundError("Announcement not found");
    await db.announcement.delete({ where: { id: a.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
