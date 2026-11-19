-- NinePro · destinos de conversão: reenvio das conversões para a API de Conversões da Meta e a Events API do TikTok,
-- com o pixel e o token do próprio cliente.

create table if not exists public.conversion_destinations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform text not null check (platform in ('meta', 'tiktok')),
  pixel_id text not null,
  token_enc text not null,
  test_code text,
  enabled boolean not null default true,
  sent_count int not null default 0,
  error_count int not null default 0,
  last_sent_at timestamptz,
  last_error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, platform)
);
alter table public.conversion_destinations enable row level security;
drop policy if exists "conversion_destinations: membros leem" on public.conversion_destinations;
create policy "conversion_destinations: membros leem" on public.conversion_destinations for select using (public.is_member(workspace_id));
-- o token nunca sai para o navegador
revoke all on public.conversion_destinations from anon, authenticated;
grant select (id, workspace_id, platform, pixel_id, test_code, enabled, sent_count, error_count, last_sent_at, last_error, created_at, updated_at) on public.conversion_destinations to authenticated;

-- resposta de cada plataforma por evento
alter table public.conversion_events add column if not exists delivery jsonb not null default '{}'::jsonb;
alter table public.conversion_events add column if not exists click_ids jsonb not null default '{}'::jsonb;
