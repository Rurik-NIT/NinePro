# 04 — Inventário de componentes e tokens medidos

## 1. Stack observada (CONFIRMADO)

- Next.js (classes de fonte `next/font` com hash de módulo), Tailwind, primitivas no padrão shadcn/Radix (`data-slot`, `data-variant`, `data-size`, `data-state`, `data-sidebar`, `[role=dialog]`, `[data-radix-popper-content-wrapper]`).
- Fontes: **Geist Sans** (UI), **Geist Mono**, **Geist Pixel Square** (rótulos em caixa alta e cabeçalhos de tabela).
- Tema por classe no `<html>` (`light` / `dark`) e um seletor "look" versionado `[data-look="v2"]`, com tokens semânticos (`--bg-raised`, `--fill-hover`, `--brand-default`…).

## 2. Tokens declarados no CSS `[data-look="v2"]` (CONFIRMADO)

| Token | Valor |
|---|---|
| `--size-control-sm / md / lg` | 28 / 32 / 36px |
| `--size-icon-sm / md / lg` | 12 / 16 / 20px |
| `--size-row` | 40px |
| `--size-header` | 40px |
| `--size-shell-bar` | 56px |
| `--size-page-gutter` | 12px |
| `--size-sidebar` / `-collapsed` | 240px / 56px |
| `--radius-surface` / `--radius-control` | **0px / 0px** (superfícies e controles retos) |
| `--radius-item` … `-3xl` | 4 / 6 / 8 / 12 / 16px (itens internos: nav, chips) |
| `--shadow-sm / md / lg` | `0 1px 2px`, `0 2px 4px -1px`, `0 4px 8px -2px` (cor de sombra própria) |
| `--motion-enter` | .2s `cubic-bezier(.32,.72,0,1)` |
| `--motion-exit` | .15s `cubic-bezier(.4,0,1,1)` |

## 3. Cores medidas (estilo computado, CONFIRMADO)

| Superfície | Claro | Escuro |
|---|---|---|
| Fundo da página (body) | `#F0EFEB` (off-white quente) | `#0D0D0D` |
| Sidebar / header | `#FAF9F8` | `#0F0F10` |
| Área principal / cards | `#FFFFFF` | `#151516` |
| Borda de controle | `#E4E4E4` | — (token `--border` hsl(0 4.3% 22.9%)) |
| Borda de card de gráfico | `#F2F2F2` | — |
| Texto principal | `#1A1A1A` | hsl(48 14.3% 93.1%) |
| Texto secundário (rótulos) | `#525252` | hsl(0 4.1% 71%) |
| Placeholder / busca | `#6B6B6B` | — |
| Item ativo da nav | `rgba(92,68,37,.05)` (marrom quente a 5%) | `rgba(255,255,255,.06)` |
| Marca (CTA, seleção, hoje no calendário) | vermelho-laranja ≈ hsl(9 84% 50%) | idem |
| Linha selecionada | hsl(9 84% 50% / .05) | hsl(9 84% 50% / .08) |
| Status (claro) | success hsl(163 94% 24%), warning hsl(26 90% 37%), danger hsl(0 74% 42%), info hsl(201 96% 32%), cada um com variante `-subtle` (12%) e `-border` (30%) | success hsl(156 72% 67%), warning hsl(46 97% 65%), danger hsl(0 94% 82%), info hsl(199 95% 74%) |
| Paleta de canais (gráficos) | 10 cores fixas `--mrr-channel-*` (paid-google #2a78d6, paid-social #eb6834, organic-search #1baf7a, organic-social #eda100, ai-assistant #e87ba4, referral #008300, direct #4a3aa7…) com versões próprias para o escuro | |

## 4. Tipografia medida (CONFIRMADO)

| Uso | Família | Tamanho/linha | Peso | Extra |
|---|---|---|---|---|
| Item de navegação, botões, inputs | Geist Sans | 14/20 | 400 | — |
| Título de painel | Geist Sans | 14/20 | 500 | — |
| Valor de KPI | Geist Sans | 24/28 | 500 | — |
| Rótulo de KPI | **Geist Pixel Square** | 12/16 | 500 | UPPERCASE, `#525252` |
| Cabeçalho de tabela | **Geist Pixel Square** | 12/16 | 500 | UPPERCASE, fundo `#FAF9F8`, altura 32px |
| Body base | Geist Sans | 16/24 | 400 | — |

## 5. Componentes observados

| Componente | Anatomia / medidas | Variações vistas | Status |
|---|---|---|---|
| **App shell** | sidebar 240 + header 56 + main | claro / escuro / mobile | CONFIRMADO |
| **Sidebar nav item** | 32px de altura, padding 8, raio 4, ícone de 16 + label 14px, chevron › quando tem submenu | ativo (fill 5%), hover, grupo rotulado | CONFIRMADO |
| **Back link de drill-down** | `‹ Módulo` em texto secundário pequeno | — | CONFIRMADO |
| **Card promocional na sidebar** | borda, título com ícone de marca, texto, ícones, botão secundário de largura total, × para dispensar | — | CONFIRMADO |
| **Breadcrumb com contador** | ícone + `Módulo / Página` + badge mono `[0]` | 2 e 3 níveis | CONFIRMADO |
| **Botão secundário** | 32px, borda `#E4E4E4`, fundo branco, **raio 0**, padding 0 12, ícone + label | ativo/pressionado | CONFIRMADO |
| **Botão primário** | fundo da marca (vermelho-laranja), texto branco, raio 0 | desabilitado (claro) | CONFIRMADO |
| **Botão-ícone** | quadrado de 32px com borda | refresh, ⋯ | CONFIRMADO |
| **Search trigger (⌘K)** | 224×32, placeholder cinza, kbd `⌘K` | — | CONFIRMADO |
| **Busca inline** | input largo com ícone de lupa | — | CONFIRMADO |
| **Select compacto** | label + chevron | período, filtros | CONFIRMADO |
| **Dropdown menu** | cabeçalho opcional, itens, submenu ›, divisor, item destrutivo em vermelho | radio (presets de colunas) | CONFIRMADO |
| **Date range picker** | presets + calendário + Start/End + Apply + nota de fuso | — | CONFIRMADO |
| **Drawer lateral** | 448px, branco, borda à esquerda, sombra `0 4px 8px -2px rgba(0,0,0,.1)`, cabeçalho com ícone, rodapé Reset/Cancel/Apply | lista ordenável com itens travados | CONFIRMADO |
| **Lista ordenável** | linha com handle ⠿, label, ação (×, cadeado, ↑↓) | — | CONFIRMADO |
| **Modal grande de formulário** | cabeçalho com ícone, duas colunas, rodapé fixo com checkbox + ações | — | CONFIRMADO |
| **Option card (seleção)** | grade 2×2, ícone + label, selecionado com fundo cinza | — | CONFIRMADO |
| **Segmented / toggle** | "Per day / Total", "MCP / CLI", tabs sublinhadas | — | CONFIRMADO |
| **Textarea / Input com contador** | `0/125`, `0/40` | — | CONFIRMADO |
| **Dropzone** | borda tracejada, ícone, instrução, especificação | — | CONFIRMADO |
| **KPI strip** | grade sem gap, células de 72px de altura, padding 12, rótulo pixel UPPERCASE + valor 24px | valor vazio "No data" em cinza | CONFIRMADO |
| **Chart panel** | card branco, borda `#F2F2F2`, padding 16, título 14/500 + subtítulo | com select de métrica | CONFIRMADO |
| **Data table** | cabeçalho pixel UPPERCASE de 32px, linhas de 40px, ordenação com seta, estado vazio dentro do corpo | contador no breadcrumb | PARCIAL (sem dados) |
| **Empty state** | ícone de linha de 20px, título 14/500, descrição cinza centralizada, 0–2 CTAs | com e sem CTA, CTA desabilitado | CONFIRMADO |
| **Skeleton** | blocos no formato exato do conteúdo (tabela, cards, KPIs, chat) | — | CONFIRMADO |
| **Integration row** | logo, nome, ação "⊕ Connect" | — | CONFIRMADO |
| **Template card** | autor + verificado, preço, título, descrição truncada, tags, rodapé com ações | — | CONFIRMADO |
| **Settings row group** | grupo com borda; linhas com rótulo e descrição à esquerda e controle à direita | — | CONFIRMADO |
| **Switch** | — | ligado (escuro) | CONFIRMADO |
| **Stepper de onboarding** | blocos numerados em quadrado escuro | — | CONFIRMADO |
| **Command palette** | grupos Actions / Pages / Theme / Resources, atalhos, rodapé de teclas | — | CONFIRMADO (texto) |
| Toast, Tooltip, Context menu, Confirmation dialog | — | — | NÃO INVESTIGADO (nenhuma ação disparou um desses) |

## 6. Padrões repetidos

1. **Toolbar de página**: período → filtros → configuração da visualização (cards/colunas) → views salvas; ações de dados (refresh, export) à direita.
2. **Drawer de customização** idêntico para cards (Overview) e colunas (Campaigns).
3. **Estado vazio dentro do container da tabela**, preservando os cabeçalhos (o usuário vê a forma dos dados futuros).
4. **Skeleton com a forma do conteúdo** em todas as telas.
5. **Contador no breadcrumb**, em vez de um título com contagem.
6. **Superfícies retas e controles retos; arredondamento só em itens internos.**
7. **Cor de marca reservada** para CTA primário, intervalo e dia selecionados e linha selecionada.
