import { Suspense, useLayoutEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { PageLoading } from "@/features/shared/primitives";
import { TopNav } from "./TopNav";
import { BackgroundFX } from "./BackgroundFX";
import { SiteFooter } from "./SiteFooter";

// AppLayout — fixed top nav over a full-width canvas. The page atmosphere
// (paper tone + grain overlay) is provided by the app shell in index.css.
//
// Moving between pages: the new page opens at its top and fades in
// (PageMotion) while the old one leaves at once. Its code is usually
// already there (App.tsx fetches every page's in the background); if not,
// the page area alone waits (Suspense), never the top bar and footer.

export function AppLayout() {
  const { pathname } = useLocation();
  // A new page starts at its top; a filter changing the URL's query stays put
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return (
    <div
      className="min-h-screen flex flex-col app-shell"
      style={{ color: "var(--ink)", fontFamily: "'Open Sans', sans-serif" }}
    >
      {/* Keyboard users skip the top bar straight to the page */}
      <a href="#contenu" className="skip-link">Aller au contenu</a>
      <BackgroundFX />
      <TopNav />
      <main id="contenu" tabIndex={-1} className="flex-1 pt-16 shell py-10 relative" style={{ outline: "none" }}>
        <Suspense fallback={<PageLoading />}>
          {/* Keyed by the page: a new page mounts afresh and plays its entrance */}
          <div key={pathname}>
            <Outlet />
          </div>
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
