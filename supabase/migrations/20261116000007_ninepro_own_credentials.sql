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
