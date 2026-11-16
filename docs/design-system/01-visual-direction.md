# 01 — Direção visual

**Atributos:** profissional, inteligente, preciso, sob controle, organizado, tecnológico, sofisticado, claro.

## Linguagem
- **Moldura flutuante:** canvas + sidebar em painel arredondado + área de trabalho, com gutter de 12 px (`--frame-gutter`). No mobile a moldura some e a sidebar vira drawer.
- **Grafite + Volt:** neutros com viés verde-frio e um único acento elétrico. O Volt aparece em menos de 5% da tela.
- **Técnico sem ser frio:** rótulos em IBM Plex Mono caixa alta (cabeçalhos de tabela, labels de KPI, tags) contra a Manrope arredondada das interfaces e números.
- **Marca:** o "9" do NinePro é desenhado como uma **retícula**, com círculo de mira, ponto central e haste. É legível de 16 a 44 px e funciona sozinho como favicon.

## Evitado de propósito
Gradientes decorativos, cards dentro de cards sem motivo, sombras pesadas, pílulas coloridas de status (usamos ponto + rótulo), ícones ilustrativos grandes, cores aleatórias por gráfico, e campo de "Ask AI" (não há IA no escopo confirmado).

## Por que Volt (justificativa cromática)
1. **Semântica do domínio:** em tráfego pago, "verde" é veiculação ativa e dinheiro trabalhando. O limão elétrico carrega isso sem se confundir com o `positive` (verde-menta, hue 152°, contra 75° do Volt).
2. **Contraste:** 14,9:1 sobre o canvas escuro, e 14,2:1 do texto `accent-ink` sobre o próprio Volt. Funciona como botão com texto escuro nos dois temas.
3. **Identidade própria:** fica longe do amarelo do CoachIQ (referência estética) e do vermelho-laranja do sistema funcional.
4. **No claro**, o Volt continua como preenchimento de botão, e o `accent-text` escurece para `#4A6600` (6,6:1 no branco) quando o acento é usado como texto.
