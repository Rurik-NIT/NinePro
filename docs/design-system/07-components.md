# 07 — Componentes

Todos em `src/components/`, demonstrados em `/design-system`. Primitivas acessíveis do Radix UI, estilizadas com tokens.

## Estrutura (`components/layout`)
| Componente | Arquivo | Notas |
|---|---|---|
| AppShell | `AppShell.tsx` | Moldura flutuante, sidebar recolhível (salva por usuário), drawer no mobile, link "pular para o conteúdo" |
| Sidebar · NavItem | `Sidebar.tsx` | Grupos rotulados, filete Volt no ativo, tooltip no modo recolhido, seletor de espaço, tema e usuário no rodapé |
| Header · Breadcrumb | `AppShell.tsx` | Trilha *Grupo / Página*, gatilho da paleta, alternância de tema |
| PageHeader · Page · Section | `AppShell.tsx` | Título, descrição, meta (selo) e ações |
| CommandPalette | `CommandPalette.tsx` | ⌘K / Ctrl+K, páginas, tema, atalhos `G + tecla` |
| Logo · LogoMark | `Logo.tsx` | Retícula "9" |

## Dados (`components/data`, `components/charts`)
| Componente | Notas |
|---|---|
| KpiStrip | Faixa contínua; item-herói; delta vs. período anterior; sparkline; tooltip de definição |
| MetricCard | Indicador isolado com rodapé (meta, nota) |
| Delta (PerformanceIndicator) | Cor pela direção desejável (`better: up/down/neutral`), ícone e sinal |
| Progress | Tons accent/positive/warning/negative/neutral; `label` visível e `ariaLabel` separados |
| Sparkline | Tendência sem eixos |
| DataTable | Ordenação (`aria-sort`), seleção com indeterminado, hierarquia expansível, coluna fixa, rodapé de totais, skeleton, estado vazio, densidade |
| TableToolbar | Busca, filtros e ações; vira barra de ação em lote quando há seleção |
| MetricConfigurator | Drawer único para indicadores e colunas: reordenar (↑↓), remover, adicionar, travadas, limite, restaurar |
| ChartContainer · ChartLegend · ChartTooltip | Título + recorte + ações + legenda clicável; eixos recessivos (`axisProps`, `gridProps`) |
| PlatformDot · PlatformLabel | Identidade de plataforma pela cor da série |

## Formulários (`components/ui`)
Input (prefixo/sufixo, tamanhos, inválido), SearchInput (Esc limpa), Textarea (contador), Field (rótulo, ajuda, erro, ids ligados por `aria-describedby`), Select, MultiSelect (resumo + contador + limpar), DatePicker, DateRangePicker (presets, intervalo, Aplicar, fuso), Checkbox (indeterminado), RadioGroup, Switch.

## Interação
Button (primary, secondary, outline, ghost, danger; sm/md/lg; ícone; loading), IconButton (nome acessível obrigatório), `buttonClasses()` para links, Menu (itens, atalhos, check, radio, submenu, destrutivo), ContextMenu, Tooltip, Popover, Modal (sm–xl), Drawer, ConfirmDialog (`alertdialog`), Tabs (com contagem), SegmentedControl, Toast (4 tons, com ação "Desfazer").

## Estados (`components/feedback`)
EmptyState, LoadingState, Skeleton, ErrorState (com "Tentar novamente"), SuccessState, InlineNotice, DemoBadge.

## Indicadores
StatusBadge (ponto + rótulo), Tag (mono discreta / acento), Count, Kbd, Avatar.

## Fora da biblioteca, de propósito
Carrossel, stepper de onboarding, editor visual e campo de IA: não há evidência de que sejam necessários no escopo atual.
