import { PageHeader, BrutalCard, DiamondMarker, PageMotion } from "@/features/shared/primitives";
import { useSession } from "@/features/shared/SessionContext";

// ProfilPage — strictly read-only. Participant data is imported by
// organizers and not editable from this view.

export function ProfilPage() {
  const { session } = useSession();
  if (!session || session.role !== "participant") return null;
  const p = session.participant;

  return (
    <PageMotion className="space-y-8">
      <PageHeader
        eyebrow={`${session.team.quadrigramme} · Profil`}
        title={`${p.firstName} ${p.lastName}`}
        sub="Vos informations personnelles importées depuis l'inscription. Pour toute modification, contactez l'équipe d'organisation."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Contact">
          <Row label="Email" value={p.email} mono />
          <Row label="Téléphone" value={p.phone} />
          <Row label="Ville" value={p.city} />
          <Row label="Région" value={p.region} />
        </Panel>

        <Panel title="Scolarité & Logistique">
          <Row label="Niveau" value={p.schoolLevel} />
          <Row label="Date de naissance" value={p.birthDate} />
          <Row label="Transport" value={p.transportInfo} />
          <Row label="Taille hoodie" value={p.hoodieSize} />
        </Panel>

        {p.healthInfo && Object.keys(p.healthInfo).length > 0 && (
          <div className="lg:col-span-2">
            <Panel title="Informations santé">
              {Object.entries(p.healthInfo).map(([k, v]) => (
                <Row key={k} label={k} value={v} />
              ))}
            </Panel>
          </div>
        )}
      </div>
    </PageMotion>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <BrutalCard className="overflow-hidden">
      <div className="px-6 py-4 flex items-center gap-2"
           style={{ borderBottom: "2px solid var(--forest)" }}>
        <DiamondMarker />
        <h2 className="font-mont uppercase tracking-tight"
            style={{ fontSize: "1.05rem", color: "var(--forest)", fontWeight: 900 }}>
          {title}
        </h2>
      </div>
      <div className="p-6 space-y-4">{children}</div>
    </BrutalCard>
  );
}

function Row({ label, value, mono }: { label: string; value: string | undefined; mono?: boolean }) {
  return (
    <div>
      <div className="font-mont text-tiny uppercase tracking-widest mb-1"
           style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
        {label}
      </div>
      {value ? (
        <div className={mono ? "font-mont text-sm" : "font-open text-sm"}
             style={{ color: "var(--forest)", fontWeight: 700 }}>
          {value}
        </div>
      ) : (
        <div className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
          Non renseigné
        </div>
      )}
    </div>
  );
}
