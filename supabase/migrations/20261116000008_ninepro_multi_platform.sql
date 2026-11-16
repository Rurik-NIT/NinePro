-- NinePro — várias plataformas de anúncio (Google Ads com contas sob MCC, TikTok, LinkedIn).
-- Rode no SQL Editor depois das migrações 1 a 7. Pode rodar mais de uma vez.

-- Conta de administrador (MCC) por onde a conta é acessada (Google Ads)
alter table public.ad_accounts add column if not exists parent_external_id text;

-- O mesmo ID externo pode existir em plataformas diferentes: a chave única passa a considerar a conta
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'campaigns_ws_external_key') then
    alter table public.campaigns drop constraint campaigns_ws_external_key;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaigns_account_external_key') then
    alter table public.campaigns add constraint campaigns_account_external_key unique (ad_account_id, external_id);
  end if;
  if exists (select 1 from pg_constraint where conname = 'ad_sets_ws_external_key') then
    alter table public.ad_sets drop constraint ad_sets_ws_external_key;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ad_sets_campaign_external_key') then
    alter table public.ad_sets add constraint ad_sets_campaign_external_key unique (campaign_id, external_id);
  end if;
  if exists (select 1 from pg_constraint where conname = 'ads_ws_external_key') then
    alter table public.ads drop constraint ads_ws_external_key;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ads_set_external_key') then
    alter table public.ads add constraint ads_set_external_key unique (ad_set_id, external_id);
  end if;
end $$;
