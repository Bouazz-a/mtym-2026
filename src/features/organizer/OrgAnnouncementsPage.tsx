import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  PageHeader, BrutalCard, Badge, DiamondMarker,
  Btn, Field, Input, Textarea, PageMotion, Modal,
} from "@/features/shared/primitives";
import { useSession } from "@/features/shared/SessionContext";
import {
  getAnnouncements, upsertAnnouncement, deleteAnnouncement,
} from "@/lib/repositories/announcementRepository";
import type { Announcement, Audience } from "@/types";

export function OrgAnnouncementsPage() {
  const { session } = useSession();
  const loadItems = () =>
    getAnnouncements().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [items, setItems] = useState<Announcement[]>(loadItems);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [pendingDelete, setPendingDelete] = useState<Announcement | null>(null);

  const refresh = () => setItems(loadItems());

  if (!session || session.role !== "organizer") return null;

  const canPublish = title.trim().length > 0 && body.trim().length > 0;

  const handlePublish = () => {
    upsertAnnouncement({
      id: uuidv4(),
      title: title.trim(),
      body: body.trim(),
      audience,
      attachments: [],
      createdBy: session.organizer.id,
      createdAt: new Date().toISOString(),
    });
    setTitle(""); setBody(""); setAudience("all");
    refresh();
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteAnnouncement(pendingDelete.id);
    setPendingDelete(null);
    refresh();
  };

  return (
    <PageMotion className="space-y-8">
      <PageHeader
        eyebrow="Annonces"
        title="Communications"
        sub="Publier une annonce aux participants, au jury, ou aux deux."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-6">
        {/* Composer */}
        <BrutalCard className="overflow-hidden">
          <div className="px-6 py-4 flex items-center gap-2"
               style={{ borderBottom: "2px solid var(--forest)" }}>
            <DiamondMarker />
            <h2 className="font-mont uppercase tracking-tight"
                style={{ fontSize: "1.05rem", color: "var(--forest)", fontWeight: 900 }}>
              Nouvelle annonce
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <Field label="Titre">
              <Input value={title} onChange={e => setTitle(e.target.value)}
                     placeholder="Ex : Décalage de la deadline RI" />
            </Field>
            <Field label="Message">
              <Textarea value={body} onChange={e => setBody(e.target.value)} rows={6}
                        placeholder="Contenu détaillé…" />
            </Field>
            <Field label="Audience">
              <div className="flex gap-2">
                {(["all", "participants", "jury"] as Audience[]).map(a => {
                  const active = audience === a;
                  return (
                    <button
                      key={a}
                      onClick={() => setAudience(a)}
                      className="px-3 py-1.5 font-mont text-tiny uppercase tracking-widest transition-all"
                      style={{
                        background: active ? "var(--saffron)" : "transparent",
                        color: active ? "var(--forest)" : "var(--ink-soft)",
                        border: `2px solid ${active ? "var(--forest)" : "var(--border)"}`,
                        boxShadow: active ? "2px 2px 0 0 var(--forest)" : "none",
                        fontWeight: active ? 800 : 700,
                      }}
                    >
                      {labelForAudience(a)}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Btn onClick={handlePublish} disabled={!canPublish} className="w-full">
              Publier
            </Btn>
          </div>
        </BrutalCard>

        {/* Feed */}
        <div>
          {items.length === 0 ? (
            <BrutalCard className="p-8" style={{ border: "2px dashed var(--border)", boxShadow: "none" }} withCorners={false}>
              <div className="font-open text-sm" style={{ color: "var(--ink-faint)" }}>
                Aucune annonce pour l'instant.
              </div>
            </BrutalCard>
          ) : (
            <div className="space-y-3">
              {items.map(item => (
                <BrutalCard key={item.id} hoverable className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <h3 className="font-mont leading-tight"
                          style={{ fontSize: "1.05rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.01em" }}>
                        {item.title}
                      </h3>
                      <div className="font-mont text-micro uppercase tracking-widest mt-1"
                           style={{ color: "var(--ink-faint)", fontWeight: 700 }}>
                        {new Date(item.createdAt).toLocaleString("fr-FR")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge tone={item.audience === "all" ? "dark" : "saffron"}>
                        {labelForAudience(item.audience)}
                      </Badge>
                      <button
                        onClick={() => setPendingDelete(item)}
                        className="font-mont text-xs px-1.5"
                        style={{ color: "var(--ink-faint)", fontWeight: 800 }}
                        aria-label="Supprimer"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <p className="font-open text-xs leading-relaxed whitespace-pre-wrap"
                     style={{ color: "var(--ink-soft)" }}>
                    {item.body}
                  </p>
                </BrutalCard>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Supprimer cette annonce ?"
        width={460}
        footer={
          <>
            <button
              className="btn-brutal btn-brutal--ghost"
              onClick={() => setPendingDelete(null)}
            >
              Annuler
            </button>
            <button
              className="btn-brutal"
              onClick={confirmDelete}
              style={{
                background: "var(--clay)",
                color: "var(--paper)",
                borderColor: "var(--clay)",
              }}
            >
              Supprimer
            </button>
          </>
        }
      >
        <p
          className="font-mont text-sm"
          style={{ color: "var(--ink)", lineHeight: 1.6 }}
        >
          L'annonce{" "}
          <strong style={{ color: "var(--forest)" }}>
            « {pendingDelete?.title} »
          </strong>{" "}
          sera définitivement retirée. Cette action est irréversible.
        </p>
      </Modal>
    </PageMotion>
  );
}

function labelForAudience(audience: Audience): string {
  if (audience === "all") return "Tous";
  if (audience === "participants") return "Participants";
  return "Jury";
}
