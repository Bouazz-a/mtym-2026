import { useEffect, useState } from "react";
import { Modal, Btn } from "./primitives";
import { downloadDocument } from "@/lib/repositories/documentRepository";
import type { Document } from "@/types";

// DocPreview — shared modal that renders a stored document inline. PDFs
// (the primary case) are embedded via <iframe>; images via <img>. Anything
// else falls back to a download CTA. Used wherever a download button
// appears so users can skim a file before pulling it down.
//
// The file bytes come from the real backend now (a fetch-with-auth-header,
// see downloadDocument in documentRepository.ts) instead of the old fake
// base64-in-localStorage store, so opening a preview is an async network
// call rather than an instant lookup.

interface PreviewState {
  doc: Document;
  url: string;
}

export function useDocPreview() {
  const [state, setState] = useState<PreviewState | null>(null);
  const [loading, setLoading] = useState(false);

  const open = async (doc: Document) => {
    setLoading(true);
    try {
      const { url } = await downloadDocument(doc.id, doc.originalName);
      setState({ doc, url });
    } catch {
      alert("Fichier introuvable.");
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    if (state) URL.revokeObjectURL(state.url);
    setState(null);
  };

  // Safety net: revoke the URL if the consumer unmounts mid-preview.
  useEffect(() => {
    return () => {
      if (state) URL.revokeObjectURL(state.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, open, close, loading };
}

export function DocPreviewModal({
  state,
  onClose,
}: {
  state: { doc: Document; url: string } | null;
  onClose: () => void;
}) {
  if (!state) return null;
  const { doc, url } = state;
  const isPdf = doc.mimeType === "application/pdf" || /\.pdf$/i.test(doc.originalName);
  const isImage = doc.mimeType.startsWith("image/");

  const handleDownload = () => {
    const a = window.document.createElement("a");
    a.href = url;
    a.download = doc.originalName;
    a.click();
  };

  return (
    <Modal
      open
      title={doc.originalName}
      width={Math.min(typeof window !== "undefined" ? window.innerWidth - 80 : 960, 960)}
      onClose={onClose}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Fermer
          </Btn>
          <Btn onClick={handleDownload}>↓ Télécharger</Btn>
        </>
      }
    >
      {isPdf ? (
        <iframe
          src={url}
          title={doc.originalName}
          style={{
            width: "100%",
            height: "75vh",
            border: "1px solid var(--border)",
            background: "var(--paper-2)",
          }}
        />
      ) : isImage ? (
        <img
          src={url}
          alt={doc.originalName}
          style={{
            display: "block",
            maxWidth: "100%",
            maxHeight: "75vh",
            margin: "0 auto",
          }}
        />
      ) : (
        <div
          className="font-open text-sm p-8 text-center"
          style={{ color: "var(--ink-soft)" }}
        >
          Aperçu non disponible pour ce type de fichier. Téléchargez-le
          pour le consulter.
        </div>
      )}
    </Modal>
  );
}
