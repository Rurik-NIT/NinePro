# 09 — Desconhecidos e limitações

## L1. REA sem alvo inspecionável (bloqueia o critério de aceitação nº 1)
- **Fato:** o MCP `rea` está conectado e expõe ~200 ferramentas, incluindo as web (`list_browser_targets`, `inspect_web_page`, `capture_web_screenshot`, `analyze_web_bundle`, `observe_web_session`, `inspect_web_event_listeners`).
- **Bloqueio:** todas exigem `cdp_endpoint` em loopback. O painel do navegador do app não expõe CDP para o shell; o Claude in Chrome não está conectado; o Edge está aberto sem `--remote-debugging-port`.
- **Alternativas, em ordem de preferência:**
  1. Abrir o Edge num perfil separado com `--remote-debugging-port=9222 --user-data-dir=%LOCALAPPDATA%\ninepro-cdp`; você faz o login no Zernio; o REA roda `inspect_web_page` + `analyze_web_bundle` (rotas, endpoints, vendors) e `observe_web_session` enquanto navegamos.
  2. Análise estática com o REA (`analyze_javascript_application` / `recover_javascript_sources`) dos bundles JS do Zernio salvos localmente. **Exige a sua permissão para baixar os arquivos.**
- Até lá, toda evidência vem das ferramentas do painel do navegador, e está declarada assim.

## L2. Conta sem dados
Nenhuma conta de anúncio, rede social ou GA4 conectada. Por isso são **DESCONHECIDOS**:
- tabela de campanhas com dados, hierarquia campanha → conjunto → anúncio, edição inline, status de entrega, toggles de ligar/pausar;
- página de detalhe de campanha ou anúncio;
- gráficos de Ads, comparação com o período anterior, tooltips;
- detalhe de lead e status de lead;
- conteúdo dos presets de colunas e o formulário de "Your results and formulas";
- `ads-account`, `ads-conversions/events` (renderizaram vazias).
**Como resolver:** usar uma conta de demonstração com dados, ou você conecta uma conta de anúncios de teste. **Eu não conecto contas.**

## L3. Interações não executadas de propósito (regra de preservação)
Install de template, Create ad, Boost post, Apply em drawers, Save view, Upload/Remove avatar, switch "Run ad automations", Sign out, troca para CONSOLE, troca real de tema. Assim, os toasts, os diálogos de confirmação e as mensagens de sucesso e erro ficaram **NÃO INVESTIGADOS**.

## L4. Não investigado nesta rodada
Commerce, Creators, WhatsApp, iMessage, Phone, Developers (API Keys, Users, Webhooks, Logs), Posts › Queues, Inbox (com conteúdo), Settings além de Profile, produto CONSOLE, tablet, tabelas no mobile, tooltips, menus de contexto, estados de erro (nenhum erro ocorreu).

## L5. Inconsistências do próprio produto de referência (não copiar)
- Seletor de período diferente em Ads Overview (picker completo) e em Conversions (select compacto).
- Breadcrumb duplicado "Templates / Templates".
- O botão "Filters" em Campaigns fica ativo sem mostrar nenhum painel.
- Rotas ocultas de Ads exibem a sidebar raiz em vez do drill-down.
- Carregamentos lentos (6–12s) em várias páginas, com skeletons longos.

## L6. Behance / CoachIQ — RESOLVIDO
O Behance respondeu HTTP 403 no painel. O usuário baixou as 25 pranchas com `gallery-dl`; elas estão em `docs/visual-reference/coachiq/` e a análise está em `docs/visual-reference/coachiq-analysis.md`.
