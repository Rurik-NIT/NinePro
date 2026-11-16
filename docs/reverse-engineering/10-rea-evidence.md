# 10 — Evidências REA

**Data:** 2026-11-16 · **Ferramenta:** REA (MCP `rea`), provedores `rea-cdp-browser`, `rea-web-script-export` e análise de aplicação JavaScript.
**Alvo:** Zernio Studio, numa janela do Microsoft Edge 157 com perfil separado (`%LOCALAPPDATA%\ninepro-cdp`) e `--remote-debugging-port=9222`. O usuário fez o login nessa janela; eu não digitei credenciais.
**Sem valores sensíveis:** o REA não retém headers, corpos de requisição/resposta, cookies nem valores de storage (`values_redacted: true`). Corpos de rede ficaram desligados no cenário.

## 1. Registro das chamadas

| # | Operação REA | Evidence ID | Resultado |
|---|---|---|---|
| 1 | `list_browser_targets` | `ev_4665cc6c…` | Edge 157 detectado; alvo `zernio.com/signin` (antes do login) |
| 2 | `list_browser_targets` (origem zernio.com) | `ev_95229677…` | Alvo `427509126C8C…`, `/dashboard`, após o login |
| 3 | `inspect_web_page` (passivo, 1,5 s) | `ev_78a16f4d…` | 742 nós DOM, 404 nós de acessibilidade, 132 scripts, 121 recursos (98 scripts, 17 imagens, 4 fontes, 2 CSS) |
| 4 | `capture_web_screenshot` | `ev_02c57293…` | PNG 1912×948, SHA-256 verificado → `rea/screenshots/rea-01-dashboard.png` |
| 5 | `analyze_web_bundle` | — | **Falhou** (a conexão MCP caiu durante a análise de 98 scripts com fonte). Contornado pelas chamadas 7 a 9 |
| 6 | `capture_browser_scenario` (connect, 10 passos) | `ev_64a612c9…` | 52,4 s, 2.545 eventos de rede, 0 descartados, 0 erros de página, 10/10 passos concluídos → `rea/screenshots/rea-02-scenario-final.png` |
| 7 | `inspect_web_page` (com fontes) | `ev_f32ac76b…` | Fontes capturadas (3,8 MB) |
| 8 | `export_web_scripts` | `ev_78d5a38a…` | 62 scripts exportados com manifesto verificado por digest |
| 9 | `analyze_javascript_application` (4 arquivos selecionados) | `ev_d918df16…` (resumo `ev_7c243d50…`) | 39.022 nós AST, 82 relações de requisição, 39 endpoints |
| 10 | `inspect_analysis_view` (fatos `endpoint`) | `ev_f03a6e98…` | 16 literais de endpoint distintos |

## 2. Achados

### 2.1 Arquitetura (CONFIRMADO)
- **Next.js com React Server Components:** chunks em `/_next/static/immutable/chunks/*` e **96 requisições de prefetch `_rsc`**, uma para cada link da sidebar visível. A navegação é instantânea porque as rotas vizinhas já foram pré-carregadas.
- **Estado no servidor:** `localStorage`, `sessionStorage`, IndexedDB e Cache Storage **vazios** na origem. Filtros e preferências não ficam no navegador. Pode ser por isso que o Zernio perde o contexto ao recarregar (comparar com o NinePro, que persiste período, colunas e densidade).
- **Serviços de terceiros observados na rede:** Stripe (`js.stripe.com`, `r.stripe.com`), Crisp (chat de suporte), PostHog (`/ph-data/*`, proxy na própria origem), monitoramento de erros (`/monitoring`), Meta Pixel e LinkedIn Insight (`px.ads.linkedin.com`), server-side tagging (`sst.zernio.com`), Dub (`dubcdn.com`).

### 2.2 API do módulo Ads (CONFIRMADO em rede; métodos e status observados)

| Método | Endpoint | Status | O que indica |
|---|---|---|---|
| GET | `/api/v1/ads/tree` | 200 | **Árvore campanha → conjunto → anúncio**, paginada no servidor. Parâmetros observados (só nomes): `fromDate`, `toDate`, **`compare`**, `status`, `source`, `page`, `limit` |
| GET | `/api/v1/ads/campaign-results/metrics` | 200 | Métricas de resultado por campanha (alimenta os cards e as colunas) |
| GET | `/api/v1/ads/alerts` | 200 | **Alertas de anúncios gerados no servidor** |
| GET | `/api/v1/ads/leads/counts` | 200 | Contagens de leads (badge/contador) |
| GET | `/api/v1/ads/rules/templates` | 200 | Catálogo de modelos de regra (marketplace) |
| POST | `/api/v1/ads/sync` | 200 | **Sincronização disparada automaticamente pela página** ao abrir Campanhas (ver §3) |
| GET | `/api/v1/accounts`, `/api/v1/profiles` | 200 | Contas conectadas e perfis (o "Profile" do Create ad) |
| GET | `/api/v1/user/ads-access` | — | Verificação de acesso ao módulo Ads (sem status registrado: requisição não concluída na janela) |

### 2.3 Endpoints recuperados por análise estática (PARCIAL: existem no código; não foram exercitados)
`/api/v1/automations`, `/automations/catalog`, `/automations/templates`, **`/automations/preview`**, **`/automations/backtest`**, **`/automations/controls`**, **`/automations/controls/ad-accounts`**, `/api/v1/comment-automations`, `/api/v1/workflows`, `/api/v1/users/me/workspace-preferences`, `/api/v1/users/me/leave`, `/api/v1/billing/cancel-metronome`.

**Leitura:**
- `preview` e `backtest` indicam que uma regra pode ser **simulada contra o histórico** antes de ser ativada.
- `controls/ad-accounts` corresponde ao drawer "Ad automation limits", que lista as contas de anúncio usadas pelas regras.
- **Status: PARCIAL.** A UI correspondente não apareceu porque a conta não tem contas de anúncio conectadas.

## 3. Transparência sobre efeitos
- Todas as navegações do cenário foram **GET** de páginas.
- A própria aplicação emitiu **POSTs automáticos** ao carregar as telas: telemetria (`/monitoring` ×22, PostHog ×20, pixel do Facebook ×5), `tracking/refresh` ×5, `voice/calls/web/inbound` ×5 e **`ads/sync` ×1**. Nenhum deles veio de clique ou formulário meu. O `ads/sync` é comportamento de carregamento da tela de Campanhas; sem contas conectadas, não havia o que sincronizar.
- Nenhum formulário foi enviado, nenhuma regra instalada, nenhuma configuração alterada.

## 4. O que mudou na engenharia reversa por causa do REA

| Antes (painel do navegador) | Agora (REA) |
|---|---|
| Hierarquia campanha → conjunto → anúncio **PARCIAL** (inferida da busca) | **CONFIRMADA** pelo endpoint `ads/tree` |
| Comparação com período anterior **DESCONHECIDA** | **CONFIRMADA** como capacidade da API (`compare`) |
| Alertas de anúncio: não observados | **CONFIRMADOS** como endpoint (`ads/alerts`); a UI ainda é desconhecida |
| Simulação de regras: não observada | **PARCIAL** (`automations/preview`, `automations/backtest` no código) |
| Persistência de filtros: desconhecida | **CONFIRMADO:** nada fica no navegador |

## 5. Implicações para o NinePro
1. A tabela de campanhas já segue o modelo de árvore. Quando houver backend, o contrato natural é paginar no servidor por nível, com `compare`.
2. Os "Pontos de atenção" da visão geral têm equivalente real (`ads/alerts`). Hoje são derivados localmente das métricas fictícias.
3. **"Simular regra" (backtest) — IMPLEMENTADO no NinePro** a partir deste achado. A UI do Zernio para isso não foi observada, então o fluxo e o modelo de cálculo são desenho próprio (`src/lib/ruleSimulation.ts`, `src/pages/automations/RuleSimulation.tsx`). O modelo é simplificado e declarado na tela.

## 6. Limitações
- `analyze_web_bundle` derrubou a conexão MCP pelo volume. A análise estática cobriu **4 dos 62 scripts exportados** (os que referenciam a API de Ads/automações); os outros 58 ficaram fora do escopo, e as relações deles são desconhecidas.
- Os scripts exportados vieram da página do marketplace. Chunks carregados só em outras rotas não entraram na exportação.
- Sem contas de anúncio conectadas, os corpos das respostas teriam vindo vazios. Por política, não os capturei.

## 7. Arquivos
- `rea/screenshots/rea-01-dashboard.png`: screenshot do REA (SHA-256 verificado).
- `rea/screenshots/rea-02-scenario-final.png`: estado final do cenário.
- As evidências brutas completas (JSON, de 0,3 a 3,8 MB) ficaram nos resultados da sessão e **não foram versionadas** por tamanho; este documento registra os IDs.
