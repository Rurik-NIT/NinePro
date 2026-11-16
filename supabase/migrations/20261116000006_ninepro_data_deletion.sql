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
