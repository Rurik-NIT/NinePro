# Análise visual — CoachIQ (referência de direção de arte)

**Fonte:** 25 pranchas do case no Behance (autor: Konstantin Zhuck), baixadas pelo usuário com `gallery-dl` e copiadas para `docs/visual-reference/coachiq/` (3600 px de largura, PNG).
**Método:** leitura de prévias reduzidas de todas as pranchas relevantes e recorte em resolução total da prancha 19 (Foundations) para ler os valores exatos.
**Regra:** princípios, não cópia. Nada abaixo é transposto literalmente para o NinePro. A seção 3 diz o que foi adaptado e como.

## 1. O que foi observado (CONFIRMADO, com prancha de origem)

| Aspecto | Observação | Prancha |
|---|---|---|
| Moldura | App em "moldura flutuante": canvas escuro, sidebar em painel arredondado, área de trabalho com painéis separados por um gutter fixo | 01, 10 |
| Sidebar | Estreita, itens em texto com chevron para submenus, item ativo em pílula de acento sólida, seletor de conta no topo ("CoachIQ ⌃") | 01, 08, 10 |
| Cabeçalho | Busca larga com `⌘K` + campo "Ask AI anything… ⌘L" separado; ações à direita (Today, filtros, CTA amarelo) | 01, 08 |
| Acento | Amarelo único (`#ECBD56`) com 6 forças: sólido para ação/hoje/toggle ativo; 55% pré-misturado para barras; 30% borda ativa; 20% borda em repouso; 8% coluna do dia/célula selecionada; 0% fim de gradiente | 19 (lido em resolução total) |
| Neutros | Rampa "Charcoal Blue" de 11 passos (`#0F1012` → `#F2F2F0`), com leve viés azul para manter os cinzas limpos ao lado do amarelo | 19 |
| Sinais | 5 cores com papel definido: positive `#4ADE80` (deltas, dinheiro confirmado), negative `#FF5A4E` (linha do "agora", falhas), amber `#FF9F45` (pendente), violet `#A78BFA` (lógica/IA), cyan `#3FD0D7` (assinaturas/tendências) | 19 |
| Tokens semânticos | 83 variáveis semânticas: canvas, surface, surface-2, soft, card-bg, card-bd, grid-bg, blocked, line, line-soft, line-strong, text, text-soft, text-muted, text-dim, accent, accent-ink, accent-text (escurecido no claro para 4,5:1), accent-tint, signal e bar-idle, cada um com valor escuro/claro | 20 |
| Tipografia | Rethink Sans; 7 estilos nomeados por papel: Display 56/800, Headline 40/800, Title 28/700, Subtitle 20/600, Body 17/500, Secondary 15/400, Label 13/600 +0,08 | 19 |
| Espaçamento | Contagem real em 15.228 nós: 2, 4, 6, 8, 10, 12, 16 px. O valor de 12 px governa a relação moldura/navegação/área de trabalho | 20 |
| Raios | 6 valores: 2 (ticks, sparklines), 4 (checkbox), 9 (cards de builder), 12 (chat, ícones), 14 (cards de métrica), 18 (nav rail, painéis) + pílula | 20 |
| Cor por categoria | Cores de tipo de sessão ocupam só uma **borda estreita** do card; a superfície fica neutra e o preenchimento forte é reservado à ação primária | 20 |
| Densidade | Calendário e inbox densos, mas com hierarquia: valores grandes, metadados pequenos e cinzas, rótulos em caixa alta pequenos | 01, 08 |
| Tema claro | Canvas off-white (`#F8F8F9`-ish), superfícies brancas, mesmos componentes; o amarelo fica como CTA com texto escuro | 07, 10, 15 |
| Estados | A auditoria lista "Failures without a designed state" como causa-raiz: vazio, carregamento e erro precisam de desenho próprio | 02 |
| Contexto | "Context lost on return": filtros e dia selecionado resetavam ao voltar à tela | 02 |
| Tabelas | Cabeçalho pequeno e cinza, ícone de tipo em quadrado tintado, status como ponto + rótulo, valores com linha secundária ("from $19,98 / per month") | 07 |

## 2. Princípios extraídos

1. **Profundidade por camadas, não por sombra.** 4 a 5 níveis de superfície bastam para separar canvas, navegação, painel e card.
2. **Um acento, várias forças.** A mesma cor em 100/55/30/20/8% resolve ação, gráfico, borda ativa, repouso e seleção sem introduzir cores novas.
3. **Neutros com viés de temperatura** que conversa com o acento.
4. **Tokens semânticos com valor por tema**, incluindo um `accent-text` escurecido no claro.
5. **Cor de categoria em área pequena** (borda, ponto), nunca no preenchimento do card.
6. **Estados desenhados** (vazio, carregando, erro) como parte do produto.
7. **Preservar contexto** entre telas.
8. **Gutter único** governando a relação entre moldura e conteúdo.

## 3. Adaptação para o NinePro (o que muda e por quê)

| Princípio | CoachIQ | NinePro |
|---|---|---|
| Acento | Amarelo quente (agenda, energia) | **Volt** `#C8F04B`, um verde-limão elétrico: leitura de "sinal verde / em veiculação", contraste de 14,9:1 sobre o canvas, e distância clara do amarelo do CoachIQ e do vermelho-laranja do sistema funcional |
| Neutros | Charcoal **Blue** | **Graphite** com viés **verde-frio**, que harmoniza com o Volt |
| Forças do acento | 6 | 5 (`accent`, `accent-hover`, `accent-line-strong` 42%, `accent-line` 22%, `accent-tint` 8%) + `accent-text` por tema |
| Item ativo da nav | Pílula amarela sólida | Fundo `soft` + **filete Volt de 3 px** à esquerda: o acento sólido fica reservado à ação primária (regra "uma por tela") |
| Tipografia | Rethink Sans, display 56 | **Manrope** (interface e números com `tnum`) + **IBM Plex Mono** para rótulos técnicos, herdando do sistema funcional o hábito de cabeçalho em fonte técnica caixa alta; escala mais contida (display 32), porque o produto é operacional e não editorial |
| Raios | 9/12/14/18 | 4/6/8/12/16: um pouco mais retos, alinhados a "precisão" |
| Sinais | positive/negative/amber/violet/cyan | positive/negative/warning/info: violeta e ciano ficam livres para séries de gráfico |
| KPIs | Cards de métrica separados | **Faixa contínua** com divisores (padrão do sistema funcional, mais densa) + sparkline por indicador |
| IA ("Ask AI") | Campo dedicado no header | **Não incluído**: não há evidência de IA no sistema funcional (regra "não inventar") |

## 4. O que NÃO foi possível ver
- Estados de hover e foco animados (as pranchas são estáticas).
- Especificação de gráficos com dados reais (há apenas gráficos decorativos nas telas).
- Comportamento responsivo além das telas mobile do app do atleta (390 × 844).
