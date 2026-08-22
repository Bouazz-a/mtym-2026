import { useMemo } from "react";
import { PageHeader, BrutalCard, Badge, PageMotion } from "@/features/shared/primitives";
import { useSession } from "@/features/shared/SessionContext";
import { getAnnouncements } from "@/lib/repositories/announcementRepository";
import { canViewAnnouncementAsJury, canViewAnnouncementAsParticipant } from "@/lib/permissions";
import type { Announcement } from "@/types";

export function AnnouncementsPage() {
  const { session } = useSession();
  const items = useMemo<Announcement[]>(() => {
    if (!session) return [];
    const all = getAnnouncements();
    const filtered = all.filter(a => {
      if (session.role === "participant") return canViewAnnouncementAsParticipant(a);
      if (session.role === "jury") return canViewAnnouncementAsJury(a);
      return true;
    });
    filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filtered;
  }, [session]);

  return (
    <PageMotion className="space-y-8">
      <PageHeader
        eyebrow="Annonces"
        title="Communications"
        sub="Informations officielles diffusées par l'équipe d'organisation."
        right={
          <Badge tone="dark">{items.length} annonce{items.length > 1 ? "s" : ""}</Badge>
        }
      />

      {items.length === 0 ? (
        <BrutalCard className="p-10">
          <div className="font-mont mb-1" style={{ fontSize: "1.1rem", color: "var(--forest)", fontWeight: 900 }}>
            Aucune annonce
          </div>
          <div className="font-open text-sm max-w-xl" style={{ color: "var(--ink-soft)" }}>
            Vous serez notifié quand l'équipe d'organisation publiera une communication.
          </div>
        </BrutalCard>
      ) : (
        <div className="space-y-4">
          {items.map(item => <AnnouncementCard key={item.id} item={item} />)}
        </div>
      )}
    </PageMotion>
  );
}

function AnnouncementCard({ item }: { item: Announcement }) {
  return (
    <BrutalCard hoverable className="p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-mont leading-tight"
              style={{ fontSize: "1.25rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.01em" }}>
            {item.title}
          </h3>
          <div className="font-mont text-tiny uppercase tracking-widest mt-1.5"
               style={{ color: "var(--ink-faint)", fontWeight: 700 }}>
            {new Date(item.createdAt).toLocaleString("fr-FR")}
          </div>
        </div>
        <Badge tone={item.audience === "all" ? "dark" : "saffron"}>
          {labelForAudience(item.audience)}
        </Badge>
      </div>
      <p className="font-open text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--ink)" }}>
        {item.body}
      </p>
      {item.attachments.length > 0 && (
        <div className="mt-4 pt-4" style={{ borderTop: "1px dashed var(--border)" }}>
          <div className="font-mont text-tiny uppercase tracking-widest mb-2"
               style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
            Pièces jointes
          </div>
          <ul className="space-y-1">
            {item.attachments.map((att, i) => (
              <li key={i} className="font-mont text-xs" style={{ color: "var(--ink-soft)", fontWeight: 700 }}>
                · {att}
              </li>
            ))}
          </ul>
        </div>
      )}
    </BrutalCard>
  );
}

function labelForAudience(audience: string): string {
  if (audience === "all") return "Tous";
  if (audience === "participants") return "Participants";
  if (audience === "jury") return "Jury";
  return audience;
}
