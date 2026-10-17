const apiBaseUrl = process.env.NEXT_PUBLIC_LISA_API_URL ?? "http://127.0.0.1:8008";

export function apiUrl(path: string): string {
  return new URL(path.replace(/^\//, ""), `${apiBaseUrl.replace(/\/$/, "")}/`).toString();
}
