export type AuthUser = {
  id: string;
  email: string;
  name?: string;
};

export const AUTH_PROVIDER_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_AUTH_URL && process.env.NEXT_PUBLIC_AUTH_KEY,
);

export function getAuthConfiguration() {
  return {
    configured: AUTH_PROVIDER_CONFIGURED,
    url: process.env.NEXT_PUBLIC_AUTH_URL ?? null,
  };
}
