# 00 — Princípios de design do NinePro

O NinePro é a ferramenta onde um gestor de tráfego decide **onde colocar o próximo real**. Cada princípio abaixo serve a essa decisão.

1. **Números primeiro.** Valores financeiros e indicadores são o conteúdo principal. Sempre com algarismos tabulares, alinhados à direita em tabelas e acompanhados de comparação com o período anterior.
2. **Uma ação primária por área.** O acento Volt marca a próxima ação, a seleção e o "agora". Ele não decora. Se há dois botões Volt na mesma área, um está errado.
3. **Profundidade por camadas, não por sombra.** Canvas → surface → surface-2 → raised. Sombras só em elementos flutuantes (menus, modais, toasts).
4. **Leitura sem cor.** Deltas carregam ícone e sinal; status carrega ponto e rótulo; séries de gráfico têm legenda. A cor reforça, nunca é o único sinal.
5. **Contexto preservado.** Período e plataformas são globais e persistem entre telas. Preferências (colunas, densidade, visualização, indicadores) ficam salvas por usuário.
6. **Estados desenhados.** Todo container de dados tem vazio, carregando (skeleton no formato final), erro e sucesso.
7. **Honestidade operacional.** Nada simula integração. O que é demonstração exibe o selo "Dados fictícios"; o que depende de conexão aparece desabilitado e explica o motivo.
8. **Segurança em ações de impacto.** Pausar, excluir e alterar orçamento pedem confirmação. Criar campanha vem com "Criar pausada" marcado por padrão (prática observada no sistema funcional).

## Navegação: decisão
O sistema funcional usa **drill-down** na sidebar: ao entrar num módulo, a navegação inteira é substituída pelo submenu dele. Isso funciona para ~15 módulos de canais diferentes. O NinePro tem um escopo focado em tráfego pago (9 destinos), então usa **sidebar agrupada e plana** (Operação · Mensuração · Automação · Conta), recolhível para um trilho de 64 px. Os sub-níveis viram **tabs dentro da página**. Ganho: zero cliques extras para trocar de módulo, e o usuário nunca perde a orientação.

## Origem de cada decisão
- Funcional (estrutura, fluxos, métricas): `docs/reverse-engineering/`
- Estética (camadas, acento com forças, tokens por tema): `docs/visual-reference/coachiq-analysis.md`
