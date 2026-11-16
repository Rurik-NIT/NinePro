# 08 — Interações e estados

## Estados de controle
| Estado | Tratamento |
|---|---|
| Hover | Fundo sobe um degrau (`soft` / `surface-2`) ou a borda vai para `line-strong` |
| Foco (teclado) | `:focus-visible`: contorno de 2 px em `--focus-ring` (Volt a 55% / oliva a 45%); campos usam anel de 3 px em `accent-tint` |
| Ativo / pressionado | `translate-y-px` em botões |
| Selecionado | `accent-tint` no fundo + borda `accent-line-strong` (cards de opção, linhas de tabela, chips) |
| Desabilitado | Opacidade de 45–50% e cursor `not-allowed`; quando desabilitado por falta de integração, um tooltip explica o motivo |
| Inválido | Borda `negative` + mensagem abaixo, ligada ao campo por `aria-describedby` |
| Carregando | Botão com spinner e `aria-busy`; dados com skeleton no formato final |

## Estados de dados
Vazio (ícone, título, explicação, 0–2 ações), carregando, erro (com "Tentar novamente"), sucesso, aviso inline. O vazio **diferencia** "nada existe ainda" (CTA para conectar) de "nada com estes filtros" (CTA "Limpar filtros").

## Movimento
| Token | Valor | Uso |
|---|---|---|
| `--ease-enter` | `cubic-bezier(.32,.72,0,1)` | Entradas: popover, modal, drawer |
| `--ease-exit` | `cubic-bezier(.4,0,1,1)` | Saídas |
| `--dur-fast/base/slow` | 120 / 180 / 260 ms | Hover · pop-in · slide-in |
`prefers-reduced-motion` reduz todas as animações a 1 ms.

## Fluxos implementados
| Fluxo | Comportamento |
|---|---|
| Período e plataformas | Globais, persistem entre telas; o date range tem presets, calendário, "Aplicar" e nota de fuso |
| Personalizar indicadores / colunas | Drawer → reordenar / remover / adicionar → Aplicar (Cancelar descarta) → salvo por usuário |
| Pausar campanha | Switch ou menu → **ConfirmDialog** → toast com **Desfazer** (estado local de demonstração) |
| Ação em lote | Selecionar linhas → a toolbar vira barra de lote (Ativar / Pausar / Limpar) |
| Hierarquia | Expandir campanha → conjuntos → anúncios, métricas proporcionais |
| Nova campanha | Modal de 2 colunas, validação no envio, "Criar pausada" marcado; sem integração, só valida e informa |
| Lead | Clicar na linha → drawer com detalhes e troca de status (local) |
| Regras | Modelos por categoria → "Usar modelo" → escolher alvo → aparece em Minhas regras; chave geral suspende todas |
| Exportar CSV | Campanhas e leads, respeitando os filtros atuais |

## Teclado
`Ctrl/⌘ + K` paleta · `G` seguido de `V` (visão geral), `C` (campanhas), `R` (criativos), `L` (leads), `A` (regras), `S` (configurações), `D` (design system) · `Esc` fecha overlays e limpa a busca · `↑ ↓` reordenam no configurador.
