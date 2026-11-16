# 06 — Tema claro

Uma versão equivalente, **não invertida**: cada token foi escolhido para o fundo claro.

| Decisão | Motivo |
|---|---|
| Canvas `#F3F4F1` (cinza levemente esverdeado) e superfícies `#FFFFFF` | A elevação vem do branco sobre o canvas, como as superfícies escuras sobem sobre o canvas escuro |
| `soft #EEF0EC` para hover e item ativo | Diferença perceptível sem parecer "selecionado" demais |
| Bordas `#E1E4DF` e `line-soft #ECEEE9` | Discretas, mas presentes; o branco sobre o off-white precisa de borda |
| `accent-text #4A6600` | O limão como texto no branco teria 1,3:1; o verde-oliva escuro tem 6,6:1 |
| Botão primário continua Volt com texto `accent-ink` | Mantém a identidade e o contraste de 14,2:1 |
| Sinais escurecidos (`positive #17804F`, `negative #C93A27`, `warning #9A6510`, `info #1B6FAE`) | Todos ≥ 4,9:1 no branco |
| `--shadow-card` sutil (1 px, 4%) | No claro, um traço de sombra ajuda os painéis brancos a se separarem do canvas |
| Paleta de gráfico própria | Validada contra `#FFFFFF`; não é a do escuro clareada |

## Preferência
O tema escolhido fica salvo (`ninepro.theme`: `dark` | `light` | `system`). Um script inline no `index.html` aplica o tema antes do primeiro paint, sem flash.
