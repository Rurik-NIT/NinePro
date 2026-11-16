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
