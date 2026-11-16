# 05 — Tema escuro (principal)

O tema padrão, inspirado na linguagem do CoachIQ: canvas quase preto com viés verde-frio e superfícies que sobem em passos pequenos.

## Escada de superfícies
`canvas #0B0D0C` → `surface #121513` → `surface-2 #171B19` → `raised #1A1F1C` → `soft #212724`.
Cada degrau separa um nível de leitura (fundo → navegação e painel → cabeçalho de tabela → card → hover) **sem sombra**. As bordas `line #232926` desenham os limites; `line-soft` divide linhas internas.

## Acento
O Volt tem luminância alta. Por isso aparece em áreas mínimas: botão primário, filete do item ativo da navegação, curva do período atual no gráfico, ponto do KPI-herói, intervalo do calendário (em tint de 8%).

## Sinais
Versões claras e saturadas (`positive #4ADE9A`, `negative #FF6B5E`, `warning #F5B544`, `info #5AB8F0`), com contraste de 6,6:1 a 10,7:1 sobre `surface`.

## Sombras
Só em elementos flutuantes: `--shadow-pop` combina sombra difusa escura com um anel de 1 px de `line`, para que o contorno apareça sobre um fundo escuro.

## Como validar
Alterne o tema pelo botão no header, pelo menu do usuário, pela paleta (⌘K → "Tema escuro") ou em Configurações → Preferências. A seção "Temas lado a lado" do `/design-system` renderiza os dois temas ao mesmo tempo.
