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
    { to: "/notes", label: "Notes" },
    { to: "/resultats", label: "Résultats" },
    { to: "/comptes", label: "Comptes" },
    { to: "/journal", label: "Journal" },
  ],
  jury: [{ to: "/", label: "Mon planning" }],
};

export const ROLE_LABEL: Record<Role, string> = { admin: "Administration", jury: "Jury" };
