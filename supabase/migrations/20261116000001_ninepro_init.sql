-- =====================================================================
-- NinePro — esquema inicial
-- Multi-tenant por espaço de trabalho (workspace). Todo dado de negócio pertence
-- a um workspace; o acesso é controlado por RLS via membership.
-- Espelha os módulos mapeados em docs/reverse-engineering (11-parity-matrix).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tipos
create type public.member_role as enum ('owner', 'admin', 'member');
create type public.platform as enum ('meta', 'google', 'tiktok', 'linkedin', 'pinterest', 'x', 'reddit', 'microsoft', 'snapchat', 'openai');
create type public.objective as enum ('vendas', 'leads', 'trafego', 'reconhecimento');
create type public.delivery_status as enum ('active', 'learning', 'limited', 'paused', 'ended');
create type public.lead_status as enum ('novo', 'contatado', 'qualificado', 'venda', 'descartado');
create type public.post_status as enum ('agendada', 'publicada', 'rascunho', 'falhou', 'aguardando_aprovacao');

-- ---------------------------------------------------------------- utilitário updated_at
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------- identidade e acesso
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  zero_retention boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  access text not null default 'Acesso total',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on public.workspace_members (user_id);

-- Funções de checagem (security definer evita recursão de RLS em workspace_members)
create or replace function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid());
$$;
create or replace function public.is_admin(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() and m.role in ('owner', 'admin'));
$$;
revoke all on function public.is_member(uuid), public.is_admin(uuid) from public;
grant execute on function public.is_member(uuid), public.is_admin(uuid) to authenticated;

-- Novo usuário → perfil + workspace pessoal como proprietário
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), new.raw_user_meta_data ->> 'avatar_url');
  insert into public.workspaces (name, slug, created_by)
  values ('Meu espaço', 'ws-' || substr(replace(new.id::text, '-', ''), 1, 12), new.id)
  returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- anúncios
create table public.ad_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform public.platform not null,
  external_id text,
  name text not null,
  currency text not null default 'BRL',
  timezone text not null default 'America/Sao_Paulo',
  status text not null default 'connected' check (status in ('connected', 'disconnected', 'error')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, platform, external_id)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  ad_account_id uuid not null references public.ad_accounts (id) on delete cascade,
  external_id text,
  name text not null,
  objective public.objective not null,
  status public.delivery_status not null default 'paused',
  budget numeric(14, 2) not null default 0,
  budget_type text not null default 'diario' check (budget_type in ('diario', 'total')),
  started_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.campaigns (workspace_id);
create index on public.campaigns (ad_account_id);

create table public.ad_sets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  name text not null,
  audience text,
  status public.delivery_status not null default 'paused',
  created_at timestamptz not null default now()
);
create index on public.ad_sets (campaign_id);

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  ad_set_id uuid not null references public.ad_sets (id) on delete cascade,
  name text not null,
  format text not null default 'Imagem' check (format in ('Imagem', 'Vídeo', 'Carrossel')),
  status public.delivery_status not null default 'paused',
  thumbnail_url text,
  created_at timestamptz not null default now()
);
create index on public.ads (ad_set_id);

-- Métricas diárias no nível do anúncio (agregadas por views para conjunto/campanha)
create table public.ad_metrics_daily (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  ad_id uuid not null references public.ads (id) on delete cascade,
  date date not null,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  link_clicks bigint not null default 0,
  conversions bigint not null default 0,
  leads bigint not null default 0,
  purchases bigint not null default 0,
  revenue numeric(14, 2) not null default 0,
  primary key (ad_id, date)
);
create index on public.ad_metrics_daily (workspace_id, date);

create view public.campaign_metrics_daily with (security_invoker = true) as
select c.workspace_id, c.id as campaign_id, m.date,
       sum(m.spend) spend, sum(m.impressions) impressions, sum(m.reach) reach, sum(m.clicks) clicks,
       sum(m.link_clicks) link_clicks, sum(m.conversions) conversions, sum(m.leads) leads,
       sum(m.purchases) purchases, sum(m.revenue) revenue
from public.ad_metrics_daily m
join public.ads a on a.id = m.ad_id
join public.ad_sets s on s.id = a.ad_set_id
join public.campaigns c on c.id = s.campaign_id
group by c.workspace_id, c.id, m.date;

-- ---------------------------------------------------------------- leads, formulários, públicos
create table public.lead_forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform public.platform not null,
  name text not null,
  status text not null default 'Rascunho' check (status in ('Ativo', 'Rascunho', 'Arquivado')),
  locale text not null default 'pt-BR',
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  form_id uuid references public.lead_forms (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  platform public.platform,
  name text not null,
  email text,
  phone text,
  status public.lead_status not null default 'novo',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.leads (workspace_id, submitted_at desc);

create table public.audiences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  ad_account_id uuid references public.ad_accounts (id) on delete set null,
  name text not null,
  type text not null,
  size bigint,
  status text not null default 'Preenchendo',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- conversões
create table public.tracked_sites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  domain text not null,
  installed_via text not null default 'Tag manual',
  subdomain text,
  created_at timestamptz not null default now(),
  unique (workspace_id, domain)
);

create table public.conversion_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type text not null,
  source text not null,
  sent_to public.platform[] not null default '{}',
  page text,
  campaign_id uuid references public.campaigns (id) on delete set null,
  value numeric(14, 2) not null default 0,
  status text not null default 'Aceito' check (status in ('Aceito', 'Parcial', 'Rejeitado')),
  received_at timestamptz not null default now()
);
create index on public.conversion_events (workspace_id, received_at desc);

-- ---------------------------------------------------------------- automações
create table public.automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  template_id text,                       -- modelo de origem (ou null = personalizada)
  trigger jsonb not null,                 -- { kind, frequency, account, level, event, ... }
  conditions jsonb not null default '[]', -- [{ metric, period, op, value }]
  logic text not null default 'E' check (logic in ('E', 'OU')),
  actions jsonb not null default '[]',    -- [{ kind: change|alert, ... }]
  target text,
  status text not null default 'rascunho' check (status in ('rascunho', 'ativa', 'desligada')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.automations (workspace_id);

create table public.automation_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  run_ad_automations boolean not null default true,
  max_daily_increase_pct int not null default 30 check (max_daily_increase_pct between 0 and 500)
);

create table public.automation_runs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  automation_id uuid not null references public.automations (id) on delete cascade,
  ran_at timestamptz not null default now(),
  outcome text not null,
  details jsonb
);

-- ---------------------------------------------------------------- desenvolvedores
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  prefix text not null,                   -- exibido (np_live_xxxx…yyyy)
  key_hash text not null,                 -- sha256 do segredo; o segredo nunca é guardado
  permission text not null default 'Leitura e escrita' check (permission in ('Leitura e escrita', 'Somente leitura')),
  scope text not null default 'Todos os perfis',
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.webhooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  endpoint text not null check (endpoint like 'https://%'),
  events text[] not null default '{}',
  active boolean not null default true,
  secret_hash text,
  created_at timestamptz not null default now()
);

create table public.request_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  at timestamptz not null default now(),
  status int not null,
  activity text not null,
  platform text,
  profile text,
  duration_ms int
);
create index on public.request_logs (workspace_id, at desc);

-- ---------------------------------------------------------------- publicações e caixa de entrada
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  content text not null,
  channels text[] not null default '{}',
  status public.post_status not null default 'rascunho',
  scheduled_at timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.posts (workspace_id, scheduled_at);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  channel text not null,
  contact_name text not null,
  status text not null default 'Aberta' check (status in ('Aberta', 'Resolvida')),
  assigned_to uuid references auth.users (id) on delete set null,
  last_message_at timestamptz not null default now()
);

create table public.messages (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  body text not null,
  sent_at timestamptz not null default now()
);
create index on public.messages (conversation_id, sent_at);

-- ---------------------------------------------------------------- updated_at
create trigger t_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger t_workspaces_updated before update on public.workspaces for each row execute function public.set_updated_at();
create trigger t_campaigns_updated before update on public.campaigns for each row execute function public.set_updated_at();
create trigger t_leads_updated before update on public.leads for each row execute function public.set_updated_at();
create trigger t_automations_updated before update on public.automations for each row execute function public.set_updated_at();
create trigger t_posts_updated before update on public.posts for each row execute function public.set_updated_at();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles enable row level security;
create policy "perfil: dono lê" on public.profiles for select using (id = auth.uid());
create policy "perfil: dono altera" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

alter table public.workspaces enable row level security;
create policy "workspace: membros leem" on public.workspaces for select using (public.is_member(id));
create policy "workspace: admins alteram" on public.workspaces for update using (public.is_admin(id)) with check (public.is_admin(id));

alter table public.workspace_members enable row level security;
create policy "membros: membros leem" on public.workspace_members for select using (public.is_member(workspace_id));
create policy "membros: admins gerenciam" on public.workspace_members for all using (public.is_admin(workspace_id)) with check (public.is_admin(workspace_id));

-- Tabelas de negócio: membros leem e escrevem; segredos e configurações só admins.
do $$
declare t text;
begin
  foreach t in array array['ad_accounts','campaigns','ad_sets','ads','ad_metrics_daily','lead_forms','leads','audiences',
                           'tracked_sites','conversion_events','automations','automation_runs','request_logs','posts','conversations','messages']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: membros leem" on public.%I for select using (public.is_member(workspace_id))', t, t);
    execute format('create policy "%s: membros inserem" on public.%I for insert with check (public.is_member(workspace_id))', t, t);
    execute format('create policy "%s: membros alteram" on public.%I for update using (public.is_member(workspace_id)) with check (public.is_member(workspace_id))', t, t);
    execute format('create policy "%s: admins excluem" on public.%I for delete using (public.is_admin(workspace_id))', t, t);
  end loop;
  foreach t in array array['api_keys','webhooks','automation_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: membros leem" on public.%I for select using (public.is_member(workspace_id))', t, t);
    execute format('create policy "%s: admins gerenciam" on public.%I for all using (public.is_admin(workspace_id)) with check (public.is_admin(workspace_id))', t, t);
  end loop;
end $$;
