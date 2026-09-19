import { useState } from "react";
import { Alert, Btn, Modal } from "./primitives";
import { getReportUrl } from "@/lib/repositories/reportRepository";
import { errorMessage } from "@/lib/services/errors";

// Opens a team's report PDF from the main site's bucket. The signed link
// is fetched on click (it expires after 10 minutes) and shown in a modal,
// with a new-tab link for phones, whose browsers often can't embed PDFs.

export function ReportViewer({ reportId, title }: { reportId: string; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      setUrl((await getReportUrl(reportId)).url);
    } catch (err) {
      setError(errorMessage(err, "Rapport introuvable."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Btn variant="forest" size="sm" onClick={open} disabled={busy}>
        {busy ? "Ouverture…" : "Voir le rapport (PDF)"}
      </Btn>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <Modal
        open={url !== null}
        title={title}
        width="min(1000px, calc((100vw - 32px) / var(--zoom)))"
        onClose={() => setUrl(null)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setUrl(null)}>Fermer</Btn>
            <Btn onClick={() => url && window.open(url, "_blank", "noopener")}>Ouvrir dans un onglet</Btn>
          </>
        }
      >
        {url && (
          <iframe
            src={url}
            title={title}
            style={{ width: "100%", height: "calc(68vh / var(--zoom))", border: "1px solid var(--border)", background: "var(--paper-2)" }}
          />
        )}
      </Modal>
    </>
  );
}
