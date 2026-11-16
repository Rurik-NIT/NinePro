# 11 — Matriz de paridade Zernio → NinePro

**Diretriz do produto (2026-11-16):** o NinePro deve ser **idêntico em funcionalidades e telas** ao sistema de referência, em português. Diferem só a **identidade visual** e os **nomes**.
**Fonte:** varredura de leitura de todas as rotas (navegação pelo roteador da própria página, sem envio de formulários), em `docs/reverse-engineering/12-screen-sweep.md`, mais os documentos 03, 05 e 10.

Legenda — **Status NinePro:** ✅ implementada · 🟡 parcial · ⬜ pendente.
**Limite permanente:** onde a referência depende de integração real (publicar em redes, enviar WhatsApp/SMS, ligar, cobrar), o NinePro reproduz tela, fluxo e estados com dados fictícios. Ações externas aparecem desabilitadas, com explicação. Nada simula o envio.

## Navegação
| Referência | NinePro | Status |
|---|---|---|
| Sidebar com drill-down por módulo, grupos Communications/Developers | Mesma estrutura (`config/navigation.ts`), grupos Comunicação/Desenvolvedores | ✅ |
| Seletor STUDIO/CONSOLE | Seletor Estúdio/Console (Console desabilitado) | 🟡 |
| Paleta ⌘K com todas as páginas | Paleta com todas as páginas e módulos | ✅ |
| Trilha `Módulo / Página` + contador | Idem | ✅ |

## Telas
| Referência | NinePro (rota) | Conteúdo-chave observado | Status |
|---|---|---|---|
| Home | `/` Início | Hero, plataformas, agentes, quickstart (MCP/CLI/API), passos | ✅ |
| Connections | `/conexoes` | Onboarding em 4 passos; conexões por tipo | 🟡 (lista de plataformas; onboarding a reproduzir) |
| Posts › All posts | `/publicacoes` | Filtro, ordenação, grade/lista/calendário, densidade 2–5, vazio "conectar" | ✅ |
| Posts › Queues | `/publicacoes/filas` | Filas de publicação | ✅ |
| Analytics › Posting | `/analises/publicacoes` | 4 filtros, 5 KPIs, 6 gráficos, top posts | ✅ |
| Analytics › Inbox | `/analises/caixa-de-entrada` | KPIs diários (recebidas/enviadas/lidas/falhas), por plataforma, tempo de resposta, origem, horário, top contas | ✅ |
| Analytics › Website | `/analises/site` | Vazio "conectar GA4" | ✅ |
| Inbox › Messages | `/caixa-de-entrada/mensagens` | Filtro, nova mensagem, lista de conversas + thread | ✅ |
| Inbox › Comments | `/caixa-de-entrada/comentarios` | Lista de posts com comentários | ✅ |
| Inbox › Reviews | `/caixa-de-entrada/avaliacoes` | Lista de avaliações | ✅ |
| Inbox › Mentions | `/caixa-de-entrada/mencoes` | Menções / marcações (Instagram, LinkedIn) | ✅ |
| Inbox › Campaigns | `/caixa-de-entrada/campanhas` | Na referência: erro de acesso, conteúdo DESCONHECIDO | 🟡 (tela honesta "não observado") |
| Inbox › Workflows | `/caixa-de-entrada/fluxos` | Tabela nome/plataforma/conta/nós/execuções/ID/criado + "Novo fluxo" | ✅ |
| Inbox › Contacts | `/caixa-de-entrada/contatos` | Na referência: erro de acesso, conteúdo DESCONHECIDO | 🟡 (tela honesta "não observado") |
| Ads › Overview | `/anuncios` | Período, filtro por objetivo, cards configuráveis, views salvas | ✅ |
| Ads › Campaigns | `/anuncios/campanhas` | Árvore campanha→conjunto→anúncio, colunas, views, criar/impulsionar | ✅ |
| Ads › Creatives | `/anuncios/criativos` | Tabela por criativo | ✅ |
| Ads › Leads | `/anuncios/leads` | Tabela + exportar CSV | ✅ |
| Ads › Conversions › Overview | `/anuncios/conversoes` | Assistente de rastreamento em 3 passos | ✅ |
| Ads › Conversions › Events | `/anuncios/conversoes/eventos` | Filtros fonte/evento/status, tabela evento/fonte/destino/página/campanha/recebido | ✅ |
| Ads › Conversions › Destinations | `/anuncios/conversoes/destinos` | Lista de plataformas de anúncio + conectar | ✅ |
| Ads › Conversions › Sources | `/anuncios/conversoes/fontes` | Sites rastreados + outras fontes (pagamentos, CRM, formulários, API) | ✅ |
| Ads › Audiences | `/anuncios/publicos` | Tabela público/tipo/tamanho/status/conta + criar | ✅ |
| Ads › Lead Forms | `/anuncios/formularios` | Tabela formulário/status/idioma/criado/leads + novo | ✅ |
| Ads › Keywords, Search terms, Bid strategies, Catalogs, Partnership, Account | `/anuncios/...` (fora da sidebar) | Mesmo template da tabela de campanhas | ✅ |
| Automations › All | `/automacoes` | Lista unificada + limites | ✅ |
| Automations › New | `/automacoes/nova` | Construtor em canvas: Início (3 gatilhos, 40 eventos), Só se (E/OU, 18 métricas), Alterar (8 ações), Enviar alerta, prévia com simulação, rascunho/ativar | ✅ |
| Automations › Templates / Marketplace | `/automacoes/modelos` | Modelos + marketplace com categorias | 🟡 (modelos + simulação) |
| Commerce › Products / Collections / Discounts / Catalog sync | `/comercio/...` | Vazio "conectar loja" (Shopify/WooCommerce) | ✅ |
| Creators | `/criadores` | Campanhas com criadores: tabela + 3 passos + criar campanha | ✅ |
| WhatsApp › Overview | `/whatsapp` | Remetentes (sandbox/teste), filtros tipo/status, conectar | ✅ |
| WhatsApp › Templates / Flows / Groups / Conversions | `/whatsapp/...` | Vazio "conecte um remetente" | ✅ |
| iMessage › Overview | `/imessage` | Sandbox (código de entrada), remetentes, adicionar contato | ✅ |
| iMessage › Opt-in links | `/imessage/opt-in` | Remetente/link/QR/links rastreados | ✅ |
| iMessage › Audience | `/imessage/publico` | Contato/remetente/status/origem/última mensagem | ✅ |
| Phone › Overview | `/telefonia` | Números: trazer o próprio, comprar; número de teste | ✅ |
| Phone › Calls | `/telefonia/chamadas` | Tabela início/contato/status/duração/custo/ID + nova chamada | ✅ |
| Phone › SIP | `/telefonia/sip` | Trunks: host/transporte/números + novo trunk | ✅ |
| Phone › Branded calling | `/telefonia/chamada-identificada` | Identidade de chamada, regras, preço, formulário para terceiro | ✅ |
| Phone › 10DLC | `/telefonia/10dlc` | Marcas: status, trust score, throughput, mensal, números | ✅ |
| Phone › Sender IDs | `/telefonia/ids-remetente` | Nome do remetente alfanumérico | ✅ |
| Phone › RCS | `/telefonia/rcs` | Agentes RCS: país/status/empresa/preço | ✅ |
| API Keys | `/chaves-api` | Filtros, criar chave, tabela nome/chave/escopo/status/permissão | ✅ |
| Users | `/usuarios` | Filtros papel/acesso, atividade, convidar, tabela membro/papel/acesso/último login | ✅ |
| Webhooks | `/webhooks` | Tabela nome/endpoint/status/eventos/saúde/última entrega + criar | ✅ |
| Logs | `/logs` | Período, filtro, ao vivo, contagem de erros, tabela hora/status/atividade/plataforma/perfil/duração | ✅ |
| Usage | `/uso` | Período, por produto / por conta, tabela produto/usado/pago por/valor/participação | ✅ |
| Billing (= Balance) | `/faturamento` | Plano, cartão, recarga automática, contas conectadas, o que o cartão libera | ✅ |
| Settings (13 seções) | `/configuracoes?secao=…` + `/uso`, `/faturamento` | Perfil, Segurança (2FA, sessões, sair de todos), Retenção, Notificações (alertas, canal, e-mail, webhook), Apps conectados, Slack, Ranking, Provedores de IA, Marca própria (com prévia), SSO, Zona de perigo — ver 12 | ✅ |
| Hashtag research, Live | — | Redirecionam para Connections na referência (inativas) | n/a |
| Produto CONSOLE (11 rotas) | — | Fase posterior | ⬜ |


## Resumo (2026-11-16, fim da rodada de paridade 1)
- **Telas da referência mapeadas:** 77 rotas (ver 01) + 13 seções de Configurações.
- **Implementadas no NinePro:** 56 rotas navegáveis, verificadas no navegador sem erros de console e sem overflow (1440 px).
- **Pendentes:** onboarding de Conexões, conteúdo de Inbox › Campanhas/Contatos (bloqueado na referência) e o produto Console (11 rotas).
- **Rodada 2 (2026-11-16):** construtor de automação e as 13 seções de Configurações concluídos (mapeamento em `12-settings-and-builder.md`).
