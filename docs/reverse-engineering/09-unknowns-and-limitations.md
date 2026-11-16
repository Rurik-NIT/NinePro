# 09 — Desconhecidos e limitações

## L1. REA: RESOLVIDO
Na 1ª rodada não havia endpoint CDP. Na 2ª, o Edge foi aberto com `--remote-debugging-port=9222` num perfil separado, e o usuário fez o login. O REA foi usado de fato (10 chamadas com Evidence IDs). Ver `10-rea-evidence.md`. A limitação que sobra: `analyze_web_bundle` derrubou a conexão pelo volume, e a análise estática cobriu 4 de 62 scripts.

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
