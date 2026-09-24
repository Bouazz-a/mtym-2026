import type { Role } from "@/types";

// Pages reachable by each role — shared by the top nav and the footer.
// A menu gathers several pages under one entry of the top bar, in sections
// (titled when there are several).

export interface NavItem {
  to: string;
  label: string;
  description?: string; // shown under the label in the top-nav dropdown
}

export interface NavMenu {
  label: string;
  sections: { title?: string; items: NavItem[] }[];
}

export type NavEntry = NavItem | NavMenu;

export const isNavMenu = (entry: NavEntry): entry is NavMenu => "sections" in entry;

// Every page of the entries, menus flattened in order (the footer's list)
export function navPages(entries: NavEntry[]): NavItem[] {
  return entries.flatMap((e) => (isNavMenu(e) ? e.sections.flatMap((s) => s.items) : [e]));
}

// Whether `to` is the page shown at `pathname` ("/" only matches itself)
export function isCurrentPage(to: string, pathname: string): boolean {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

export const NAV: Record<Role, NavEntry[]> = {
  admin: [
    { to: "/", label: "Tableau de bord" },
    {
      label: "Gestion du tournoi",
      sections: [
        {
          title: "Logistique",
          items: [
            { to: "/tournoi", label: "Génération des poules", description: "Jours, équipes et tirage des poules" },
            { to: "/jury", label: "Affectation du jury", description: "Duos du jour et passages à juger" },
            { to: "/rapports", label: "Affectation des rapports", description: "Rapports à corriger par chaque juré" },
          ],
        },
        {
          title: "Scientifique",
          items: [
            { to: "/criteres", label: "Critères de notation", description: "Grilles de notation et coefficients" },
            { to: "/notes", label: "Notes", description: "Notes du jury, passage par passage" },
            { to: "/resultats", label: "Résultats", description: "Note finale de chaque équipe" },
          ],
        },
      ],
    },
    {
      label: "Administration",
      sections: [
        {
          items: [
            { to: "/comptes", label: "Comptes", description: "Jurés et administrateurs" },
            { to: "/journal", label: "Journal", description: "Historique des modifications" },
          ],
        },
      ],
    },
  ],
  jury: [
    { to: "/", label: "Mon planning" },
    { to: "/mes-rapports", label: "Mes rapports" },
  ],
};

export const ROLE_LABEL: Record<Role, string> = { admin: "Administration", jury: "Jury" };
