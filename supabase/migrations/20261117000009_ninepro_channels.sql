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
