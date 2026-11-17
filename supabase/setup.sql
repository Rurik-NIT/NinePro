-- =====================================================================
-- NinePro — instalação completa do banco (cole tudo no SQL Editor e clique em Run)
-- Gerado a partir de supabase/migrations/*. Rode UMA vez num projeto vazio.
-- =====================================================================

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


-- =====================================================================
-- NinePro — dados de demonstração sob demanda
-- public.seed_demo_workspace(ws) popula um workspace com contas, campanhas,
-- conjuntos, anúncios, 90 dias de métricas, leads, formulários, públicos,
-- eventos de conversão, publicações e conversas. Só admins do workspace podem chamar.
-- Os registros recebem nomes com "(demo)" quando aplicável para não se confundirem com dados reais.
-- =====================================================================

create or replace function public.seed_demo_workspace(ws uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  acc_meta uuid; acc_google uuid; acc_tiktok uuid; acc_li uuid;
  c record; s uuid; a uuid; f_vip uuid; f_b2b uuid;
  n int;
begin
  -- No app (usuário logado) exige ser admin do workspace; no SQL Editor (sem auth.uid) é o dono do banco rodando.
  if auth.uid() is not null and not public.is_admin(ws) then raise exception 'sem permissão para popular este workspace'; end if;
  if not exists (select 1 from public.workspaces where id = ws) then raise exception 'workspace % não existe', ws; end if;
  if exists (select 1 from public.campaigns where workspace_id = ws) then raise exception 'o workspace já tem campanhas'; end if;

  insert into public.ad_accounts (workspace_id, platform, external_id, name) values
    (ws, 'meta', 'demo-meta', 'Loja Aurora — BM principal (demo)') returning id into acc_meta;
  insert into public.ad_accounts (workspace_id, platform, external_id, name) values
    (ws, 'google', 'demo-google', 'Aurora Search (demo)') returning id into acc_google;
  insert into public.ad_accounts (workspace_id, platform, external_id, name) values
    (ws, 'tiktok', 'demo-tiktok', 'Aurora TikTok (demo)') returning id into acc_tiktok;
  insert into public.ad_accounts (workspace_id, platform, external_id, name) values
    (ws, 'linkedin', 'demo-linkedin', 'Aurora B2B (demo)') returning id into acc_li;

  for c in
    select * from (values
      ('Black Friday — Prospecção ampla', acc_meta, 'vendas'::objective, 'active'::delivery_status, 1800, 24.0, 0.017, 0.032, 260),
      ('Remarketing — Carrinho 7d', acc_meta, 'vendas', 'active', 650, 24.0, 0.017, 0.032, 260),
      ('Captação — Lista VIP', acc_meta, 'leads', 'active', 420, 24.0, 0.012, 0.09, 0),
      ('Shopping — Catálogo completo', acc_google, 'vendas', 'active', 1500, 38.0, 0.017, 0.032, 260),
      ('Pesquisa — Marca', acc_google, 'trafego', 'active', 380, 38.0, 0.045, 0.018, 210),
      ('Pesquisa — Concorrentes', acc_google, 'vendas', 'limited', 520, 38.0, 0.017, 0.032, 260),
      ('Spark Ads — Criadores', acc_tiktok, 'vendas', 'active', 700, 14.0, 0.017, 0.032, 260),
      ('ABM — Decisores varejo', acc_li, 'leads', 'active', 480, 92.0, 0.012, 0.09, 0)
    ) as t(name, acc, obj, st, budget, cpm, ctr, cvr, aov)
  loop
    insert into public.campaigns (workspace_id, ad_account_id, name, objective, status, budget, started_at)
    values (ws, c.acc, c.name, c.obj, c.st, c.budget, current_date - 120) returning id into s;
    -- um conjunto e dois anúncios por campanha
    insert into public.ad_sets (workspace_id, campaign_id, name, audience, status)
    values (ws, s, 'Conjunto A — ' || c.name, 'Lookalike 1% compradores', c.st) returning id into a;
    for n in 1..2 loop
      with ad as (
        insert into public.ads (workspace_id, ad_set_id, name, format, status)
        values (ws, a, case n when 1 then 'Vídeo depoimento' else 'Carrossel mais vendidos' end, case n when 1 then 'Vídeo' else 'Carrossel' end, c.st)
        returning id
      )
      insert into public.ad_metrics_daily (workspace_id, ad_id, date, spend, impressions, reach, clicks, link_clicks, conversions, leads, purchases, revenue)
      select ws, ad.id, d::date, sp,
             (sp / c.cpm * 1000)::bigint,
             (sp / c.cpm * 1000 / 1.8)::bigint,
             (sp / c.cpm * 1000 * c.ctr)::bigint,
             (sp / c.cpm * 1000 * c.ctr * 0.7)::bigint,
             (sp / c.cpm * 1000 * c.ctr * c.cvr)::bigint,
             case when c.obj = 'leads' then (sp / c.cpm * 1000 * c.ctr * c.cvr)::bigint else 0 end,
             case when c.obj = 'leads' then 0 else (sp / c.cpm * 1000 * c.ctr * c.cvr)::bigint end,
             case when c.obj = 'leads' then 0 else (sp / c.cpm * 1000 * c.ctr * c.cvr) * c.aov * (0.85 + random() * 0.35) end
      from ad, generate_series(current_date - 89, current_date, interval '1 day') d,
           lateral (select round((c.budget / 2.0 * (0.8 + random() * 0.3) * case when extract(dow from d) in (0, 6) then 0.82 else 1 end)::numeric, 2) as sp) x;
    end loop;
  end loop;

  insert into public.lead_forms (workspace_id, platform, name, status) values (ws, 'meta', 'Lista VIP Verão', 'Ativo') returning id into f_vip;
  insert into public.lead_forms (workspace_id, platform, name, status) values (ws, 'linkedin', 'Orçamento B2B', 'Ativo') returning id into f_b2b;

  insert into public.leads (workspace_id, form_id, platform, name, email, status, submitted_at)
  select ws, case when i % 3 = 0 then f_b2b else f_vip end, case when i % 3 = 0 then 'linkedin'::platform else 'meta'::platform end,
         (array['Ana','Bruno','Carla','Diego','Elisa','Fábio','Gabriela','Heitor','Isabela','João'])[1 + i % 10] || ' ' ||
         (array['Almeida','Barros','Cardoso','Duarte','Lima','Moreira','Rocha'])[1 + i % 7],
         'lead' || i || '@exemplo.com',
         (array['novo','novo','contatado','qualificado','venda','descartado'])[1 + i % 6]::lead_status,
         now() - (i || ' hours')::interval * 7
  from generate_series(1, 40) i;

  insert into public.audiences (workspace_id, ad_account_id, name, type, size, status) values
    (ws, acc_meta, 'Compradores 180 dias (demo)', 'Lista de clientes', 18400, 'Pronto'),
    (ws, acc_meta, 'Semelhante 1% — compradores (demo)', 'Semelhante', 2100000, 'Pronto'),
    (ws, acc_google, 'Visitantes 30 dias sem compra (demo)', 'Retargeting do site', 52300, 'Pronto');

  insert into public.tracked_sites (workspace_id, domain, installed_via, subdomain) values
    (ws, 'lojaaurora-demo.com.br', 'Loja virtual', 't.lojaaurora-demo.com.br');

  insert into public.conversion_events (workspace_id, type, source, sent_to, page, value, status, received_at)
  select ws, (array['Compra','Compra','Lead','Cadastro','Início de checkout'])[1 + i % 5], 'Site (tag)', array['meta','google']::platform[],
         '/checkout/obrigado', case when i % 5 < 2 then 90 + (i * 37) % 700 else 0 end,
         case when i % 9 = 0 then 'Parcial' else 'Aceito' end, now() - (i || ' hours')::interval * 2
  from generate_series(1, 60) i;

  insert into public.posts (workspace_id, content, channels, status, scheduled_at, published_at)
  select ws, (array['Coleção Verão chegou ☀️','Frete grátis até domingo!','Bastidores do ensaio de verão'])[1 + i % 3],
         array['Instagram','Facebook'],
         (array['agendada','publicada','rascunho'])[1 + i % 3]::post_status,
         case when i % 3 = 0 then now() + (i || ' days')::interval end,
         case when i % 3 = 1 then now() - (i || ' days')::interval end
  from generate_series(1, 12) i;

  insert into public.automation_settings (workspace_id) values (ws) on conflict do nothing;
end $$;

revoke all on function public.seed_demo_workspace(uuid) from public;
grant execute on function public.seed_demo_workspace(uuid) to authenticated;

-- ============================================================ 20261116000003_ninepro_platform_admin.sql
-- NinePro — super admin da plataforma (equipe NIT) e registro de atividade administrativa.
-- Ações que mexem em contas (criar, bloquear, redefinir senha, excluir) rodam só no servidor
-- (api/admin.ts) com a service_role; o navegador nunca recebe essa chave.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

-- Cada pessoa só consegue ver se ela mesma é admin. Ninguém escreve pelo navegador.
drop policy if exists "platform_admins: ler a própria linha" on public.platform_admins;
create policy "platform_admins: ler a própria linha" on public.platform_admins
  for select to authenticated using (user_id = auth.uid());

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,
  action text not null,
  target_id uuid,
  target_email text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
drop policy if exists "admin_audit: super admin lê" on public.admin_audit;
create policy "admin_audit: super admin lê" on public.admin_audit
  for select to authenticated using (public.is_platform_admin());
create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);

-- ---------------------------------------------------------------------------
-- Primeiro super admin: rode UMA vez no SQL Editor trocando o e-mail pelo seu.
--   insert into public.platform_admins (user_id)
--   select id from auth.users where email = 'SEU_EMAIL_AQUI'
--   on conflict do nothing;

-- ============================================================ 20261116000004_ninepro_agent_api.sql
-- NinePro — API para agentes (REST + MCP) e entrega real de webhooks.
-- Rode no SQL Editor depois das migrações 1 a 3. Pode rodar mais de uma vez.

-- Último uso de cada chave (preenchido pelo servidor a cada chamada)
alter table public.api_keys add column if not exists last_used_at timestamptz;

-- Segredo de assinatura (HMAC-SHA256) de cada webhook e status da última entrega
alter table public.webhooks
  add column if not exists signing_secret text not null
    default ('whsec_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  add column if not exists last_delivery_at timestamptz,
  add column if not exists last_status int;

-- Histórico de entregas (base da coluna "Saúde" na tela de Webhooks)
create table if not exists public.webhook_deliveries (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  webhook_id uuid not null references public.webhooks (id) on delete cascade,
  event text not null,
  status int not null,               -- HTTP devolvido pelo destino (0 = sem resposta)
  duration_ms int,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists webhook_deliveries_hook_idx on public.webhook_deliveries (webhook_id, created_at desc);
alter table public.webhook_deliveries enable row level security;
drop policy if exists "webhook_deliveries: membros leem" on public.webhook_deliveries;
create policy "webhook_deliveries: membros leem" on public.webhook_deliveries
  for select using (public.is_member(workspace_id));
-- Escrita só pelo servidor (service_role ignora RLS).

-- ============================================================ 20261116000005_ninepro_meta_ads.sql
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

-- ============================================================ 20261116000006_ninepro_data_deletion.sql
-- NinePro — pedidos de exclusão de dados vindos da Meta (Data Deletion Callback) e desautorizações.
-- Rode no SQL Editor depois das migrações 1 a 5. Pode rodar mais de uma vez.
create table if not exists public.data_deletion_requests (
  id bigint generated always as identity primary key,
  code text not null unique,
  platform public.platform not null,
  kind text not null check (kind in ('exclusao', 'desautorizacao')),
  external_user_id text not null,
  status text not null default 'recebido' check (status in ('recebido', 'concluido')),
  connections_removed int not null default 0,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
-- Sem políticas: só o servidor (service_role) lê e grava. A consulta pública de status passa pela API.
alter table public.data_deletion_requests enable row level security;

-- ============================================================ 20261116000007_ninepro_own_credentials.sql
-- NinePro — clientes podem conectar com o próprio app da plataforma ou com um token de acesso.
-- Rode no SQL Editor depois das migrações 1 a 6. Pode rodar mais de uma vez.

-- Como a conexão foi feita: app do NinePro, app próprio do cliente ou token colado
alter table public.platform_connections
  add column if not exists auth_mode text not null default 'app_ninepro'
    check (auth_mode in ('app_ninepro', 'app_proprio', 'token')),
  add column if not exists app_id text;          -- ID público do app próprio (exibido na tela)

-- Credenciais do app próprio de cada espaço (chave secreta criptografada). Sem política: só o servidor.
create table if not exists public.platform_app_credentials (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform public.platform not null,
  app_id text not null,
  app_secret_enc text not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, platform)
);
alter table public.platform_app_credentials enable row level security;

-- ============================================================ 20261116000008_ninepro_multi_platform.sql
-- NinePro — várias plataformas de anúncio (Google Ads com contas sob MCC, TikTok, LinkedIn).
-- Rode no SQL Editor depois das migrações 1 a 7. Pode rodar mais de uma vez.

-- Conta de administrador (MCC) por onde a conta é acessada (Google Ads)
alter table public.ad_accounts add column if not exists parent_external_id text;

-- O mesmo ID externo pode existir em plataformas diferentes: a chave única passa a considerar a conta
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'campaigns_ws_external_key') then
    alter table public.campaigns drop constraint campaigns_ws_external_key;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaigns_account_external_key') then
    alter table public.campaigns add constraint campaigns_account_external_key unique (ad_account_id, external_id);
  end if;
  if exists (select 1 from pg_constraint where conname = 'ad_sets_ws_external_key') then
    alter table public.ad_sets drop constraint ad_sets_ws_external_key;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ad_sets_campaign_external_key') then
    alter table public.ad_sets add constraint ad_sets_campaign_external_key unique (campaign_id, external_id);
  end if;
  if exists (select 1 from pg_constraint where conname = 'ads_ws_external_key') then
    alter table public.ads drop constraint ads_ws_external_key;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ads_set_external_key') then
    alter table public.ads add constraint ads_set_external_key unique (ad_set_id, external_id);
  end if;
end $$;


-- =====================================================================
-- 9) Canais: WhatsApp Business e Instagram
-- =====================================================================
-- NinePro — canais de mensagem e redes sociais: WhatsApp Business (Cloud API) e Instagram.
-- Rode no SQL Editor depois das migrações 1 a 8. Pode rodar mais de uma vez.

-- Novas "plataformas" de conexão (reaproveitam platform_connections / platform_tokens / platform_app_credentials)
alter type public.platform add value if not exists 'whatsapp';
alter type public.platform add value if not exists 'instagram';

-- Chave secreta da URL de webhook de cada conexão (usada quando o cliente conecta com o app da própria empresa)
alter table public.platform_connections
  add column if not exists webhook_key text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

-- Números de WhatsApp e contas do Instagram de cada conexão
create table if not exists public.channel_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  connection_id uuid references public.platform_connections (id) on delete set null,   -- desconectar mantém o histórico
  kind text not null check (kind in ('whatsapp', 'instagram')),
  external_id text not null,            -- phone_number_id (WhatsApp) ou ID da conta profissional (Instagram)
  parent_external_id text,              -- WABA (WhatsApp)
  name text not null,                   -- número exibido ou @usuário
  display_name text,                    -- nome verificado / nome do perfil
  picture_url text,
  status text not null default 'ativo',
  quality text,
  detail jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, external_id)
);
create index if not exists channel_accounts_ws_idx on public.channel_accounts (workspace_id, kind);
alter table public.channel_accounts enable row level security;
drop policy if exists "channel_accounts: membros leem" on public.channel_accounts;
create policy "channel_accounts: membros leem" on public.channel_accounts for select using (public.is_member(workspace_id));

-- Conversas e mensagens reais (as tabelas já existiam; ganham os vínculos com o canal)
alter table public.conversations
  add column if not exists channel_account_id uuid references public.channel_accounts (id) on delete cascade,
  add column if not exists external_thread_id text,      -- wa_id do contato / IGSID
  add column if not exists contact_handle text,          -- telefone ou @usuário
  add column if not exists contact_picture text,
  add column if not exists unread int not null default 0,
  add column if not exists last_message_preview text,
  add column if not exists last_inbound_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conversations_thread_key') then
    alter table public.conversations add constraint conversations_thread_key unique (channel_account_id, external_thread_id);
  end if;
end $$;
create index if not exists conversations_ws_last_idx on public.conversations (workspace_id, last_message_at desc);

alter table public.messages
  add column if not exists external_id text,
  add column if not exists kind text not null default 'text',
  add column if not exists media_id text,
  add column if not exists media_url text,
  add column if not exists status text,                  -- enviada | entregue | lida | falhou | recebida
  add column if not exists error text,
  add column if not exists author_id uuid references auth.users (id) on delete set null;
create unique index if not exists messages_external_key on public.messages (workspace_id, external_id);  -- nulos não colidem

-- Comentários e menções do Instagram
create table if not exists public.social_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  channel_account_id uuid not null references public.channel_accounts (id) on delete cascade,
  kind text not null default 'comment' check (kind in ('comment', 'mention')),
  external_id text not null,
  parent_external_id text,
  media_id text,
  media_caption text,
  media_permalink text,
  media_thumbnail text,
  author_id text,
  author_username text,
  body text not null default '',
  commented_at timestamptz not null default now(),
  replied boolean not null default false,
  reply_text text,
  hidden boolean not null default false,
  from_owner boolean not null default false,
  created_at timestamptz not null default now(),
  unique (channel_account_id, external_id)
);
create index if not exists social_comments_ws_idx on public.social_comments (workspace_id, commented_at desc);
alter table public.social_comments enable row level security;
drop policy if exists "social_comments: membros leem" on public.social_comments;
create policy "social_comments: membros leem" on public.social_comments for select using (public.is_member(workspace_id));

-- Modelos de mensagem do WhatsApp (sincronizados da conta WABA)
create table if not exists public.wa_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  connection_id uuid not null references public.platform_connections (id) on delete cascade,
  waba_id text not null,
  external_id text not null,
  name text not null,
  language text not null,
  category text,
  status text,
  rejected_reason text,
  components jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (waba_id, external_id)
);
create index if not exists wa_templates_ws_idx on public.wa_templates (workspace_id, name);
alter table public.wa_templates enable row level security;
drop policy if exists "wa_templates: membros leem" on public.wa_templates;
create policy "wa_templates: membros leem" on public.wa_templates for select using (public.is_member(workspace_id));

-- Publicações: destino, mídia e resultado da publicação real
alter table public.posts
  add column if not exists channel_account_ids uuid[] not null default '{}',
  add column if not exists media_urls text[] not null default '{}',
  add column if not exists media_type text not null default 'IMAGE' check (media_type in ('IMAGE', 'VIDEO', 'REELS', 'CAROUSEL', 'STORIES')),
  add column if not exists result jsonb not null default '{}'::jsonb,
  add column if not exists error text,
  add column if not exists attempts int not null default 0;

-- Arquivos enviados pelos usuários para publicar (precisam de endereço público para o Instagram buscar)
insert into storage.buckets (id, name, public) values ('midia', 'midia', true) on conflict (id) do nothing;
drop policy if exists "midia: membros enviam" on storage.objects;
create policy "midia: membros enviam" on storage.objects for insert to authenticated
  with check (bucket_id = 'midia' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "midia: membros excluem" on storage.objects;
create policy "midia: membros excluem" on storage.objects for delete to authenticated
  using (bucket_id = 'midia' and public.is_member(((storage.foldername(name))[1])::uuid));

-- Tempo real para a caixa de entrada
do $$ begin
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.conversations; exception when duplicate_object then null; end;
end $$;

-- Anexos recebidos nas conversas (fotos, áudios, documentos): privados, lidos por URL assinada
insert into storage.buckets (id, name, public) values ('anexos', 'anexos', false) on conflict (id) do nothing;
drop policy if exists "anexos: membros leem" on storage.objects;
create policy "anexos: membros leem" on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and public.is_member(((storage.foldername(name))[1])::uuid));


-- =====================================================================
-- 10) Módulos finais: regras executando, fluxos, disparos, tag do site, estatísticas
-- =====================================================================
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
