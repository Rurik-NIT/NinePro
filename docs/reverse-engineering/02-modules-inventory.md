# 02 — Inventário de módulos

Relevância para o NinePro: **Núcleo** = gestão de tráfego pago · **Apoio** = operação de marketing adjacente · **Fora** = fora do escopo inicial (não implementar sem decisão explícita).

| Módulo | Páginas | Status da investigação | Relevância NinePro |
|---|---|---|---|
| **Ads: Overview** | KPIs configuráveis + filtros | PARCIAL (só estado vazio; drawer de cards CONFIRMADO) | **Núcleo** |
| **Ads: Campaigns** | Tabela de campanhas, conjuntos e anúncios | PARCIAL (toolbar, presets de colunas e catálogo CONFIRMADOS; tabela com dados DESCONHECIDA) | **Núcleo** |
| **Ads: Create ad** | Modal de criação | CONFIRMADO (estrutura); envio não testado de propósito | **Núcleo** |
| **Ads: Creatives** | Tabela de performance por criativo | PARCIAL (cabeçalhos CONFIRMADOS) | **Núcleo** |
| **Ads: Leads** | Tabela de leads de Instant Forms + Export CSV | PARCIAL | **Núcleo** |
| **Ads: Conversions** (Overview, Events, Destinations, Sources) | Rastreamento de conversões | PARCIAL (Sources CONFIRMADO; Events nunca carregou) | **Núcleo** |
| **Ads: Audiences** | Públicos (lista, lookalike, retargeting, receitas) | PARCIAL | **Núcleo** |
| **Ads: Lead Forms** | Formulários de lead | PARCIAL (só skeleton) | Núcleo |
| Ads ocultos: Keywords, Search terms, Bid strategies, Catalogs, Partnership Ads | Mesmo template da tabela de campanhas | PARCIAL | Núcleo (Google/Meta avançado) |
| Ads: Account | `ads-account` | DESCONHECIDO (página vazia sem texto) | Núcleo |
| **Automations** | Lista unificada + Ad limits + Templates + Marketplace | CONFIRMADO (lista vazia, drawer Ad limits, 15 modelos de regras de anúncio) | **Núcleo** (regras de orçamento) |
| **Analytics: Posting** | KPIs + 6 gráficos + tabela top posts | CONFIRMADO (layout; dados vazios) | Apoio |
| Analytics: Inbox | KPIs + gráficos | PARCIAL (skeleton) | Fora/Apoio |
| Analytics: Website | GA4 | PARCIAL (estado vazio "Connect Google Analytics") | Apoio |
| **Connections** | Onboarding + conexão de contas | PARCIAL (onboarding em 4 passos visto) | **Núcleo** (contas de anúncio) |
| Home | Hero + Quickstart para agentes/API | CONFIRMADO | Fora (orientado a dev) |
| Posts | All posts (grade/lista/calendário), Queues | PARCIAL | Apoio (criativos/boost) |
| Inbox | Mensagens em dois painéis + 6 subpáginas | PARCIAL (skeleton) | Fora |
| Commerce | Products, Collections, Discounts, Catalog sync | NÃO INVESTIGADO | Fora (catálogos podem servir a anúncios de catálogo) |
| Creators | Campanhas com creators | NÃO INVESTIGADO | Fora |
| WhatsApp / iMessage / Phone | Canais de mensageria | NÃO INVESTIGADO | Fora |
| Developers (API Keys, Users, Webhooks, Logs) | — | NÃO INVESTIGADO | Apoio (Users = equipe) |
| **Settings** | 13 seções | PARCIAL (submenu e Profile CONFIRMADOS) | **Núcleo** (perfil, equipe, notificações, billing) |
| Produto CONSOLE | 11 rotas | NÃO INVESTIGADO | Fora |

## Hipótese de mapeamento para o NinePro (não é requisito; precisa da sua validação)

| Possibilidade citada no briefing | Evidência no sistema de referência |
|---|---|
| Dashboard | Ads › Overview (KPIs configuráveis por objetivo) |
| Gestão de campanhas | Ads › Campaigns (+ ocultas: keywords, search terms, bid strategies) |
| Contas de anúncios / Plataformas | Connections + `ads-account` + Conversions › Destinations |
| Criativos | Ads › Creatives |
| Métricas / Relatórios | Catálogo de métricas (06) + presets de colunas + Views salvas |
| Investimentos / Orçamentos | Budget no Create ad + regras "Scale winners", "Budget ladder", "Reset budgets" + Ad limits |
| Automações | Automations + Marketplace de regras |
| Gestão de equipe | Settings + Users |
| Configurações | Settings |
| Clientes, Projetos, Tarefas | **Sem evidência no Zernio.** O mais próximo é o seletor de "Profile" no Create ad (`Profile: Default`), que sugere uma separação por perfis ou marcas. **Não implementar como requisito confirmado.** |
