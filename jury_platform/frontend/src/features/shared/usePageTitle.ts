import { useEffect } from "react";

// The browser tab's title — "Résultats · MTYM 2026 · Jury" — so open tabs
// can be told apart. PageHeader sets it for every page.
const APP_TITLE = "MTYM 2026 · Jury";

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_TITLE}` : APP_TITLE;
  }, [title]);
}
