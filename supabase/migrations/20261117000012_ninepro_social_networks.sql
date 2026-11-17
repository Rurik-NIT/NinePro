-- NinePro · publicação em várias redes: Facebook, Threads, LinkedIn, YouTube, TikTok, X, Telegram, Discord e Bluesky.

alter type public.platform add value if not exists 'facebook';
alter type public.platform add value if not exists 'threads';
alter type public.platform add value if not exists 'linkedin_social';
alter type public.platform add value if not exists 'youtube';
alter type public.platform add value if not exists 'tiktok_social';
alter type public.platform add value if not exists 'x';
alter type public.platform add value if not exists 'telegram';
alter type public.platform add value if not exists 'discord';
alter type public.platform add value if not exists 'bluesky';

-- contas em que se publica (mesma tabela dos canais)
alter table public.channel_accounts drop constraint if exists channel_accounts_kind_check;
alter table public.channel_accounts add constraint channel_accounts_kind_check
  check (kind in ('whatsapp', 'instagram', 'facebook', 'threads', 'linkedin_social', 'youtube', 'tiktok_social', 'x', 'telegram', 'discord', 'bluesky'));

-- publicação: título (YouTube), texto diferente por rede e status "parcial" (publicou em parte das redes)
alter table public.posts add column if not exists title text;
alter table public.posts add column if not exists custom jsonb not null default '{}'::jsonb;
alter type public.post_status add value if not exists 'parcial';
