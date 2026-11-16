# 03 — Tipografia

| Família | Uso | Por quê |
|---|---|---|
| **Manrope Variable** (`@fontsource-variable/manrope`, local) | Interface, títulos, números | Geométrica e técnica, com algarismos claros (1/7 distintos, 0 sem ambiguidade), suporte a `tnum` e peso variável de 200 a 800 |
| **IBM Plex Mono 500** (`@fontsource/ibm-plex-mono`, local) | Rótulos técnicos em caixa alta: cabeçalhos de tabela, labels de KPI, tags, atalhos | Dá o "tom de instrumento" sem a ilegibilidade de fontes pixel; herda o hábito de rótulo técnico do sistema funcional |

As fontes são servidas localmente pelo bundle (sem CDN em produção).

## Escala

| Estilo | Classe | Tamanho / linha | Peso | Uso |
|---|---|---|---|---|
| Display | `t-display text-display-lg` | 32 / 38 (24 / 30 no mobile) | 700 | Título de página |
| Headline | `t-headline` | 18 / 24 | 650 | Seção dentro da página |
| Title | `t-title` | 15 / 22 | 650 | Painel, card, modal |
| Body | `t-body` | 14 / 20 | 500 | Interface padrão |
| Secondary | `t-secondary` | 13 / 18 | 500, `text-muted` | Descrições e metadados |
| Caption | `t-caption` | 12 / 16 | 500, `text-dim` | Legendas e contadores |
| Label | `t-label` | 11 / 14, +0,06 em, MAIÚSCULAS | Mono 500, `text-muted` | Cabeçalho de tabela, rótulo de KPI |
| KPI | `text-kpi` / `text-kpi-lg` | 26 / 32 · 34 / 40, −0,02 a −0,03 em | 700 | Indicadores |

## Números
- Classe `.num` aplica `font-variant-numeric: tabular-nums` (já presente em todas as células numéricas, KPIs e deltas).
- Formatação exclusiva via `src/lib/format.ts` (pt-BR):
  - Moeda: `R$ 1.132.020,59`, ou `R$ 117.480` (`currency0`) em listas de resumo.
  - Contagem: `4.890`; compacto (`12,4 mil`) só em eixos de gráfico.
  - Taxas: `1,47%`. Razões: `3,92×`. Ausente ou indefinido: `—`.
- Deltas sempre com sinal tipográfico real (`+` / `−`) e ícone de seta.
