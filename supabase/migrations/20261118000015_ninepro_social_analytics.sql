-- NinePro · análises em todas as redes: métricas por publicação de cada rede e histórico diário das contas.

-- publicações (de todas as redes, feitas pelo NinePro ou não) com métricas
alter table public.social_media_stats add column if not exists kind text;
alter table public.social_media_stats add column if not exists impressions int;
alter table public.social_media_stats add column if not exists clicks int;
alter table public.social_media_stats add column if not exists post_id uuid references public.posts (id) on delete set null;
update public.social_media_stats s set kind = 'instagram' where kind is null;
create index if not exists social_media_stats_kind_idx on public.social_media_stats (workspace_id, kind, posted_at desc);

-- foto diária de cada conta (seguidores, alcance, visualizações do perfil…)
create table if not exists public.account_stats_daily (
  channel_account_id uuid not null references public.channel_accounts (id) on delete cascade,
  day date not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null,
  followers int,
  following int,
  posts int,
  impressions int,
  reach int,
  profile_views int,
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (channel_account_id, day)
);
create index if not exists account_stats_daily_ws_idx on public.account_stats_daily (workspace_id, day desc);
alter table public.account_stats_daily enable row level security;
drop policy if exists "account_stats_daily: membros leem" on public.account_stats_daily;
create policy "account_stats_daily: membros leem" on public.account_stats_daily for select using (public.is_member(workspace_id));
