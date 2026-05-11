import type { AppState, UserRole } from "@/types";

export const STORAGE_KEY = "mtym_app_state";

export const INITIAL_STATE: AppState = {
  participants:           [],
  teams:                  [],
  juryMembers:            [],
  organizers:             [],
  pools:                  [],
  passages:               [],
  documents:              [],
  juryAssignments:        [],
  juryPassageAssignments: [],
  criteria:               [],
  reportEvaluations:      [],
  reportGrades:           [],
  oralEvaluations:        [],
  oralGrades:             [],
  workshops:              [],
  workshopPreferences:    [],
  workshopAssignments:    [],
  announcements:          [],
  deadlines:              [],
  currentUserId:          "",
  currentUserRole:        "participant",
};

// For demo purposes only (will delete in real app)
export function getState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(INITIAL_STATE);
  return JSON.parse(raw) as AppState;
}

export function setState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// future auth system would handle this, but for demo purposes we store the current user in the app state
export function getCurrentUser(): { id: string; role: AppState["currentUserRole"] } {
  const s = getState();
  return { id: s.currentUserId, role: s.currentUserRole };
}

export function setCurrentUser(id: string, role: UserRole): void {
  const s = getState();
  setState({ ...s, currentUserId: id, currentUserRole: role });
}

export function getAll<K extends keyof AppState>(key: K): AppState[K] {
  return getState()[key];
}

export function setAll<K extends keyof AppState>(key: K, value: AppState[K]): void {
  const s = getState();
  setState({ ...s, [key]: value });
}