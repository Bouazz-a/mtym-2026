import type { Account, Role } from "@/types";
import { apiFetch } from "@/lib/api/client";

export type AccountInput = {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
};

export function getAccounts(role?: Role): Promise<Account[]> {
  return apiFetch<Account[]>("/accounts", { params: { role } });
}

// The generated password is only ever returned here and by resetPassword.
export function createAccount(data: AccountInput): Promise<{ account: Account; password: string }> {
  return apiFetch("/accounts", { method: "POST", body: data });
}

export function updateAccount(id: string, patch: Partial<AccountInput>): Promise<Account> {
  return apiFetch<Account>(`/accounts/${id}`, { method: "PUT", body: patch });
}

export function resetPassword(id: string): Promise<{ password: string }> {
  return apiFetch(`/accounts/${id}/reset-password`, { method: "POST" });
}

export function deleteAccount(id: string): Promise<void> {
  return apiFetch<void>(`/accounts/${id}`, { method: "DELETE" });
}

export function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiFetch<void>("/auth/password", { method: "PUT", body: { currentPassword, newPassword } });
}
