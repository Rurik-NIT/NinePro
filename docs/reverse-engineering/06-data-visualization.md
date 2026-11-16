# 06 — Visualização de dados e catálogo de métricas

## 1. Catálogo de métricas de Ads (CONFIRMADO: drawers "Cards" e "Columns")

### Cards do Overview (padrão: 4)
**Padrão:** Spend · Results · Cost per result · CTR
**Disponíveis:** Impressions · CPM · Clicks · Cost per click · Purchases · Cost per purchase · Purchase value · ROAS · Leads · Cost per lead · Engagements · Cost per engagement · Video views · Cost per view · %CAC · Cost per sale · Cost per qualified lead · Lead to sale · Qualified rate

### Colunas da tabela de campanhas (padrão: 6)
**Travadas:** Spend · Impressions · Clicks · Conversions · All conv. **Removível:** CTR
**Disponíveis:** Reach · Frequency · Link clicks · CPC · CPM · Cost per conv. · Leads · Cost per lead · Purchases · Conv. value · ROAS · Value per conv. · Landing page views · Conversations · Cost per conversation · Followers · Cost per follower · %CAC · Cost per sale · Cost per qualified lead · Lead to sale · Qualified rate

### Presets de colunas
Performance · Leads · Sales · Messages · Delivery (o conteúdo de cada preset é DESCONHECIDO)

### Colunas de Creatives
CREATIVE · SPEND (ordenação padrão desc.) · CTR · RESULTS · COST PER RESULT · ROAS

### Objetivos (Goal) no Create ad
Engagement · Traffic · Awareness · Video Views (lista possivelmente filtrada pela plataforma: DESCONHECIDO)

## 2. Tipos de métrica e implicações de formatação (para o NinePro)

| Tipo | Exemplos | Formato sugerido |
|---|---|---|
| Moeda | Spend, CPC, CPM, Cost per *, Purchase value, Conv. value | moeda com 2 casas; algarismos tabulares |
| Contagem | Impressions, Reach, Clicks, Leads, Purchases | inteiro com separador de milhar; compactar (12,4 mil) só em KPIs |
| Taxa | CTR, %CAC, Lead to sale, Qualified rate | percentual com 1–2 casas |
| Razão | ROAS, Frequency | `3,42×` / `1,8` |

## 3. Gráficos observados (Analytics › Posting; CONFIRMADO no layout, sem dados)

| Painel | Tipo provável | Evidência |
|---|---|---|
| Posts per platform | distribuição por categoria | estado vazio "No posts yet" |
| Posts over time | série temporal semanal (eixo X: Oct 18 … Nov 15; linha de grade horizontal) | eixo visível |
| Likes per platform | por categoria, com select de métrica | select "Likes ⌄" |
| Likes over time | série temporal | vazio |
| Best Time to Post | provável heatmap dia × hora (DESCONHECIDO) | "Not enough data yet" |
| Follower history | série temporal | vazio |
| Top performing posts | tabela ranqueada | cabeçalhos |

Linguagem visual: painéis brancos com borda de 1px muito clara, título + subtítulo descrevendo o recorte, eixos mínimos, **sem** fundo de grade pesado. A paleta categórica de canais tem 10 cores fixas, com versão própria para o escuro (ver 04 §3). Isso confirma que as cores dos gráficos são **tokens**, não escolhas por gráfico.

## 4. KPI strip (CONFIRMADO)
Grade contínua: células de 72px, padding 12, sem gap e separadas por divisores de 1px. Rótulo em fonte pixel UPPERCASE 12px cinza e valor 24px/500. "No data" aparece em cinza no lugar do valor. **Nenhuma variação percentual ou comparativo com o período anterior apareceu**: DESCONHECIDO se existe quando há dados.

## 5. Desconhecidos de visualização
- Tooltips de gráfico, legendas interativas e cores por plataforma de anúncio.
- Comparação com o período anterior (Δ%).
- Gráficos dentro de Ads (nenhum apareceu sem dados).
- Formato de moeda e localidade (a conta exibe `$`).
