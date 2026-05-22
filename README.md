<h1 align="center">MTYM 2026 Platform</h1>

![MTYM logo](./src/assets/MTYM2.svg)


Management platform for the **MTYM** tournament (Moroccan Tournament of Young
Mathematicians): document upload, tournament scheduling, jury grading, and
automated assignment of pools, passages and workshops.

> **Demo application.** There is no real authentication or database: the
> entire state is stored in the browser's `localStorage` and the current user
> is switched directly in the interface.

---

## Table of Contents

- [MTYM 2026 Platform](#mtym-2026-platform)
  - [Table of Contents](#table-of-contents)
  - [Tech Stack](#tech-stack)
  - [Prerequisites](#prerequisites)
  - [Local Installation and Startup](#local-installation-and-startup)
  - [npm Scripts](#npm-scripts)
  - [Layered Architecture](#layered-architecture)
  - [Project Structure](#project-structure)
  - [Demo Data and Roles](#demo-data-and-roles)
  - [Testing the Application Locally](#testing-the-application-locally)
  - [Key Algorithms](#key-algorithms)

---

## Tech Stack

| Area | Technology |
|---------|-------------|
| Build / dev server | Vite |
| UI framework | React 19 + TypeScript |
| Routing | React Router |
| Styles | Tailwind CSS + shadcn/ui design system |
| Animations | Framer Motion |
| Icons | lucide-react |
| Tests | Vitest |
| Storage (demo) | browser `localStorage` |

---

## Prerequisites

- **Node.js ≥ 20** and **npm** (Vite 8 requires a recent version of Node).
- A modern browser.

---

## Local Installation and Startup

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev
```

Vite prints a local URL (by default <http://localhost:5173>). On the
**first visit**, `localStorage` is empty: the application automatically runs
`seedDemoData()` to create a complete demo dataset (participants, teams, jury,
organizers, pools, passages…).

> To start fresh: clear the site's `localStorage` (DevTools =>  Application => Local Storage => delete the `mtym_*` keys) then reload.

---

## npm Scripts

| Command | Effect |
|----------|-------|
| `npm run dev` | Development server with hot reload. |
| `npm run build` | TypeScript check (`tsc -b`) then production build. |
| `npm run preview` | Serves the production build locally. |
| `npm run lint` | ESLint static analysis. |
| `npx vitest` | Runs the test runner (Vitest is configured; no tests written yet). |

---

## Layered Architecture

The code follows a strict layered architecture: each layer only depends on the
ones below it.

```
  types/          <= data contracts (TypeScript interfaces)
     ▲
  lib/storage/    <= raw persistence in localStorage (AppState)
     ▲
  lib/repositories/  <= typed entity access (CRUD per collection)
     ▲
  lib/services/   <= business logic (permissions, algorithms, validation)
     ▲
  features/ + layout/  <= React interface (pages, navigation)
```

- **`types/`** : the single source of truth for the data model. Every entity (team, passage, document, evaluation…) is described here.
- **`lib/storage/`** : reads/writes the global `AppState` object in `localStorage`.
- **`lib/repositories/`** : one function per CRUD operation and per collection (`getTeams` ,`upsertPassage`, `deleteDocument`…). Upper layers never touch `localStorage` directly.
- **`lib/services/`** : business orchestration: permission checks, tournament generation, jury assignment, document upload.
- **`features/` + `layout/`** : the React layer, which consumes the services and repositories via the `useSession()` hook.

---

## Project Structure

```
mtym-2026/
├── index.html               HTML entry point
├── vite.config.ts           Vite config + "@" alias → src/
├── tailwind.config.js       Tailwind theme
├── components.json          shadcn/ui design system config
├── tsconfig*.json            TypeScript configuration
│
└── src/
    ├── main.tsx             Bootstrap: seeds data then mounts React
    ├── App.tsx              Route tree + role-based guards
    ├── index.css            Global theme (color tokens, app-shell)
    │
    ├── types/
    │   └── index.ts         All data model interfaces
    │
    ├── lib/
    │   ├── storage/
    │   │   ├── storage.ts   Reads/writes the AppState (localStorage)
    │   │   ├── fileStorage.ts  Fake file storage (base64)
    │   │   ├── seed.ts      Demo dataset
    │   │   └── index.ts     Re-exports the repositories
    │   │
    │   ├── repositories/    Typed CRUD access, one per collection
    │   │   ├── participantRepository.ts
    │   │   ├── teamRepository.ts
    │   │   ├── juryRepository.ts
    │   │   ├── organizerRepository.ts
    │   │   ├── poolRepository.ts
    │   │   ├── documentRepository.ts
    │   │   ├── evaluationRepository.ts
    │   │   ├── workshopRepository.ts
    │   │   └── announcementRepository.ts
    │   │
    │   ├── services/        Business logic
    │   │   ├── session.ts             Per-role session type
    │   │   ├── errors.ts              Business errors (Forbidden, Conflict…)
    │   │   ├── documentUploadService.ts  Document upload
    │   │   ├── juryAssignmentService.ts  Jury assignment
    │   │   └── tournamentOptimizer.ts    Pool/passage generation
    │   │
    │   ├── permissions.ts   Access rules (who can do what)
    │   └── utils.ts         cn() helper for Tailwind classes
    │
    ├── utils/               Reusable pure functions
    │   ├── naming.ts        Display labels (FR)
    │   ├── sanitize.ts      Builds pool/passage labels
    │   ├── fileNaming.ts    Normalized naming for uploaded files
    │   ├── validation.ts    Validation (email, quadrigramme, files…)
    │   └── dateTime.ts      Date/time formatting
    │
    ├── components/ui/       shadcn/ui primitives (button, card, table…)
    │
    ├── layout/              Application shell
    │   ├── AppLayout.tsx    Shell: fixed nav + animated content area
    │   ├── TopNav.tsx       Role-adaptive navigation bar
    │   ├── RoleGuard.tsx    Per-role route guard
    │   └── BackgroundFX.tsx Decorative particle canvas
    │
    └── features/            Pages per audience
        ├── shared/
        │   ├── SessionContext.tsx  Session provider + useSession()
        │   ├── primitives.tsx      Animation/layout primitives
        │   └── widgets.tsx         Logo, domain helpers
        ├── participant/    Journey, Documents, Passage, Profile, Announcements
        ├── jury/           Dashboard, Passages, Teams, Team detail
        └── organizer/      Dashboard, Tournament, Teams, Jury,
                            Administration, Documents, Announcements
```

---

## Demo Data and Roles

The application has three roles: **participant**, **jury** and
**organizer**. There is no login: `SessionProvider` (`features/shared/SessionContext.tsx`) holds the active role and the selected user, persisted in `localStorage`:

- **quick role switch** : switches to the first account of that role;
- **account picker** : pins a specific demo account.

Routing applies access control at the route level via `RoleGuard`: a participant route is genuinely inaccessible in organizer mode, and vice versa. The `/` route shows a different dashboard depending on the role.

---

## Testing the Application Locally

1. `npm install` then `npm run dev`, open the local URL.
2. On the first launch, the demo dataset is created automatically.
3. Use the **account picker** in the navigation bar (top right) to switch between participant / jury / organizer and observe the pages and permissions specific to each role.
4. As an organizer, you can generate the pools and passages
   (**Tournament** page) then the jury assignment (**Jury** page).
5. To reset: clear the `mtym_*` keys from `localStorage` and reload.
6. Pre-commit checks: `npm run lint` and `npm run build`.

---

## Key Algorithms

Two services concentrate the tournament's algorithmic logic:

- **`tournamentOptimizer.ts`** : generates the pools and passages for both rounds.
  Round 2 is solved as a minimum-cost assignment problem (Hungarian algorithm) iterated over every Latin square, in *best-effort* mode: it never throws an error and publishes a report of the residual constraints.
- **`juryAssignmentService.ts`** : evenly distributes the jury's grading
  workload (written reports + oral passages) across the jurors.
