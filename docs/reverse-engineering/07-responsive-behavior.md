# 07 — Comportamento responsivo

Testado em Analytics › Posting com emulação mobile 375×812 (screenshots 33, 34) e desktop de ~1049px de largura útil.

| Elemento | Desktop | Mobile (375) | Status |
|---|---|---|---|
| Sidebar | fixa, 240px | oculta; abre como **drawer sobreposto** pelo botão do header | CONFIRMADO |
| Header | breadcrumb + Search com label e kbd + Docs + Support com label | breadcrumb + **apenas ícones** (search, docs, support) em botões quadrados | CONFIRMADO |
| Toolbar de filtros | uma linha | quebra em várias linhas | CONFIRMADO |
| KPI strip | 4 colunas + 1 | **1 coluna**, células empilhadas com divisores | CONFIRMADO |
| Painéis de gráfico | grade de 2 colunas | 1 coluna, largura total | CONFIRMADO (skeleton) |
| Gutter | 12px | ~12px | CONFIRMADO |
| Tabelas no mobile | — | — | NÃO INVESTIGADO |
| Tablet (768) | — | — | NÃO INVESTIGADO |
| Modais e drawers no mobile | — | — | NÃO INVESTIGADO |

O breakpoint exato em que a sidebar vira drawer é DESCONHECIDO (no padrão shadcn costuma ser 768px, mas isso **não foi medido**).
