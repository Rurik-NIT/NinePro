# 01 — Mapa de navegação

## 1. Estrutura do shell (CONFIRMADO)

```
┌──────────── 240px ────────────┬──────────────────────────────────────────────┐
│ [logo] STUDIO        Switch ⌃ │ [▣] Módulo / Página          [Search… ⌘K][Docs][Support] │ 56px
├───────────────────────────────┼──────────────────────────────────────────────┤
│ Navegação (raiz ou drill-down)│ Toolbar da página (filtros, período, views)  │
│                               │ Conteúdo                                      │
│ … grupos com rótulo           │                                               │
│ [Card promocional]            │                                               │
│ Settings                   >  │                                               │
│ (avatar) Rurik             ⌃  │                                               │
└───────────────────────────────┴──────────────────────────────────────────────┘
```

- Não há título H1 de página: o **breadcrumb no header** cumpre o papel do título (`Ads / Campaigns`), às vezes com um contador ao lado (`Creatives [0]`, `Marketplace [15]`). Evidência: screenshots 09, 14, 32.
- O botão "Toggle sidebar" (ícone ▣ à esquerda do breadcrumb) recolhe a sidebar. A largura recolhida declarada no CSS é `--size-sidebar-collapsed: 56px`. O estado recolhido em si foi visto apenas no mobile.

## 2. Sidebar raiz (CONFIRMADO; screenshot 02)

| Grupo | Item | Rota | Tem submenu |
|---|---|---|---|
| — | Home | `/dashboard/home` | não |
| — | Connections | `/dashboard/connections` | não |
| — | Posts | `/dashboard/posts-all` | sim |
| — | Analytics | `/dashboard/analytics-posting` | sim |
| — | Inbox | `/dashboard/inbox-messages` | sim |
| — | Ads | `/dashboard/ads-overview` | sim |
| — | Automations | `/dashboard/automations` | sim |
| — | Commerce | `/dashboard/commerce-products` | sim |
| — | Creators | `/dashboard/creator-campaigns` | não |
| Communications | WhatsApp | `/dashboard/whatsapp-overview` | sim |
| Communications | iMessage | `/dashboard/imessage-overview` | sim |
| Communications | Phone | `/dashboard/phone-numbers-overview` | sim |
| Developers | API Keys, Users, Webhooks, Logs | `/dashboard/api-keys` … | não (DOM confirma; ficam escondidos atrás do card promocional no viewport capturado) |
| rodapé | Settings | `/dashboard/settings` | sim |
| rodapé | Menu do usuário | — | dropdown |

## 3. Padrão de drill-down (CONFIRMADO; comportamento-chave)

Ao entrar em um módulo com submenu, **a sidebar inteira é substituída** pelo submenu do módulo, encabeçado por `‹ Nome do módulo` (link de volta). Os itens podem ter **grupos rotulados próprios**.

Exemplo: Ads (screenshot 04)

```
‹ Ads
  Overview · Campaigns · Creatives · Leads
Conversions
  Overview · Events · Destinations · Sources
Assets
  Audiences · Lead Forms
```

Outros submenus observados:

- **Analytics:** Posting · Inbox · Website (screenshot 22)
- **Posts:** All posts · Queues (screenshot 25)
- **Inbox:** Messages · Comments · Reviews · Mentions · Campaigns · Workflows · Contacts (screenshot 28)
- **Automations:** All automations · Templates (screenshot 29)
- **Settings:** Profile · Usage · Billing · Security · Content retention · Notifications · Connected apps · Slack · Leaderboard · AI providers · White Labeling · Single sign-on · **Danger Zone** (em vermelho) (screenshot 26)
- **Commerce, WhatsApp, iMessage, Phone:** os itens vêm da paleta ⌘K (seção 5); a sidebar desses módulos **NÃO INVESTIGADO** visualmente.

**Exceção observada:** rotas que existem mas não estão na sidebar (ex.: `/dashboard/ads-keywords`) renderizam a **sidebar raiz**, não o drill-down de Ads (screenshot 21).

## 4. Inventário de rotas (CONFIRMADO; extraído dos bundles JS carregados)

77 rotas `/dashboard/*` encontradas em 121 scripts carregados pela página.

**Ads (16):** `ads-overview`, `ads-campaigns`, `ads-creatives`, `ads-leads`, `ads-conversions`, `ads-conversions/events`, `ads-conversions/destinations`, `ads-conversions/sources`, `ads-audiences`, `ads-lead-forms`, e as ocultas `ads-account`, `ads-bid-strategies`, `ads-catalogs`, `ads-keywords`, `ads-partnership`, `ads-search-terms`
**Analytics (3):** `analytics-posting`, `analytics-inbox`, `analytics-website`
**Automations (5):** `automations`, `automations/new`, `automations/templates` (redireciona para `automation-templates`), `automation-templates`, `automation-templates/gallery`
**Posts (2):** `posts-all`, `posts-queues` · **Extra:** `hashtag-research`, `live`
**Inbox (7):** `inbox-messages`, `inbox-comments`, `inbox-reviews`, `inbox-mentions`, `inbox-campaigns`, `inbox-workflows`, `inbox-contacts`
**Commerce (4):** `commerce-products`, `commerce-collections`, `commerce-discounts`, `commerce-catalog-sync`
**WhatsApp (6):** `whatsapp`, `whatsapp-overview`, `whatsapp-templates`, `whatsapp-flows`, `whatsapp-groups`, `whatsapp-conversions`
**iMessage (3):** `imessage-overview`, `imessage-opt-in`, `imessage-audience`
**Phone (7):** `phone-numbers`, `phone-numbers-overview`, `calls`, `sip-trunks`, `branded-calling`, `sms-registration`, `sender-ids`, `rcs`
**Conta e desenvolvedor:** `api-keys`, `users`, `webhooks`, `logs`, `settings`, `usage`, `billing`, `balance`, `connections`, `home`, `creator-campaigns`
**Produto CONSOLE (11):** `console-api-keys`, `console-apps`, `console-logs`, `console-numbers`, `console-platforms`, `console-profiles`, `console-sessions`, `console-settings`, `console-team`, `console-webhooks` (NÃO INVESTIGADO)

Observação: Settings usa **query string** para as seções (`/dashboard/settings?section=profile`), não rotas próprias (CONFIRMADO).

## 5. Navegação global

- **Seletor de produto "Switch"** (CONFIRMADO): dropdown com dois produtos, **CONSOLE** ("Build for your users and their accounts") e **STUDIO** ("Run your own accounts and channels"), cada um com ícone e descrição. *Screenshot não copiado (exibia o e-mail da conta ao fundo).*
- **Paleta de comando ⌘K** (CONFIRMADO, via texto do DOM; o screenshot não pegou o diálogo aberto):
  - *Actions:* Create post, Connect account, Copy link to this page (`C U`), Failed posts, Scheduled posts, Drafts, Posts pending approval, Posts calendar, Create API key, Invite teammate, Create webhook, Buy phone number, View logs, Security and two-step verification, Create automation, Pin this page, Keyboard shortcuts (`?`)
  - *Pages:* todas as páginas, com o módulo como sufixo e atalhos `G + letra` (G H Home, G C Connections, G P Posts, G A Analytics, G I Inbox, G U Automations, G K API Keys, G W Webhooks, G L Logs, G S Settings)
  - *Theme:* System · Light · Dark
  - *Resources:* Documentation, API reference, Changelog, Support
  - Rodapé de teclas: `↵ Open`, `↑↓ Move`, `esc Close`
- **Menu do usuário** (CONFIRMADO): cabeçalho com nome e e-mail · Usage · Billing · Settings · Dark mode · **Sign out** (em vermelho, separado por divisor).
- **Header:** Search (⌘K), Docs (link externo `docs.zernio.com`), Support (abre chat).
