-- NinePro · fila de publicação (horários semanais) e sequências de mensagens.

-- ---------------------------------------------------------------- filas: horários fixos por semana; a publicação entra no próximo horário livre
create table if not exists public.post_queues (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null default 'Fila principal',
  timezone text not null default 'America/Sao_Paulo',
  slots jsonb not null default '[]'::jsonb,           -- [{ "day": 0-6 (domingo = 0), "time": "HH:MM" }]
  account_ids uuid[] not null default '{}',           -- contas padrão da fila (opcional)
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists post_queues_ws_idx on public.post_queues (workspace_id);
create unique index if not exists post_queues_one_default on public.post_queues (workspace_id) where is_default;
alter table public.post_queues enable row level security;
drop policy if exists "post_queues: membros leem" on public.post_queues;
create policy "post_queues: membros leem" on public.post_queues for select using (public.is_member(workspace_id));
drop policy if exists "post_queues: admins gerenciam" on public.post_queues;
create policy "post_queues: admins gerenciam" on public.post_queues for all using (public.is_admin(workspace_id)) with check (public.is_admin(workspace_id));

alter table public.posts add column if not exists queue_id uuid references public.post_queues (id) on delete set null;
create index if not exists posts_queue_idx on public.posts (queue_id, scheduled_at) where queue_id is not null;

-- ---------------------------------------------------------------- sequências: mensagens em etapas, com intervalo, para contatos inscritos
create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  description text,
  channel_account_id uuid references public.channel_accounts (id) on delete set null,  -- número do WhatsApp ou conta do Instagram que envia
  status text not null default 'rascunho' check (status in ('rascunho', 'ativa', 'pausada')),
  steps jsonb not null default '[]'::jsonb,           -- [{ "delay_minutes": n, "kind": "texto"|"modelo", "text": "...", "template_id": "...", "params": [] }]
  exit_on_reply boolean not null default true,
  source text not null default 'app',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sequences_ws_idx on public.sequences (workspace_id);
alter table public.sequences enable row level security;
drop policy if exists "sequences: membros leem" on public.sequences;
create policy "sequences: membros leem" on public.sequences for select using (public.is_member(workspace_id));
drop policy if exists "sequences: admins gerenciam" on public.sequences;
create policy "sequences: admins gerenciam" on public.sequences for all using (public.is_admin(workspace_id)) with check (public.is_admin(workspace_id));

create table if not exists public.sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  sequence_id uuid not null references public.sequences (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  phone text,                                         -- WhatsApp sem conversa ainda (o primeiro passo precisa ser modelo)
  contact_name text,
  status text not null default 'ativa' check (status in ('ativa', 'concluida', 'saiu', 'falhou')),
  current_step int not null default 0,
  next_run_at timestamptz,
  exit_reason text,
  last_error text,
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists seq_enroll_conv_uq on public.sequence_enrollments (sequence_id, conversation_id) where conversation_id is not null;
create unique index if not exists seq_enroll_phone_uq on public.sequence_enrollments (sequence_id, phone) where phone is not null and conversation_id is null;
create index if not exists seq_enroll_due_idx on public.sequence_enrollments (next_run_at) where status = 'ativa';
create index if not exists seq_enroll_conv_idx on public.sequence_enrollments (conversation_id) where status = 'ativa';
alter table public.sequence_enrollments enable row level security;
drop policy if exists "sequence_enrollments: membros leem" on public.sequence_enrollments;
create policy "sequence_enrollments: membros leem" on public.sequence_enrollments for select using (public.is_member(workspace_id));
-- inscrições e envios só pelo servidor

alter table public.messages add column if not exists sequence_id uuid references public.sequences (id) on delete set null;
-- fluxos de mensagem podem inscrever o contato numa sequência
alter table public.inbox_flows add column if not exists sequence_id uuid references public.sequences (id) on delete set null;
