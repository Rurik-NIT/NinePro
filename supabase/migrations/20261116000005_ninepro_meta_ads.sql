-- NinePro — integração com plataformas de anúncio (começando pela Meta Ads).
-- Rode no SQL Editor depois das migrações 1 a 4. Pode rodar mais de uma vez.

-- Conexão de cada espaço com uma plataforma (dados visíveis aos membros; sem token)
create table if not exists public.platform_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform public.platform not null,
  external_user_id text,
  external_user_name text,
  scopes text[] not null default '{}',
  status text not null default 'ativa' check (status in ('ativa', 'expirada', 'erro')),
  last_error text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, platform)
);
alter table public.platform_connections enable row level security;
drop policy if exists "platform_connections: membros leem" on public.platform_connections;
create policy "platform_connections: membros leem" on public.platform_connections
  for select using (public.is_member(workspace_id));

-- Tokens de acesso criptografados (AES-256-GCM no servidor). Sem política: só a service_role lê.
create table if not exists public.platform_tokens (
  connection_id uuid primary key references public.platform_connections (id) on delete cascade,
  access_token_enc text not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_tokens enable row level security;

-- Histórico de sincronizações
create table if not exists public.sync_runs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform public.platform not null,
  trigger text not null default 'manual' check (trigger in ('manual', 'agendada', 'conexao')),
  status text not null default 'rodando' check (status in ('rodando', 'ok', 'erro')),
  detail jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists sync_runs_ws_idx on public.sync_runs (workspace_id, started_at desc);
alter table public.sync_runs enable row level security;
drop policy if exists "sync_runs: membros leem" on public.sync_runs;
create policy "sync_runs: membros leem" on public.sync_runs for select using (public.is_member(workspace_id));

-- Identificadores externos para sincronizar sem duplicar
alter table public.ad_sets add column if not exists external_id text;
alter table public.ads add column if not exists external_id text;
alter table public.ad_accounts add column if not exists sync_enabled boolean not null default true;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'campaigns_ws_external_key') then
    alter table public.campaigns add constraint campaigns_ws_external_key unique (workspace_id, external_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ad_sets_ws_external_key') then
    alter table public.ad_sets add constraint ad_sets_ws_external_key unique (workspace_id, external_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ads_ws_external_key') then
    alter table public.ads add constraint ads_ws_external_key unique (workspace_id, external_id);
  end if;
end $$;
