-- NinePro · publicação completa: opções por rede, horário por rede, aprovação, reciclagem
-- e as redes Pinterest, Google Meu Negócio e Slack.

alter type public.platform add value if not exists 'pinterest';
alter type public.platform add value if not exists 'google_business';
alter type public.platform add value if not exists 'slack';

alter table public.channel_accounts drop constraint if exists channel_accounts_kind_check;
alter table public.channel_accounts add constraint channel_accounts_kind_check
  check (kind in ('whatsapp', 'instagram', 'facebook', 'threads', 'linkedin_social', 'youtube', 'tiktok_social', 'x', 'telegram', 'discord', 'bluesky', 'pinterest', 'google_business', 'slack'));

-- opções por rede (primeiro comentário, thread, enquete, privacidade…) e horário diferente por rede
alter table public.posts add column if not exists options jsonb not null default '{}'::jsonb;
alter table public.posts add column if not exists times jsonb not null default '{}'::jsonb;

-- aprovação
alter table public.posts add column if not exists source text not null default 'app';
alter table public.posts add column if not exists reviewed_by uuid references auth.users (id) on delete set null;
alter table public.posts add column if not exists reviewed_at timestamptz;
alter table public.posts add column if not exists review_note text;
alter table public.workspaces add column if not exists approval_policy text not null default 'nenhuma';
alter table public.workspaces drop constraint if exists workspaces_approval_policy_check;
alter table public.workspaces add constraint workspaces_approval_policy_check check (approval_policy in ('nenhuma', 'agentes', 'membros', 'todos'));

-- reciclagem (publicar de novo de tempos em tempos)
alter table public.posts add column if not exists recycling jsonb;
alter table public.posts add column if not exists recycled_from uuid references public.posts (id) on delete set null;
alter table public.posts add column if not exists recycle_count integer not null default 0;
create index if not exists posts_recycled_from_idx on public.posts (recycled_from) where recycled_from is not null;

-- Quem não é admin não tira uma publicação da aprovação direto pelo banco (o servidor usa a chave de serviço).
create or replace function public.posts_guard_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare pol text;
begin
  if auth.uid() is null or public.is_admin(new.workspace_id) then return new; end if;
  select approval_policy into pol from public.workspaces where id = new.workspace_id;
  if pol in ('membros', 'todos') and new.status in ('agendada', 'publicada', 'parcial')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    raise exception 'Este espaço exige aprovação de um administrador antes de publicar.';
  end if;
  return new;
end $$;
drop trigger if exists t_posts_guard_approval on public.posts;
create trigger t_posts_guard_approval before insert or update on public.posts for each row execute function public.posts_guard_approval();
