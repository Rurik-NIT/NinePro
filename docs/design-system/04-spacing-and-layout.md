# 04 — Espaçamento e layout

## Espaçamento (base 4)
`2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48`. Os valores 12 e 16 dominam: 12 entre painéis (gutter) e 16 de padding interno de painel.

## Geometria

| Token | Valor | Uso |
|---|---|---|
| `--radius-xs` | 4 | Checkbox, ticks, barras de gráfico |
| `--radius-sm` | 6 | Controles de 28 px, itens de menu |
| `--radius-md` | 8 | Inputs, botões, itens de navegação |
| `--radius-lg` | 12 | Cards e painéis |
| `--radius-xl` | 16 | Modais e drawers |
| `--radius-pill` | 999 | Chips de filtro, switch, avatar |
| `--control-sm / md / lg` | 28 / 32 / 40 | Altura de controles |
| `--row-h` / compacta | 44 / 36 | Linha de tabela |
| `--header-h` | 56 | Barra superior |
| `--sidebar-w` / recolhida | 248 / 64 | Navegação |
| `--frame-gutter` | 12 | Moldura ↔ sidebar ↔ conteúdo |
| `--content-max` | 1600 | Largura máxima do conteúdo |

## Breakpoints
`sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`.
A sidebar fixa aparece a partir de `lg`; abaixo disso vira drawer.

## Grade das telas
- **Página:** `Page` aplica padding e largura máxima; `PageHeader` traz meta (selo), título, descrição e ações. As ações quebram para baixo do título em telas estreitas.
- **KPIs:** faixa contínua com 1 → 2 → 3 → 6 colunas.
- **Visão geral:** gráfico principal + coluna de 380 px (xl); depois 3 colunas (2xl), 2 colunas (lg) ou empilhado.
- **Tabelas:** sempre dentro de um painel com scroll próprio, cabeçalho e rodapé fixos, primeira coluna fixa no scroll horizontal.

## Densidade
A tabela de campanhas tem um alternador **Confortável/Compacta** (44 / 36 px por linha), salvo por usuário.
