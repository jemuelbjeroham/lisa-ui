"use client";

let apiBaseUrlPromise: Promise<string> | undefined;

export function getApiBaseUrl(): Promise<string> {
  apiBaseUrlPromise ??= fetch("/api/runtime-config", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Unable to load API configuration (${response.status})`);
      }

      const config: unknown = await response.json();
      if (
        !config ||
        typeof config !== "object" ||
        !("apiUrl" in config) ||
        typeof config.apiUrl !== "string"
      ) {
        throw new Error("The API configuration response is invalid");
      }

      const url = new URL(config.apiUrl);
      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error("The configured API URL is invalid");
      }

      return url.toString().replace(/\/$/, "");
    })
    .catch((error: unknown) => {
      apiBaseUrlPromise = undefined;
      throw error;
    });

  return apiBaseUrlPromise;
}
