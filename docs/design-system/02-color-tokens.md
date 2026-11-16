# 02 — Tokens de cor

Fonte da verdade: `src/styles/tokens.css`. Os componentes consomem **apenas tokens semânticos** (via classes Tailwind mapeadas em `tailwind.config.ts`: `bg-surface`, `text-text-muted`, `border-line`…). Os valores hex existem só nesse arquivo.

## Camadas
1. **Primitivos:** `--graphite-000…950` e `--volt-500/600/700/ink`. Nunca usados direto em tela.
2. **Semânticos:** papel na interface, com valor escolhido para cada tema.

## Semânticos

| Token | Escuro | Claro | Papel |
|---|---|---|---|
| `canvas` | `#0B0D0C` | `#F3F4F1` | Fundo atrás de tudo |
| `surface` | `#121513` | `#FFFFFF` | Sidebar, painéis, popovers |
| `surface-2` | `#171B19` | `#F8F9F7` | Cabeçalho de tabela, segmented, sub-linhas |
| `raised` | `#1A1F1C` | `#FFFFFF` | Card sobre painel |
| `soft` | `#212724` | `#EEF0EC` | Hover, item de nav ativo, botão secundário |
| `overlay` | `#141816` | `#FFFFFF` | Menus, modais, toasts |
| `line` | `#232926` | `#E1E4DF` | Bordas e divisores |
| `line-soft` | `#1C211F` | `#ECEEE9` | Regras internas de tabela |
| `line-strong` | `#3A413E` | `#C9CFC9` | Checkbox, radio, dropzone, trilho de switch |
| `text` | `#EEF2EF` (16,3:1) | `#121513` (18,4:1) | Títulos e números |
| `text-soft` | `#C3CAC6` (11,0:1) | `#3A413E` (10,5:1) | Corpo, linhas de tabela |
| `text-muted` | `#8A938F` (5,8:1) | `#5E6763` (5,8:1) | Rótulos, secundários |
| `text-dim` | `#6B7470` (3,8:1) | `#858E89` (3,4:1) | Legendas e placeholders (nunca texto essencial) |
| `accent` | `#C8F04B` | `#C8F04B` | A próxima ação |
| `accent-ink` | `#10140A` | `#10140A` | Texto sobre o acento (14,2:1) |
| `accent-text` | `#C8F04B` | `#4A6600` (6,6:1) | Acento usado como texto |
| `accent-tint` | Volt 8% | Volt 12% | Seleção, linha marcada, intervalo de datas |
| `accent-line` / `-strong` | 22% / 42% | 32% / 60% | Borda em repouso / ativa |
| `positive` | `#4ADE9A` | `#17804F` | Variação boa, entrega ativa |
| `negative` | `#FF6B5E` | `#C93A27` | Queda, falha, destrutivo |
| `warning` | `#F5B544` | `#9A6510` | Atenção, ritmo acima |
| `info` | `#5AB8F0` | `#1B6FAE` | Informativo, aprendizado |
| `*-tint` | 12% | 9–12% | Fundo de ícone/aviso do sinal |

Os contrastes entre parênteses são WCAG sobre `surface`, calculados (não estimados).

## Gráficos
Paleta categórica de 6 séries, **validada** com `dataviz/scripts/validate_palette.js`:

| Série | Escuro (surface `#151917`) | Claro (surface `#FFF`) | Uso atual |
|---|---|---|---|
| 1 | `#3A87DD` | `#2F7FD8` | Meta Ads |
| 2 | `#E0673A` | `#E5683B` | Google Ads |
| 3 | `#1FA886` | `#13A37E` | TikTok Ads |
| 4 | `#8670EC` | `#7A5AF0` | LinkedIn Ads |
| 5 | `#BB8710` | `#C08708` | — |
| 6 | `#CD5690` | `#D6528E` | — |

Resultado: todas as checagens passaram nos dois temas (faixa de luminosidade, croma, CVD ΔE adjacente ≥ 8,3, visão normal ≥ 20,9, contraste ≥ 3:1). **A cor segue a entidade**: Meta é sempre a série 1, mesmo com filtros.
Tokens auxiliares: `--chart-grid`, `--chart-axis`, `--bar-idle`, `--skeleton`, `--skeleton-shine`.

## Regras
- Sinais (`positive`/`negative`/`warning`/`info`) são reservados a estado e variação, nunca a "série 5".
- Texto nunca usa cor de série. Valores e legendas usam tokens de texto.
- Não use modificadores de opacidade do Tailwind (`/50`) com tokens: as variáveis são hex. Para transparência, crie um token `*-tint`.
