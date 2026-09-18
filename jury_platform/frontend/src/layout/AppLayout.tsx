import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { TopNav } from "./TopNav";
import { BackgroundFX } from "./BackgroundFX";
import { SiteFooter } from "./SiteFooter";

// AppLayout — fixed top nav over a full-width canvas. The page atmosphere
// (paper tone + grain overlay) is provided by the app shell in index.css.

export function AppLayout() {
  const location = useLocation();
  return (
    <div
      className="min-h-screen flex flex-col app-shell"
      style={{ color: "var(--ink)", fontFamily: "'Open Sans', sans-serif" }}
    >
      <BackgroundFX />
      <TopNav />
      <main className="flex-1 pt-16 w-full max-w-[1400px] mx-auto px-6 lg:px-12 py-10 relative">
        <AnimatePresence mode="wait" initial={false}>
          {/* The route's pathname keys the outlet so framer-motion can
              animate the page in/out across navigations. */}
          <div key={location.pathname}>
            <Outlet />
          </div>
        </AnimatePresence>
      </main>
      <SiteFooter />
    </div>
  );
}
