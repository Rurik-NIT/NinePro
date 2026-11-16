import { googleProvider } from "./google.js";
import { linkedinProvider } from "./linkedin.js";
import { metaProvider } from "./meta.js";
import { tiktokProvider } from "./tiktok.js";
import type { PlatformId, Provider } from "./types.js";

export const PROVIDERS: Record<PlatformId, Provider> = { meta: metaProvider, google: googleProvider, tiktok: tiktokProvider, linkedin: linkedinProvider };
export const isPlatform = (p: unknown): p is PlatformId => typeof p === "string" && p in PROVIDERS;
export * from "./types.js";
