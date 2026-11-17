-- NinePro · conexão de agentes de IA por OAuth 2.1 (MCP) e automação comentário → DM com botão.

-- ---------------------------------------------------------------- automação de comentário: botão, publicação específica, uma vez por pessoa
alter table public.inbox_flows add column if not exists button_label text;
alter table public.inbox_flows add column if not exists button_url text;
alter table public.inbox_flows add column if not exists media_ids text[] not null default '{}';   -- só estas publicações do Instagram (vazio = todas)
alter table public.inbox_flows add column if not exists post_id uuid references public.posts (id) on delete set null; -- ou a publicação feita pelo NinePro
alter table public.inbox_flows add column if not exists once_per_user boolean not null default true;
alter table public.inbox_flows add column if not exists source text not null default 'app';       -- app | agente

alter table public.social_comments add column if not exists flow_id uuid references public.inbox_flows (id) on delete set null;
create index if not exists social_comments_flow_idx on public.social_comments (flow_id, author_id) where flow_id is not null;

-- ---------------------------------------------------------------- OAuth: aplicativos (agentes) registrados dinamicamente
create table if not exists public.oauth_clients (
  client_id text primary key,
  name text not null default 'Agente de IA',
  redirect_uris text[] not null,
  logo_uri text,
  client_uri text,
  created_at timestamptz not null default now()
);
alter table public.oauth_clients enable row level security; -- só o servidor acessa

create table if not exists public.oauth_codes (
  code_hash text primary key,
  client_id text not null references public.oauth_clients (client_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  scopes text[] not null,
  redirect_uri text not null,
  code_challenge text not null,
  resource text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.oauth_codes enable row level security; -- só o servidor acessa

create table if not exists public.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  client_id text not null references public.oauth_clients (client_id) on delete cascade,
  client_name text not null,
  scopes text[] not null,
  access_hash text not null unique,
  access_expires_at timestamptz not null,
  refresh_hash text unique,
  refresh_expires_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists oauth_tokens_ws_idx on public.oauth_tokens (workspace_id, created_at desc);
alter table public.oauth_tokens enable row level security;
drop policy if exists "oauth_tokens: membros leem" on public.oauth_tokens;
create policy "oauth_tokens: membros leem" on public.oauth_tokens for select using (public.is_member(workspace_id));
-- revogação e emissão só pelo servidor (service_role)
