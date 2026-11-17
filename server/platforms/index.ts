import { googleProvider } from "./google.js";
import { instagramProvider } from "./instagram.js";
import { linkedinProvider } from "./linkedin.js";
import { metaProvider } from "./meta.js";
import { tiktokProvider } from "./tiktok.js";
import type { ChannelId, ChannelProvider, Connector, ConnectorId, PlatformId, Provider } from "./types.js";
import { whatsappProvider } from "./whatsapp.js";

export const PROVIDERS: Record<PlatformId, Provider> = { meta: metaProvider, google: googleProvider, tiktok: tiktokProvider, linkedin: linkedinProvider };
export const CHANNELS: Record<ChannelId, ChannelProvider> = { whatsapp: whatsappProvider, instagram: instagramProvider };
export const CONNECTORS: Record<ConnectorId, Connector> = { ...PROVIDERS, ...CHANNELS };
export const isPlatform = (p: unknown): p is PlatformId => typeof p === "string" && p in PROVIDERS;
export const isChannel = (p: unknown): p is ChannelId => typeof p === "string" && p in CHANNELS;
export const isConnector = (p: unknown): p is ConnectorId => typeof p === "string" && p in CONNECTORS;
export * from "./types.js";
