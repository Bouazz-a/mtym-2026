import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, BrutalCard, Btn, Modal } from "./primitives";
import { getReportUrl } from "@/lib/repositories/reportRepository";
import { errorMessage } from "@/lib/services/errors";

// A team's report PDF from the main site's bucket, in two shapes:
//
// - ReportPanel: the report next to the grading grid on a wide screen, so a
//   juror reads and grades at the same time;
// - ReportViewer: a button opening the report in a modal, for narrow screens
//   where there's no room for two columns.
//
// The signed link expires after ten minutes; an already-loaded PDF keeps
// showing, and both shapes can hand it over to a new tab (phone browsers
// often can't embed a PDF at all).
// `src` shows a given file instead (the guide's sample report).

const REPORT_URL_FRESH_MS = 8 * 60 * 1000;

function useReportUrl(reportId: string, src?: string) {
  return useQuery({
    queryKey: ["report-url", reportId],
    queryFn: () => getReportUrl(reportId),
    enabled: !src,
    staleTime: REPORT_URL_FRESH_MS,
    retry: false,
  });
}

const openInTab = (url: string | null) => url && window.open(url, "_blank", "noopener");

export function ReportPanel({ reportId, src, title }: { reportId: string; src?: string; title: string }) {
  const query = useReportUrl(reportId, src);
  const url = src ?? query.data?.url ?? null;

  return (
    <BrutalCard withCorners={false} className="flex flex-col overflow-hidden" style={{ height: "calc(100vh - 7rem)" }}>
      <div
        className="px-4 py-2 flex items-center justify-between gap-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--paper-2)" }}
      >
        <span className="font-mont text-tiny uppercase tracking-widest truncate" style={{ color: "var(--forest)", fontWeight: 900 }}>
          {title}
        </span>
        <Btn variant="ghost" size="sm" disabled={!url} onClick={() => openInTab(url)}>
          Ouvrir dans un onglet
        </Btn>
      </div>
      {query.isError ? (
        <div className="p-4"><Alert>{errorMessage(query.error, "Rapport introuvable.")}</Alert></div>
      ) : url ? (
        <iframe src={url} title={title} className="flex-1 w-full" style={{ border: "none", background: "var(--paper-2)" }} />
      ) : (
        <div className="flex-1 grid place-items-center font-mont text-tiny uppercase tracking-widest" style={{ color: "var(--ink-faint)" }}>
          Ouverture du rapport…
        </div>
      )}
    </BrutalCard>
  );
}

export function ReportViewer({ reportId, src, title }: { reportId: string; src?: string; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      setUrl(src ?? (await getReportUrl(reportId)).url);
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
        width="min(62rem, calc(100vw - 2rem))"
        onClose={() => setUrl(null)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setUrl(null)}>Fermer</Btn>
            <Btn onClick={() => openInTab(url)}>Ouvrir dans un onglet</Btn>
          </>
        }
      >
        {url && (
          <iframe
            src={url}
            title={title}
            style={{ width: "100%", height: "68vh", border: "1px solid var(--border)", background: "var(--paper-2)" }}
          />
        )}
      </Modal>
    </>
  );
}
