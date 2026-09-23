import { Btn } from "@/features/shared/primitives";
import { DownloadIcon } from "@/features/shared/icons";

// The pages' "Exporter (xlsx)" button, driven by useExport.
export function ExportButton({
  label = "Exporter (xlsx)",
  run,
  busy,
  disabled = false,
  title,
}: {
  label?: string;
  run: () => void;
  busy: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Btn onClick={run} disabled={busy || disabled} title={title}>
      <DownloadIcon size="0.95rem" /> {busy ? "Export…" : label}
    </Btn>
  );
}
