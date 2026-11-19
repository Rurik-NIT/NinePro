-- NinePro · personalizador de tema: tema da empresa (espaço de trabalho) e tema de cada usuário.
-- Nível de organização do NinePro = espaço de trabalho (workspaces): cada empresa/cliente é um espaço,
-- com dono/admin/membro. O dono ou admin define a identidade visual do espaço; cada pessoa pode usar a
-- do espaço ou o próprio tema.

create table if not exists public.workspace_themes (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  theme jsonb not null default '{}'::jsonb,   -- { preset, brand: {primary, secondary, tertiary, accent}, light: {...}, dark: {...} }
  default_mode text not null default 'dark' check (default_mode in ('light', 'dark', 'system')),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.workspace_themes enable row level security;
drop policy if exists "workspace_themes: membros leem" on public.workspace_themes;
create policy "workspace_themes: membros leem" on public.workspace_themes for select using (public.is_member(workspace_id));
drop policy if exists "workspace_themes: admins gerenciam" on public.workspace_themes;
create policy "workspace_themes: admins gerenciam" on public.workspace_themes for all using (public.is_admin(workspace_id)) with check (public.is_admin(workspace_id));

create table if not exists public.user_themes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mode text not null default 'dark' check (mode in ('light', 'dark', 'system')),
  use_workspace boolean not null default true,  -- true = segue o tema da empresa; false = usa o próprio
  theme jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_themes enable row level security;
drop policy if exists "user_themes: cada um o seu" on public.user_themes;
create policy "user_themes: cada um o seu" on public.user_themes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
