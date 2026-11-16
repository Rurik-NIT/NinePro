# 09 — Diretrizes responsivas

Prioridade desktop, sem quebrar telas menores.

| Faixa | Shell | Conteúdo |
|---|---|---|
| ≥ 1536 (2xl) | Moldura com gutter de 12 px, sidebar de 248 px | KPIs em 6 colunas; linha inferior da visão geral em 3 colunas |
| 1280–1535 (xl) | Idem | KPIs em 3 colunas; gráfico principal + coluna de 380 px |
| 1024–1279 (lg) | Idem; sidebar recolhível para 64 px | Grades de 2 colunas |
| 768–1023 (md, tablet) | Sem moldura; sidebar vira **drawer** pelo botão do header | 2 colunas onde couber; busca do header ainda visível |
| < 768 (mobile) | Drawer; header só com ícones (menu, busca, tema) | 1 coluna; filtros quebram em linhas; tabelas rolam na horizontal com a 1ª coluna fixa; KPI-herói reduz de 34 para 26 px |

## Regras
- Nunca há scroll horizontal da página. Tabelas largas rolam **dentro do painel**.
- Modais ocupam `100vw − 32px` no máximo; drawers, `100vw − 16px`.
- O date range picker empilha presets acima do calendário no mobile.
- Alvos de toque de pelo menos 32 px (controles md) e 36 px nos itens de navegação.

## Validação feita (2026-11-16)
Emulação no painel do navegador. **768×1024:** as 10 rotas sem overflow horizontal (`scrollWidth − innerWidth = 0`) e sem erros de console. **375×812:** visão geral, drawer de navegação e campanhas verificados (sem overflow). **1440×900:** visão geral nos dois temas; campanhas, criativos e regras no escuro; o design system mostra os dois temas lado a lado. As demais rotas em 375 px não foram inspecionadas uma a uma. Ver o registro de validação em `docs/validation.md`.
