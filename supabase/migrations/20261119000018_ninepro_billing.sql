-- NinePro · planos e assinatura por espaço de trabalho (empresa/cliente).
-- Teste grátis de 14 dias para espaços novos e para os que já existem (a contar de agora).

alter table public.workspaces add column if not exists plan text not null default 'teste';
alter table public.workspaces add column if not exists plan_status text not null default 'teste';
alter table public.workspaces add column if not exists trial_ends_at timestamptz default (now() + interval '14 days');
alter table public.workspaces add column if not exists current_period_end timestamptz;
alter table public.workspaces add column if not exists stripe_customer_id text;
alter table public.workspaces add column if not exists stripe_subscription_id text;
alter table public.workspaces add column if not exists billing_note text;
alter table public.workspaces drop constraint if exists workspaces_plan_check;
alter table public.workspaces add constraint workspaces_plan_check check (plan in ('teste', 'essencial', 'profissional', 'agencia'));
alter table public.workspaces drop constraint if exists workspaces_plan_status_check;
alter table public.workspaces add constraint workspaces_plan_status_check check (plan_status in ('teste', 'ativo', 'atrasado', 'cancelado'));
update public.workspaces set trial_ends_at = now() + interval '14 days' where plan_status = 'teste' and trial_ends_at is null;
create index if not exists workspaces_stripe_customer_idx on public.workspaces (stripe_customer_id) where stripe_customer_id is not null;

-- Plano e cobrança só mudam pelo servidor (Stripe ou super admin), nunca direto pelo navegador.
create or replace function public.workspaces_guard_billing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.plan is distinct from old.plan or new.plan_status is distinct from old.plan_status or new.trial_ends_at is distinct from old.trial_ends_at
     or new.current_period_end is distinct from old.current_period_end or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id or new.billing_note is distinct from old.billing_note then
    raise exception 'O plano só pode ser alterado pela assinatura.';
  end if;
  return new;
end $$;
drop trigger if exists t_workspaces_guard_billing on public.workspaces;
create trigger t_workspaces_guard_billing before update on public.workspaces for each row execute function public.workspaces_guard_billing();
