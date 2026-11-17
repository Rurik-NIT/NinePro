-- NinePro — módulos finais: regras automáticas executando, fluxos de resposta automática, disparos do WhatsApp,
-- contatos, tag do site / API de conversões e estatísticas das publicações do Instagram.
-- Rode no SQL Editor depois das migrações 1 a 9. Pode rodar mais de uma vez.

-- ---------------------------------------------------------------- regras automáticas
alter table public.campaigns add column if not exists paused_by_rule_at timestamptz;   -- "reativar o que uma regra pausou"
alter table public.automations
  add column if not exists params jsonb not null default '{}'::jsonb,                 -- meta de CPA, ROAS mínimo, teto…
  add column if not exists last_run_at timestamptz,
  add column if not exists last_outcome text;
create index if not exists automation_runs_ws_idx on public.automation_runs (workspace_id, ran_at desc);

-- ---------------------------------------------------------------- fluxos da caixa de entrada (respostas automáticas)
create table if not exists public.inbox_flows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  status text not null default 'ativo' check (status in ('ativo', 'pausado')),
  trigger text not null check (trigger in ('mensagem', 'primeira_mensagem', 'comentario', 'fora_do_horario')),
  channel text not null default 'todos' check (channel in ('todos', 'WhatsApp', 'Instagram')),
  match text not null default 'qualquer' check (match in ('qualquer', 'contem', 'exata')),
  keywords text[] not null default '{}',
  reply text not null default '',                 -- mensagem enviada (WhatsApp/Instagram) ou DM privada (comentário)
  comment_reply text not null default '',         -- resposta pública ao comentário (opcional)
  hours jsonb not null default '{"start":"09:00","end":"18:00","days":[1,2,3,4,5]}'::jsonb,
  runs int not null default 0,
  last_run_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inbox_flows_ws_idx on public.inbox_flows (workspace_id);
alter table public.inbox_flows enable row level security;
drop policy if exists "inbox_flows: membros leem" on public.inbox_flows;
create policy "inbox_flows: membros leem" on public.inbox_flows for select using (public.is_member(workspace_id));
drop policy if exists "inbox_flows: admins gerenciam" on public.inbox_flows;
create policy "inbox_flows: admins gerenciam" on public.inbox_flows for all using (public.is_admin(workspace_id)) with check (public.is_admin(workspace_id));

alter table public.messages add column if not exists flow_id uuid references public.inbox_flows (id) on delete set null;

-- ---------------------------------------------------------------- disparos (campanhas de mensagens do WhatsApp)
create table if not exists public.msg_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  channel_account_id uuid references public.channel_accounts (id) on delete set null,
  template_id uuid references public.wa_templates (id) on delete set null,
  template_name text,
  params jsonb not null default '[]'::jsonb,       -- variáveis do modelo; aceita {{nome}}
  status text not null default 'rascunho' check (status in ('rascunho', 'enviando', 'concluida', 'falhou')),
  total int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  delivered int not null default 0,
  read int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists msg_campaigns_ws_idx on public.msg_campaigns (workspace_id, created_at desc);
alter table public.msg_campaigns enable row level security;
drop policy if exists "msg_campaigns: membros leem" on public.msg_campaigns;
create policy "msg_campaigns: membros leem" on public.msg_campaigns for select using (public.is_member(workspace_id));

create table if not exists public.msg_campaign_recipients (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid not null references public.msg_campaigns (id) on delete cascade,
  phone text not null,
  name text,
  status text not null default 'pendente' check (status in ('pendente', 'enviada', 'entregue', 'lida', 'falhou')),
  external_id text,
  error text,
  sent_at timestamptz,
  unique (campaign_id, phone)
);
create index if not exists msg_recipients_ext_idx on public.msg_campaign_recipients (workspace_id, external_id);
alter table public.msg_campaign_recipients enable row level security;
drop policy if exists "msg_campaign_recipients: membros leem" on public.msg_campaign_recipients;
create policy "msg_campaign_recipients: membros leem" on public.msg_campaign_recipients for select using (public.is_member(workspace_id));

-- ---------------------------------------------------------------- contatos (anotações nas conversas)
alter table public.conversations
  add column if not exists notes text,
  add column if not exists tags text[] not null default '{}';

-- ---------------------------------------------------------------- tag do site e API de conversões
alter table public.tracked_sites
  add column if not exists public_key text not null default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists last_event_at timestamptz,
  add column if not exists events_count int not null default 0;
alter table public.conversion_events
  add column if not exists site_id uuid references public.tracked_sites (id) on delete set null,
  add column if not exists external_id text,
  add column if not exists visitor_id text,
  add column if not exists utm jsonb not null default '{}'::jsonb,
  add column if not exists contact jsonb not null default '{}'::jsonb;
create unique index if not exists conversion_events_external_key on public.conversion_events (workspace_id, external_id);

create table if not exists public.site_visits (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  site_id uuid not null references public.tracked_sites (id) on delete cascade,
  visitor_id text,
  path text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device text,
  at timestamptz not null default now()
);
create index if not exists site_visits_ws_idx on public.site_visits (workspace_id, at desc);
alter table public.site_visits enable row level security;
drop policy if exists "site_visits: membros leem" on public.site_visits;
create policy "site_visits: membros leem" on public.site_visits for select using (public.is_member(workspace_id));

-- ---------------------------------------------------------------- estatísticas das publicações do Instagram
create table if not exists public.social_media_stats (
  channel_account_id uuid not null references public.channel_accounts (id) on delete cascade,
  media_id text not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  caption text,
  permalink text,
  thumbnail text,
  media_type text,
  posted_at timestamptz,
  likes int not null default 0,
  comments int not null default 0,
  reach int,
  views int,
  saved int,
  shares int,
  updated_at timestamptz not null default now(),
  primary key (channel_account_id, media_id)
);
create index if not exists social_media_stats_ws_idx on public.social_media_stats (workspace_id, posted_at desc);
alter table public.social_media_stats enable row level security;
drop policy if exists "social_media_stats: membros leem" on public.social_media_stats;
create policy "social_media_stats: membros leem" on public.social_media_stats for select using (public.is_member(workspace_id));
