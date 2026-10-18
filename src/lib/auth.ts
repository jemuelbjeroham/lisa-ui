
import { apiRequest } from "./api-client";

export interface CurrentUser {
  id: string;
  display_name: string | null;
  email: string;
  is_admin: boolean;
}

interface LoginResponse {
  message: string;
}

interface LogoutResponse {
  message: string;
}

export async function login(
  email: string,
  password: string,
): Promise<void> {
  await apiRequest<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<void> {
  await apiRequest<LogoutResponse>("/api/v1/auth/logout", {
    method: "POST",
  });
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>("/api/v1/auth/me");
}
