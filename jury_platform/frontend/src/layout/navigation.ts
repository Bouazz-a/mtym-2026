import type { Role } from "@/types";

// Pages reachable by each role — shared by the top nav and the footer.

export interface NavItem {
  to: string;
  label: string;
}

export const NAV: Record<Role, NavItem[]> = {
  admin: [
    { to: "/", label: "Tableau de bord" },
    { to: "/tournoi", label: "Tournoi" },
    { to: "/jury", label: "Jury" },
    { to: "/criteres", label: "Critères" },
  ],
  jury: [{ to: "/", label: "Tableau de bord" }],
};

export const ROLE_LABEL: Record<Role, string> = { admin: "Administration", jury: "Jury" };
