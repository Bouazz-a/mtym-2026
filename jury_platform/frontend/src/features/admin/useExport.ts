import { useState } from "react";
import { errorMessage } from "@/lib/services/errors";

// An xlsx export button's state: busy while the file is built, and the
// error to show when it fails.
export function useExport(task: () => unknown) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(errorMessage(err, "Export impossible."));
    } finally {
      setBusy(false);
    }
  };

  return { run, busy, error };
}
