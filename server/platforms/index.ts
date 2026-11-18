import { blueskyProvider } from "./bluesky.js";
import { discordProvider } from "./discord.js";
import { facebookProvider } from "./facebook.js";
import { googleProvider } from "./google.js";
import { googleBusinessProvider } from "./googleBusiness.js";
import { pinterestProvider } from "./pinterest.js";
import { slackProvider } from "./slack.js";
import { instagramProvider } from "./instagram.js";
import { linkedinProvider } from "./linkedin.js";
import { linkedinSocialProvider } from "./linkedinSocial.js";
import { metaProvider } from "./meta.js";
import { telegramProvider } from "./telegram.js";
import { threadsProvider } from "./threads.js";
import { tiktokProvider } from "./tiktok.js";
import { tiktokSocialProvider } from "./tiktokSocial.js";
import type { ChannelId, ChannelProvider, Connector, ConnectorId, PlatformId, Provider, SocialId } from "./types.js";
import { whatsappProvider } from "./whatsapp.js";
import { xProvider } from "./x.js";
import { youtubeProvider } from "./youtube.js";

export const PROVIDERS: Record<PlatformId, Provider> = { meta: metaProvider, google: googleProvider, tiktok: tiktokProvider, linkedin: linkedinProvider };
/** Redes em que o NinePro publica (além do Instagram). */
export const SOCIALS: Record<SocialId, ChannelProvider> = {
  facebook: facebookProvider, threads: threadsProvider, linkedin_social: linkedinSocialProvider, youtube: youtubeProvider, tiktok_social: tiktokSocialProvider,
  x: xProvider, telegram: telegramProvider, discord: discordProvider, bluesky: blueskyProvider,
  pinterest: pinterestProvider, google_business: googleBusinessProvider, slack: slackProvider,
};
export const CHANNELS: Record<ChannelId, ChannelProvider> = { whatsapp: whatsappProvider, instagram: instagramProvider, ...SOCIALS };
export const CONNECTORS: Record<ConnectorId, Connector> = { ...PROVIDERS, ...CHANNELS };
/** Contas em que dá para publicar: Instagram + redes sociais. */
export const PUBLISHABLE: ChannelId[] = ["instagram", ...(Object.keys(SOCIALS) as SocialId[])];
export const isPlatform = (p: unknown): p is PlatformId => typeof p === "string" && p in PROVIDERS;
export const isChannel = (p: unknown): p is ChannelId => typeof p === "string" && p in CHANNELS;
export const isSocial = (p: unknown): p is SocialId => typeof p === "string" && p in SOCIALS;
export const isConnector = (p: unknown): p is ConnectorId => typeof p === "string" && p in CONNECTORS;
export * from "./types.js";
