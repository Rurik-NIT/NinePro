-- =====================================================================
-- NinePro — dados de demonstração sob demanda
-- public.seed_demo_workspace(ws) popula um workspace com contas, campanhas,
-- conjuntos, anúncios, 90 dias de métricas, leads, formulários, públicos,
-- eventos de conversão, publicações e conversas. Só admins do workspace podem chamar.
-- Os registros recebem nomes com "(demo)" quando aplicável para não se confundirem com dados reais.
-- =====================================================================

create or replace function public.seed_demo_workspace(ws uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  acc_meta uuid; acc_google uuid; acc_tiktok uuid; acc_li uuid;
  c record; s uuid; a uuid; f_vip uuid; f_b2b uuid;
  n int;
begin
  if not public.is_admin(ws) then raise exception 'sem permissão para popular este workspace'; end if;
  if exists (select 1 from public.campaigns where workspace_id = ws) then raise exception 'o workspace já tem campanhas'; end if;

  insert into public.ad_accounts (workspace_id, platform, external_id, name) values
    (ws, 'meta', 'demo-meta', 'Loja Aurora — BM principal (demo)') returning id into acc_meta;
  insert into public.ad_accounts (workspace_id, platform, external_id, name) values
    (ws, 'google', 'demo-google', 'Aurora Search (demo)') returning id into acc_google;
  insert into public.ad_accounts (workspace_id, platform, external_id, name) values
    (ws, 'tiktok', 'demo-tiktok', 'Aurora TikTok (demo)') returning id into acc_tiktok;
  insert into public.ad_accounts (workspace_id, platform, external_id, name) values
    (ws, 'linkedin', 'demo-linkedin', 'Aurora B2B (demo)') returning id into acc_li;

  for c in
    select * from (values
      ('Black Friday — Prospecção ampla', acc_meta, 'vendas'::objective, 'active'::delivery_status, 1800, 24.0, 0.017, 0.032, 260),
      ('Remarketing — Carrinho 7d', acc_meta, 'vendas', 'active', 650, 24.0, 0.017, 0.032, 260),
      ('Captação — Lista VIP', acc_meta, 'leads', 'active', 420, 24.0, 0.012, 0.09, 0),
      ('Shopping — Catálogo completo', acc_google, 'vendas', 'active', 1500, 38.0, 0.017, 0.032, 260),
      ('Pesquisa — Marca', acc_google, 'trafego', 'active', 380, 38.0, 0.045, 0.018, 210),
      ('Pesquisa — Concorrentes', acc_google, 'vendas', 'limited', 520, 38.0, 0.017, 0.032, 260),
      ('Spark Ads — Criadores', acc_tiktok, 'vendas', 'active', 700, 14.0, 0.017, 0.032, 260),
      ('ABM — Decisores varejo', acc_li, 'leads', 'active', 480, 92.0, 0.012, 0.09, 0)
    ) as t(name, acc, obj, st, budget, cpm, ctr, cvr, aov)
  loop
    insert into public.campaigns (workspace_id, ad_account_id, name, objective, status, budget, started_at)
    values (ws, c.acc, c.name, c.obj, c.st, c.budget, current_date - 120) returning id into s;
    -- um conjunto e dois anúncios por campanha
    insert into public.ad_sets (workspace_id, campaign_id, name, audience, status)
    values (ws, s, 'Conjunto A — ' || c.name, 'Lookalike 1% compradores', c.st) returning id into a;
    for n in 1..2 loop
      with ad as (
        insert into public.ads (workspace_id, ad_set_id, name, format, status)
        values (ws, a, case n when 1 then 'Vídeo depoimento' else 'Carrossel mais vendidos' end, case n when 1 then 'Vídeo' else 'Carrossel' end, c.st)
        returning id
      )
      insert into public.ad_metrics_daily (workspace_id, ad_id, date, spend, impressions, reach, clicks, link_clicks, conversions, leads, purchases, revenue)
      select ws, ad.id, d::date, sp,
             (sp / c.cpm * 1000)::bigint,
             (sp / c.cpm * 1000 / 1.8)::bigint,
             (sp / c.cpm * 1000 * c.ctr)::bigint,
             (sp / c.cpm * 1000 * c.ctr * 0.7)::bigint,
             (sp / c.cpm * 1000 * c.ctr * c.cvr)::bigint,
             case when c.obj = 'leads' then (sp / c.cpm * 1000 * c.ctr * c.cvr)::bigint else 0 end,
             case when c.obj = 'leads' then 0 else (sp / c.cpm * 1000 * c.ctr * c.cvr)::bigint end,
             case when c.obj = 'leads' then 0 else (sp / c.cpm * 1000 * c.ctr * c.cvr) * c.aov * (0.85 + random() * 0.35) end
      from ad, generate_series(current_date - 89, current_date, interval '1 day') d,
           lateral (select round((c.budget / 2.0 * (0.8 + random() * 0.3) * case when extract(dow from d) in (0, 6) then 0.82 else 1 end)::numeric, 2) as sp) x;
    end loop;
  end loop;

  insert into public.lead_forms (workspace_id, platform, name, status) values (ws, 'meta', 'Lista VIP Verão', 'Ativo') returning id into f_vip;
  insert into public.lead_forms (workspace_id, platform, name, status) values (ws, 'linkedin', 'Orçamento B2B', 'Ativo') returning id into f_b2b;

  insert into public.leads (workspace_id, form_id, platform, name, email, status, submitted_at)
  select ws, case when i % 3 = 0 then f_b2b else f_vip end, case when i % 3 = 0 then 'linkedin'::platform else 'meta'::platform end,
         (array['Ana','Bruno','Carla','Diego','Elisa','Fábio','Gabriela','Heitor','Isabela','João'])[1 + i % 10] || ' ' ||
         (array['Almeida','Barros','Cardoso','Duarte','Lima','Moreira','Rocha'])[1 + i % 7],
         'lead' || i || '@exemplo.com',
         (array['novo','novo','contatado','qualificado','venda','descartado'])[1 + i % 6]::lead_status,
         now() - (i || ' hours')::interval * 7
  from generate_series(1, 40) i;

  insert into public.audiences (workspace_id, ad_account_id, name, type, size, status) values
    (ws, acc_meta, 'Compradores 180 dias (demo)', 'Lista de clientes', 18400, 'Pronto'),
    (ws, acc_meta, 'Semelhante 1% — compradores (demo)', 'Semelhante', 2100000, 'Pronto'),
    (ws, acc_google, 'Visitantes 30 dias sem compra (demo)', 'Retargeting do site', 52300, 'Pronto');

  insert into public.tracked_sites (workspace_id, domain, installed_via, subdomain) values
    (ws, 'lojaaurora-demo.com.br', 'Loja virtual', 't.lojaaurora-demo.com.br');

  insert into public.conversion_events (workspace_id, type, source, sent_to, page, value, status, received_at)
  select ws, (array['Compra','Compra','Lead','Cadastro','Início de checkout'])[1 + i % 5], 'Site (tag)', array['meta','google']::platform[],
         '/checkout/obrigado', case when i % 5 < 2 then 90 + (i * 37) % 700 else 0 end,
         case when i % 9 = 0 then 'Parcial' else 'Aceito' end, now() - (i || ' hours')::interval * 2
  from generate_series(1, 60) i;

  insert into public.posts (workspace_id, content, channels, status, scheduled_at, published_at)
  select ws, (array['Coleção Verão chegou ☀️','Frete grátis até domingo!','Bastidores do ensaio de verão'])[1 + i % 3],
         array['Instagram','Facebook'],
         (array['agendada','publicada','rascunho'])[1 + i % 3]::post_status,
         case when i % 3 = 0 then now() + (i || ' days')::interval end,
         case when i % 3 = 1 then now() - (i || ' days')::interval end
  from generate_series(1, 12) i;

  insert into public.automation_settings (workspace_id) values (ws) on conflict do nothing;
end $$;

revoke all on function public.seed_demo_workspace(uuid) from public;
grant execute on function public.seed_demo_workspace(uuid) to authenticated;
