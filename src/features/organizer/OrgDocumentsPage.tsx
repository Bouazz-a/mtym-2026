import { useEffect, useState } from "react";
import { PageHeader, BrutalCard, Badge, Btn, PageMotion } from "@/features/shared/primitives";
import { getTeams } from "@/lib/repositories/teamRepository";
import { getDocuments } from "@/lib/repositories/documentRepository";
import { createDownloadUrl } from "@/lib/storage/fileStorage";
import type { Document, Team } from "@/types";

export function OrgDocumentsPage() {
  const [rows, setRows] = useState<{ team: Team; documents: Document[] }[]>([]);

  useEffect(() => {
    const teams = getTeams().sort((a, b) => a.quadrigramme.localeCompare(b.quadrigramme));
    const allDocs = getDocuments();
    setRows(
      teams.map(team => ({
        team,
        documents: allDocs.filter(d => d.teamId === team.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
      })),
    );
  }, []);

  const total = rows.reduce((acc, r) => acc + r.documents.length, 0);

  return (
    <PageMotion className="space-y-8">
      <PageHeader
        eyebrow="Documents"
        title="Dépôts des équipes"
        sub="Vue agrégée de tous les rapports, fiches et présentations déposés à ce jour."
        right={<Badge tone="dark">{total} fichiers</Badge>}
      />

      <div className="space-y-4">
        {rows.map(({ team, documents }) => (
          <TeamBlock key={team.id} team={team} documents={documents} />
        ))}
      </div>
    </PageMotion>
  );
}

function TeamBlock({ team, documents }: { team: Team; documents: Document[] }) {
  const handleDownload = (doc: Document) => {
    const url = createDownloadUrl(doc.storagePath, doc.mimeType);
    if (!url) return alert("Fichier introuvable.");
    const a = window.document.createElement("a");
    a.href = url;
    a.download = doc.originalName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <BrutalCard className="p-6">
      <div className="flex items-baseline justify-between mb-4 pb-3"
           style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-baseline gap-3">
          <span className="font-mont"
                style={{ color: "var(--saffron)", fontWeight: 900, fontSize: "1.6rem", letterSpacing: "0.05em" }}>
            {team.quadrigramme}
          </span>
          <span className="font-open text-sm" style={{ color: "var(--ink-soft)" }}>{team.name}</span>
        </div>
        <Badge tone={documents.length ? "sage" : "neutral"}>
          {documents.length} fichier{documents.length > 1 ? "s" : ""}
        </Badge>
      </div>

      {documents.length === 0 ? (
        <div className="font-open text-xs italic" style={{ color: "var(--ink-faint)" }}>
          Aucun document déposé.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {documents.map(doc => (
            <div key={doc.id}
                 className="flex items-center justify-between gap-2 px-3 py-2 transition-colors hover-row"
                 style={{ border: "1px solid var(--border)" }}>
              <div className="min-w-0 flex-1">
                <div className="font-mont text-xs truncate"
                     style={{ color: "var(--forest)", fontWeight: 800 }} title={doc.renamedAs}>
                  {doc.renamedAs}
                </div>
                <div className="font-open text-micro mt-0.5" style={{ color: "var(--ink-faint)" }}>
                  {new Date(doc.uploadedAt).toLocaleDateString("fr-FR")}
                  {doc.isLocked && " · 🔒"}
                </div>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => handleDownload(doc)}>↓</Btn>
            </div>
          ))}
        </div>
      )}
    </BrutalCard>
  );
}
