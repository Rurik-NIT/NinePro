# 03 — Tela a tela

Formato: **Rota** · Status · Evidência · Estrutura · Comportamento · Observações de UX.

---

## Connections (onboarding) — `/dashboard/connections`
**PARCIAL** · screenshot 01
- Logo central e título "Welcome, let's get you set up", com o subtítulo "A few quick steps and you're ready to go."
- **Stepper vertical numerado** (1–4) em blocos com borda: 1. "How do you want to use Zernio?" (dois cartões ilustrados: *I'll use it myself* / *Build it into my software*) · 2. "Connect your first account or number" (ícones das plataformas à direita) · 3. "Where will you work?" · 4. "Stay in the loop" · link "Skip setup".
- Link secundário em vermelho: "Not sure yet? Connect an account first".
- UX: o onboarding substitui a página de conexões enquanto a configuração não termina. A lista de conexões em si é **DESCONHECIDA**.

## Home — `/dashboard/home`
**CONFIRMADO** · screenshot 02
- Hero centralizado com duas linhas: título forte e segunda linha em cinza ("One connection. / Zernio runs every channel.").
- Grade de duas colunas: à esquerda, "Platforms" (ilustração + CTA "Connect accounts") e "Chat agents" (lista com botões de copiar); à direita, "Quickstart" com tabs *Add to my agent / Build into my app*, passos numerados, segmented control (MCP / CLI), select (Claude Code), bloco de código com botão de copiar.
- Rótulos de seção em "chips" com ícone e borda (`Platforms`, `Quickstart`, `Chat agents`).
- Relevância para o NinePro: baixa (o conteúdo é orientado a desenvolvedores). O que interessa aqui são os padrões de composição: chips de seção e passos numerados.

## Ads › Overview — `/dashboard/ads-overview`
**PARCIAL** · screenshots 03, 04, 05, 06, 07, 08
- **Loading:** skeleton em forma de tabela (barra de filtros + 5 linhas), na mesma geometria do conteúdo final (03).
- **Toolbar:** `[📅 Last 30 days] [⚙ Filter] [▦ Edit cards] [🔖 Views]` e, à direita, um botão-ícone de sincronizar/refresh.
- **Estado vazio:** ícone de megafone, título "No ad accounts connected" e uma linha de explicação. Sem CTA nesta tela.
- **Date range picker** (05): presets à esquerda (Today, Yesterday, Last 7/14/30 days, This month, Last month, Last 90 days); calendário de um mês com o intervalo destacado em tom claro da cor de marca e o dia atual em fundo sólido vermelho; resumo Start/End; botão primário **Apply** em largura total; rodapé "Days in UTC".
- **Filter** (06): menu com cabeçalho "Filters" e item "Goal ›" (submenu; ao passar o mouse, não abriu).
- **Edit cards** (07): drawer à direita de 448px, com "SHOWN · 4" (cards ativos, arrastáveis, removíveis com ×), "ADD A CARD" com busca e lista de métricas com "+". Rodapé: Reset · Cancel · **Apply**. Texto: "Reset brings back the cards for the goal you filter on." Isso **confirma que os cards padrão dependem do objetivo (Goal) filtrado**.
- **Views** (08): menu com "Save current view…" (views salvas da combinação de filtros e cards).

## Ads › Campaigns — `/dashboard/ads-campaigns`
**PARCIAL** · screenshots 09, 10, 11, 12, 13
- **Toolbar:** busca larga ("Search campaigns, ad sets, ads or IDs") + `Filters` + `Columns` + `Views`.
- A busca menciona **campanhas, conjuntos e anúncios**. Isso indica uma tabela hierárquica de três níveis (PARCIAL: não foi vista com dados).
- **Columns** (10): presets com radio (Performance, Leads, Sales, Messages, Delivery) + "Customize columns…" + "Your results and formulas…" (métricas e fórmulas personalizadas: DESCONHECIDO).
- **Customize columns** (11): drawer igual ao de cards; colunas **travadas** (cadeado: Spend, Impressions, Clicks, Conversions, All conv.) e removíveis (CTR); setas ↑↓ para reordenar com o teclado; catálogo completo em `06-data-visualization.md`.
- **Filters:** o botão fica em estado ativo ao clicar, mas nenhum popover apareceu (DESCONHECIDO: pode ser uma barra de filtros que só aparece com dados).
- **Estado vazio com CTAs:** "No ads yet" + explicação + `[⊕ Create ad]` (primário) e `[🚀 Boost post]` (secundário).

## Ads › Create ad (modal)
**CONFIRMADO (estrutura)** · screenshots 12, 13 · *nada foi preenchido nem enviado; fechado com Cancel*
- Modal grande (quase em tela cheia na área de conteúdo), com ícone em caixa, título "Create ad" e subtítulo.
- **Duas colunas:**
  - Esquerda (criativo): Primary text (textarea, contador 0/125), Media (dropzone: "JPG or PNG, recommended 1200x628px, max 30MB"), Headline (contador 0/40), Destination URL.
  - Direita (configuração): Profile (select com indicador colorido "Default"), Platform & account (vazio, com "Go to Connections"), **Goal** (grade 2×2 de opções selecionáveis: Engagement, Traffic, Awareness, Video Views), **Budget** (input `$` + toggle *Per day / Total*), **Targeting** ("All audiences" + "Edit audience"), "advanced ⌄" (revela "Ad name (optional)").
- **Rodapé fixo:** checkbox "Create as paused" (marcado por padrão) · Cancel · **Create ad** (desabilitado até a validação).
- UX: o padrão seguro "criar pausado" vem marcado por padrão; isso é uma boa prática para o NinePro.

## Ads › Creatives — `/dashboard/ads-creatives`
**PARCIAL** · screenshot 14
- Breadcrumb com contador `[0]`. Tabela com colunas CREATIVE · ↓SPEND (ordenação padrão por gasto, desc.) · CTR · RESULTS · COST PER RESULT · ROAS. Estado vazio dentro da tabela.

## Ads › Leads — `/dashboard/ads-leads`
**PARCIAL** · screenshot 15
- Ações no canto direito: Refresh (ícone) + **Export CSV** (desabilitado sem dados). Colunas: LEAD · STATUS · FORM · SOURCE · SUBMITTED. Estado vazio: "Leads from your Instant Forms show here as soon as Meta sends them."

## Ads › Conversions › Overview — `/dashboard/ads-conversions`
**PARCIAL** · screenshot 16
- Select de período compacto ("Last 7 days ⌄"). Estado vazio orientado a ação: "Count every sale in your ads" + explicação em 3 passos + CTA primário "Set up conversion tracking".

## Ads › Conversions › Events — `/dashboard/ads-conversions/events`
**DESCONHECIDO**: a área de conteúdo ficou em branco depois de mais de 6s.

## Ads › Conversions › Destinations
**PARCIAL** · screenshot 17
- Período + CTA primário "Connect platform" à direita. Lista "AD PLATFORMS" em skeleton (avatar redondo + duas linhas).

## Ads › Conversions › Sources
**CONFIRMADO (estado vazio)** · screenshot 18
- Busca + selects "All statuses", "Any install". Tabela WEBSITE · INSTALLED VIA · STATUS · VISITS TODAY · SUBDOMAIN · LAST VISIT · ACTIONS, com estado vazio e CTA "Add website".
- Seção "OTHER SOURCES": lista de integrações com logo + nome + ação "⊕ Connect" (Stripe payments, HubSpot deals, Meta/Google/LinkedIn/TikTok lead forms) + "Your backend, POST /v1/events" com "Read the guide".

## Ads › Audiences — `/dashboard/ads-audiences`
**PARCIAL** · screenshot 19
- Contador `[0]`, Refresh. Colunas AUDIENCE · TYPE · SIZE · STATUS · ACCOUNT · ACTIONS. Estado vazio menciona customer list, lookalike, website retargeting e "reusable targeting recipe". CTA desabilitado sem conta conectada.

## Ads › Lead Forms — `/dashboard/ads-lead-forms`
**PARCIAL** · screenshot 20: só o skeleton de tabela.

## Ads: rotas ocultas (Keywords, Search terms, Bid strategies, Catalogs, Partnership Ads)
**PARCIAL** · screenshot 21
- Mesmo template e o mesmo estado vazio de Campaigns, mudando apenas o breadcrumb. A sidebar mostra a navegação raiz. Hipótese (não confirmada): essas páginas aparecem na navegação quando há contas Google/Meta conectadas.

## Analytics › Posting — `/dashboard/analytics-posting`
**CONFIRMADO (layout)** · screenshots 22, 27
- Toolbar: período + 4 selects (All platforms/profiles/accounts/sources).
- **Faixa de KPIs em grade contínua** (células brancas separadas por linhas de 1px, sem gap): ENGAGEMENT RATE, TOTAL REACH, TOTAL FOLLOWERS, POSTS THIS PERIOD, BEST POST.
- Grade 2×N de painéis de gráfico: Posts per platform · Posts over time (eixo de datas semanal) · Likes per platform (com select de métrica "Likes ⌄") · Likes over time · Best Time to Post · Follower history · Tabela TOP PERFORMING POSTS (POST, ENGAGEMENT, VIEWS, IMPRESSIONS, REACH, ER).
- Cada painel tem título (14px/500) + subtítulo descritivo do recorte ("Posts per week · last 30 days").

## Analytics › Inbox / Website
**PARCIAL** · screenshot 23: skeleton com 3 filtros, 4 KPIs e 2 gráficos. Website: estado vazio "No Google Analytics property connected" + "Connect Google Analytics".

## Posts › All posts — `/dashboard/posts-all`
**PARCIAL** · screenshots 24, 25
- Skeleton em **grade de cards de post** (3 colunas). Toolbar: Filter · "Sort: Scheduled (newest first)" · alternância de visualização (grade / lista / calendário) · densidade de colunas **2 3 4 5** · menu "⋯".

## Settings — `/dashboard/settings?section=…`
**PARCIAL** · screenshot 26 (Profile foi visto, mas não copiado por conter e-mail)
- `/dashboard/settings` abre em **Usage** por padrão.
- Profile: título de seção + descrição; **grupos com borda contendo linhas** (rótulo + descrição à esquerda, controle à direita): Avatar (Upload / Remove em vermelho), Name (input + Save desabilitado até haver mudança); grupo Sign-in (e-mail gerenciado pelo Google).

## Inbox — `/dashboard/inbox-messages`
**PARCIAL** · screenshot 28: skeleton de dois painéis (lista de conversas com avatar + thread com bolhas alternadas + compositor no rodapé).

## Automations — `/dashboard/automations`
**CONFIRMADO** · screenshots 29, 30
- Contador no breadcrumb. Ação "Ad limits" à direita. Tabela NAME (↑ ordenável) · RULE · SCHEDULE · STATUS · ID · ACTIONS. Estado vazio: "Workflows, comment-to-DM automations, ad rules, post automations and event alerts show up here together." + "New automation".
- **Ad limits** (drawer): "Ad automation limits", switch global "Run ad automations" ("Off stops every ad automation of your team"). As contas de anúncio aparecem ali quando uma automação as usa. *Switch não foi tocado.*

## Automations › Templates / Marketplace
**CONFIRMADO** · screenshots 31, 32
- `/automations/templates` → redireciona para `/automation-templates` (breadcrumb duplicado "Templates / Templates": inconsistência do produto de referência).
- Marketplace (`/automation-templates/gallery`, contador 15): busca, "All categories", Filter, alternância lista/grade, "Your templates". Cards com autor e verificado, preço "Free", título, descrição truncada, tags de categoria e de rede, e rodapé com "Connect …", salvar (bookmark) e **Install** (primário).
- Lista completa das 15 regras em `05-interaction-flows.md`.
