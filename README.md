# NinePro (9Pro)

Gestão de tráfego pago e operação de campanhas. Esta é a **etapa 1: fundação de design** — Design System completo, dois temas, shell da aplicação e os módulos mapeados na engenharia reversa, rodando com **dados fictícios** claramente sinalizados.

## Rodar
```bash
npm install
npm run dev        # http://localhost:5179
npm run build      # typecheck + build de produção
```

## Stack e decisões técnicas
| Escolha | Motivo |
|---|---|
| React 18 + TypeScript (strict) + Vite | Projeto novo, sem stack existente para preservar. SPA leve; tipagem estrita desde o início |
| Tailwind 3 mapeado para **CSS variables** | Os tokens vivem em `src/styles/tokens.css`; o Tailwind só expõe nomes semânticos (`bg-surface`, `text-text-muted`). Nenhuma cor hex fora do arquivo de tokens |
| Radix UI (primitivas) | Acessibilidade pronta (foco, teclado, ARIA) para menu, select, dialog, popover, tooltip, tabs, switch, checkbox, radio, toast e context menu, sem impor visual |
| Recharts | Gráficos declarativos, estilizados por tokens |
| cmdk | Paleta de comandos acessível |
| react-day-picker + date-fns | Calendário com locale pt-BR, estilizado por classes de token |
| Fontsource (Manrope, IBM Plex Mono) | Fontes empacotadas localmente, sem CDN |
| React Router 6 + lazy routes | Uma rota por módulo, com code-splitting |

## Estrutura
```
src/
  styles/tokens.css        tokens primitivos e semânticos (escuro + claro)
  lib/                     tema, filtros globais, formatação pt-BR, estado local
  config/                  navegação (fonte única) e catálogo de métricas
  data/demo/               ⚠ dados fictícios determinísticos
  components/
    ui/                    botões, campos, controles, menus, diálogos, tabs, toast, datas
    layout/                AppShell, Sidebar, Header, CommandPalette, Logo
    data/                  KPI, delta, progresso, tabela, configurador de métricas
    charts/                contêiner, legenda e tooltip de gráfico
    feedback/              estados (vazio, carregando, erro, sucesso, selo demo)
  pages/                   uma tela por módulo + /design-system
docs/
  reverse-engineering/     mapeamento do sistema funcional (com status e evidências)
  visual-reference/        pranchas do CoachIQ + análise
  design-system/           00–09: princípios, cores, tipografia, layout, temas, componentes…
  validation.md            critérios de aceitação, verificações e pendências
```

## Regras do projeto
- Componentes usam só tokens semânticos; formatação numérica só via `lib/format.ts`.
- Dados de demonstração ficam isolados em `data/demo` e toda tela que os usa exibe `<DemoBadge />`.
- Nada simula integração: controles que dependem de conexão aparecem desabilitados, com explicação.
