import type { Account, AuthUser, Role } from "@/types";
import { apiFetch } from "@/lib/api/client";

export type AccountInput = {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
  isJuror?: boolean; // an admin who also judges (a jury account always does)
};

export function getAccounts(role?: Role): Promise<Account[]> {
  return apiFetch<Account[]>("/accounts", { params: { role } });
}

// What became of the email carrying a password the admin is shown
export interface EmailOutcome {
  emailed: boolean;
  emailError?: string; // why it didn't leave (none when email isn't set up)
}

// Whether emails can leave the server (SMTP settings, or the local outbox)
export function getMailStatus(): Promise<{ configured: boolean }> {
  return apiFetch("/accounts/mail");
}

// The generated password is only ever returned here and by resetPassword.
// `sendCredentials`: also email it to the account.
export function createAccount(
  data: AccountInput & { sendCredentials?: boolean },
): Promise<{ account: Account; password: string } & EmailOutcome> {
  return apiFetch("/accounts", { method: "POST", body: data });
}

export function updateAccount(id: string, patch: Partial<AccountInput>): Promise<Account> {
  return apiFetch<Account>(`/accounts/${id}`, { method: "PUT", body: patch });
}

// A new password, also emailed to the account when email can leave
export function resetPassword(id: string): Promise<{ password: string } & EmailOutcome> {
  return apiFetch(`/accounts/${id}/reset-password`, { method: "POST" });
}

// A new password, emailed and never shown (fails, changing nothing, when
// the email can't leave)
export function sendCredentials(id: string): Promise<{ credentialsSentAt: string }> {
  return apiFetch(`/accounts/${id}/send-credentials`, { method: "POST" });
}

export function deleteAccount(id: string): Promise<void> {
  return apiFetch<void>(`/accounts/${id}`, { method: "DELETE" });
}

export function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiFetch<void>("/auth/password", { method: "PUT", body: { currentPassword, newPassword } });
}

// « Mot de passe oublié »: the server answers the same whether or not the
// address has an account
export function requestPasswordReset(email: string): Promise<void> {
  return apiFetch<void>("/auth/forgot-password", { method: "POST", body: { email } });
}

// The link's token sets the new password; the account is then signed in
export function resetPasswordWithLink(token: string, newPassword: string): Promise<{ token: string; user: AuthUser }> {
  return apiFetch("/auth/reset-password", { method: "POST", body: { token, newPassword } });
}
