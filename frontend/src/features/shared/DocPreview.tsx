import { useEffect, useState } from "react";
import { Modal, Btn } from "./primitives";
import { createDownloadUrl } from "@/lib/storage/fileStorage";
import type { Document } from "@/types";

// DocPreview — shared modal that renders a stored document inline. PDFs
// (the primary case) are embedded via <iframe>; images via <img>. Anything
// else falls back to a download CTA. Used wherever a download button
// appears so users can skim a file before pulling it down.

interface PreviewState {
  doc: Document;
  url: string;
}

export function useDocPreview() {
  const [state, setState] = useState<PreviewState | null>(null);

  const open = (doc: Document) => {
    const url = createDownloadUrl(doc.storagePath, doc.mimeType);
    if (!url) {
      alert("Fichier introuvable.");
      return;
    }
    setState({ doc, url });
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

  return { state, open, close };
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
