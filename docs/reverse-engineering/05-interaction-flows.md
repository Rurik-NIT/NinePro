# 05 — Fluxos de interação

## F1. Entrar em um módulo (CONFIRMADO)
Clicar em "Ads" na sidebar raiz → navega para `/ads-overview` → a sidebar troca para o submenu de Ads com `‹ Ads` → o conteúdo mostra um skeleton → depois o conteúdo real (ou o estado vazio). `‹ Ads` volta para a sidebar raiz (comportamento inferido pelo link; o clique **não foi testado**: PARCIAL).

## F2. Recortar o período (CONFIRMADO até a aplicação)
`Last 30 days` → popover com presets e calendário → escolher o intervalo → **Apply** confirma (não aplicado no teste; fechado com Esc). Os dias estão em UTC. Em Conversions o período usa um select compacto ("Last 7 days"), não o picker completo: **inconsistência do produto de referência**.

## F3. Configurar os KPIs do Overview (CONFIRMADO até Apply)
`Edit cards` → drawer → remover (×) / adicionar (+) / arrastar para reordenar ("top to bottom is left to right") → Apply. O **Reset** volta aos cards padrão do **Goal** filtrado. Implicação: os KPIs padrão mudam conforme o objetivo da campanha (ex.: Leads → Cost per lead).

## F4. Configurar as colunas da tabela de campanhas (CONFIRMADO até Apply)
`Columns` → preset (Performance / Leads / Sales / Messages / Delivery) **ou** "Customize columns…" → drawer com colunas travadas e removíveis → Apply. "Your results and formulas…" sugere métricas personalizadas (DESCONHECIDO).

## F5. Salvar uma visualização (PARCIAL)
`Views` → "Save current view…". O formulário de salvar não foi aberto.

## F6. Criar anúncio (CONFIRMADO até o formulário; nada enviado)
Campaigns (vazio) → `Create ad` → modal de duas colunas → criativo (texto, mídia, headline, URL) + Profile + Platform & account + Goal + Budget (diário/total) + Targeting + advanced → "Create as paused" (padrão: marcado) → Create ad (habilitado só com os dados válidos). Sem conta conectada, o modal oferece "Go to Connections".
Alternativa: `Boost post` (NÃO INVESTIGADO).

## F7. Configurar o rastreamento de conversões (PARCIAL)
Conversions Overview → "Set up conversion tracking" (assistente em 3 passos: onde acontecem as vendas → tag no site → plataformas de destino; não aberto). Sources → "Add website" ou "Connect" em integrações (Stripe, HubSpot, lead forms das redes) ou a API `POST /v1/events`.

## F8. Regras automáticas de anúncios (CONFIRMADO: catálogo)
Automations → Templates → Marketplace → card → **Install** (não clicado). Antes disso, cada card exige "Connect Meta Ads" / "Connect Google Ads".
Controle global: "Ad limits" → switch "Run ad automations" (desliga todas as automações de anúncio da equipe).

### As 15 regras do marketplace (CONFIRMADO, texto literal resumido)

| Regra | Categoria | Rede |
|---|---|---|
| Stop losers: pausa conjuntos com custo por resultado acima da meta depois de gasto suficiente | Stop waste | Qualquer |
| Scale winners: aumenta o orçamento diário de campanhas que retornam bem, em degraus, até um teto | Grow what works | Qualquer |
| Pause ads with no conversions: pausa anúncios com gasto relevante e zero conversões em uma semana | Stop waste | Qualquer |
| Creative fatigue alert: avisa quando a frequência passa de 3 na semana | Only tell me | Meta, TikTok |
| Pause campaigns with a high CAC: gasto acima de 50% da receita enviada | Stop waste | Qualquer (requer receita por campanha) |
| Scale campaigns with a low CAC: gasto abaixo de 20% da receita | Grow what works | Qualquer |
| Spend spike alert: gasto do dia acima do esperado | Only tell me | Qualquer |
| Pause at night: pausa às 22:00 (horário da conta) | At set times | Qualquer |
| Restart in the morning: reativa às 08:00 o que *regras* pausaram, nunca o que o usuário pausou | At set times | Qualquer |
| Reset budgets at midnight: volta os orçamentos a um valor às 00:10 | At set times | Qualquer |
| Budget ladder: +10% por dia enquanto o CPR fica abaixo da meta, até um teto | Grow what works | Qualquer |
| Pause the most expensive: pausa diariamente os 3 conjuntos com o maior CPR da semana | Stop waste | Qualquer |
| Duplicate winners: duplica, pausados, os conjuntos com ROAS ≥ 4 | Grow what works | Meta |
| Shift budget to winners: move 20% do orçamento das 2 piores para as 2 melhores; o total se mantém | Grow what works | Qualquer |
| Give room to cheap campaigns: +10% no CPA alvo do Google quando a entrega está bem abaixo | Grow what works | Google |

**Leitura de produto:** as regras são formuladas em linguagem de gestor ("Stop waste", "Grow what works", "Only tell me", "At set times"), não em linguagem técnica. As categorias funcionam como um modelo mental forte para o módulo de automações do NinePro.

## F9. Trocar de produto ou workspace (CONFIRMADO até a abertura)
`Switch` → CONSOLE / STUDIO. Não foi trocado.

## F10. Navegar pelo teclado (CONFIRMADO via DOM)
⌘K abre a paleta; `G` + letra vai às páginas; `?` mostra os atalhos; o tema troca pela paleta.

## F11. Mobile (CONFIRMADO)
O header mostra o botão da sidebar + breadcrumb + botões-ícone (search/docs/support) → o toque abre a sidebar como **drawer sobreposto** com o mesmo conteúdo do desktop (incluindo o drill-down).
