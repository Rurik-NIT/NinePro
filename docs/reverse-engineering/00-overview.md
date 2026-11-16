# 00 — Visão geral da engenharia reversa

**Sistema de referência:** Zernio — produto "STUDIO" (`https://zernio.com/dashboard/*`)
**Data da captura:** 2026-11-16
**Sessão:** painel de navegador do app Claude (aba já autenticada, reutilizada; nenhuma sessão nova aberta, nenhum logout)
**Escopo desta rodada:** navegação completa, módulo Ads em profundidade, Analytics, Automations (foco em regras de anúncio), Posts, Settings, Inbox (estrutura), menus globais, tema escuro, mobile.

## Legenda de status

| Status | Significado |
|---|---|
| **CONFIRMADO** | Observado e validado diretamente (screenshot, texto do DOM ou estilo computado) |
| **PARCIAL** | Identificado, mas não completamente compreendido (ex.: só o estado vazio ou o skeleton foi visto) |
| **NÃO INVESTIGADO** | Ainda não explorado |
| **DESCONHECIDO** | Não foi possível determinar |

## Ferramentas e evidências — declaração honesta

| Ferramenta | Usada? | Para quê |
|---|---|---|
| REA (MCP `rea`) | **Sim**, na 2ª rodada | Conectado a um Edge com depuração (perfil separado). Inspeção passiva, screenshot, cenário de navegação com rede (2.545 eventos), exportação e análise estática dos scripts. Ver `10-rea-evidence.md`. Na 1ª rodada não havia endpoint CDP disponível |
| Painel do navegador do app (`mcp__Claude_Browser__*`) | **Sim**, fonte de todas as evidências | Screenshots, árvore de acessibilidade, texto da página, estilos computados e regras CSS via JS somente leitura, extração de rotas a partir dos bundles JS já carregados pela página. |

> Critério de aceitação nº 1 ("REA validado e efetivamente utilizado"): **cumprido na 2ª rodada**, com evidências registradas em `10-rea-evidence.md`.

## Regras de preservação seguidas

- Só interações de leitura: abrir e fechar menus, drawers e modais. Todo drawer foi fechado com **Cancel** e todo modal com **Cancel** ou Esc.
- Nenhum formulário enviado, nenhuma automação instalada, nenhum switch alterado (o switch "Run ad automations" foi visto, não tocado).
- O tema escuro foi inspecionado aplicando a classe `.dark` **apenas no DOM local**, revertida em seguida. A preferência da conta não foi alterada.
- Screenshots que exibiam o e-mail da conta **não** foram copiados para o projeto.

## O que é o produto (CONFIRMADO)

O Zernio Studio é uma plataforma de operação de marketing multicanal, construída sobre uma API ("Social Media API Management"). Os módulos cobrem publicação orgânica, analytics, inbox unificado, **anúncios pagos (Meta/Google/LinkedIn/TikTok)**, rastreamento de conversões, automações (incluindo regras de orçamento de anúncios), commerce, creators e canais de mensageria (WhatsApp, iMessage, telefonia).

Para o NinePro (gestão de tráfego pago), o núcleo relevante é: **Ads → Campaigns/Creatives/Leads → Conversions → Audiences/Lead Forms → Automations (ad rules)**, mais Analytics, Connections e Settings.

## Limitação estrutural da conta observada

A conta não tem **nenhuma conta de anúncios, plataforma social ou GA4 conectada**. Por isso, quase todas as telas de dados foram vistas apenas em **estado vazio** ou em **skeleton**. Tabelas preenchidas, gráficos com dados, drill-down de campanha (campanha → conjunto → anúncio) e detalhes de lead são **DESCONHECIDOS**.

## Índice

1. [01-navigation-map.md](01-navigation-map.md): sidebar, drill-down, rotas
2. [02-modules-inventory.md](02-modules-inventory.md): módulos e relevância para o NinePro
3. [03-screen-by-screen.md](03-screen-by-screen.md): tela a tela
4. [04-component-inventory.md](04-component-inventory.md): componentes e tokens medidos
5. [05-interaction-flows.md](05-interaction-flows.md): fluxos observados
6. [06-data-visualization.md](06-data-visualization.md): KPIs, gráficos e catálogo de métricas
7. [07-responsive-behavior.md](07-responsive-behavior.md): mobile
8. [08-reference-screenshots.md](08-reference-screenshots.md): índice de evidências
9. [09-unknowns-and-limitations.md](09-unknowns-and-limitations.md): pendências
