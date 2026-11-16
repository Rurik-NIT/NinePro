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
