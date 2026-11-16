# Validação da etapa 1 — critérios de aceitação

Data: 2026-11-16 · Branch: `ninepro/foundation`

| # | Critério | Status | Evidência / observação |
|---|---|---|---|
| 1 | REA validado e efetivamente utilizado | **Cumprido** | 10 chamadas REA com Evidence IDs: inspeção, screenshot verificado, cenário com 2.545 eventos de rede, exportação e análise estática. Ver `reverse-engineering/10-rea-evidence.md`. Limite: análise estática em 4 de 62 scripts |
| 2 | Sistema de referência mapeado | Cumprido (com limites) | 77 rotas, sidebar, drill-down, paleta ⌘K, menus. A conta não tem dados, então as telas com dados ficaram DESCONHECIDAS |
| 3 | Inventário de módulos | Cumprido | `reverse-engineering/02-modules-inventory.md` |
| 4 | Documentação de engenharia reversa | Cumprido | `reverse-engineering/00…09` + 34 screenshots |
| 5 | Referências visuais organizadas | Cumprido | `visual-reference/coachiq/` (25 pranchas) + `coachiq-analysis.md` |
| 6 | Direção de arte definida | Cumprido | `design-system/00`, `01` |
| 7 | Design System implementado | Cumprido | `src/styles/tokens.css`, `src/components/**` |
| 8 | Tema escuro funcional | Cumprido | Screenshots 01, 03, 05, 08 |
| 9 | Tema claro funcional | Cumprido | Screenshots 02, 05. Visão geral e design system verificados no claro; as outras telas usam os mesmos tokens, mas não foram inspecionadas uma a uma |
| 10 | Componentes documentados | Cumprido | `design-system/07-components.md` |
| 11 | Página de demonstração | Cumprido | Rota `/design-system`, com 12 seções e temas lado a lado |
| 12 | Layout principal | Cumprido | Shell, sidebar recolhível, drawer mobile, header, paleta |
| 13 | Comparação visual e validação responsiva | Parcial | 768 px: 10 rotas sem overflow e sem erro de console. 375 px: 3 telas. Comparação com a referência descrita em `coachiq-analysis.md` §3. Sem teste em navegador real de celular |
| 14 | Pendências documentadas | Cumprido | Este arquivo + `reverse-engineering/09` |

## Verificações técnicas
- `tsc -b --noEmit`: sem erros.
- `vite build`: concluído; vendors separados em chunks (`vendor-charts` com 419 kB / 113 kB gzip; nenhum chunk acima do limite).
- Console do navegador: nenhum erro nas rotas visitadas.
- Paleta de gráficos: `validate_palette.js` passou em todas as checagens, nos modos light e dark.
- Contraste dos tokens de texto: calculado (ver `design-system/02-color-tokens.md`).

## Problemas encontrados e corrigidos durante a validação
1. ROAS de campanhas de leads exibido como `0,00×` → agora `—` quando não há receita.
2. Rótulo de acessibilidade da barra de progresso aparecia duplicado na tela → `ariaLabel` separado de `label`.
3. Navegação fixa do `/design-system` deixava conteúdo aparecer acima dela → `top-0` no contêiner de scroll.
4. KPI-herói cortado em 375 px → tamanho responsivo.
5. Miniaturas dominando os cards de criativos → proporção 2:1 e mais colunas.
6. Select sem estado de erro visual → `invalid` com `aria-invalid`.
7. Chunk principal de 948 kB → divisão de vendors (o filtro inicial casava com o próprio caminho do workspace e foi corrigido).

## Pendências
- **REA:** ampliar a análise estática para os 58 scripts restantes e capturar os chunks das rotas de Ads (lotes menores, para não derrubar a conexão).
- **Simular regra (backtest):** existe na API do Zernio (`automations/backtest`), mas a UI não foi observada. Avaliar para o NinePro.
- **Telas com dados no sistema funcional:** exigem uma conta de anúncios de teste conectada (feito pelo usuário).
- **Integrações reais, autenticação e persistência em servidor:** fora do escopo desta etapa.
- **Testes automatizados** (unitários e visuais): ainda não há.
- **Pasta do projeto:** está numa pasta temporária criada pelo app para esta sessão. Mover para uma pasta permanente antes de seguir.
