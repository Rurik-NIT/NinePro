# 13 — O que falta para igualar o Zernio (18/11/2026)

Fonte do lado Zernio: documentação pública, OpenAPI 1.657.0 (1.308 operações em 88 grupos), server card do MCP, pricing.md e changelog. Lido sem login nem cadastro.
Fonte do lado NinePro: código da branch `ninepro/foundation` (commit ccd531a), contando só o que funciona de verdade. Telas de demonstração não contam.

Legenda: ✅ igual · 🟡 parcial · ⬜ falta

## 1. Publicação
| Recurso | Zernio | NinePro | |
|---|---|---|---|
| Publicar, agendar, rascunho, fila, status "parcial", tentar de novo | sim | sim | ✅ |
| Validação de mídia e de texto | sim | sim (magic bytes, dimensões, duração, contagem do X) | ✅ |
| Link de envio de mídia para agente | sim (até 5 GB) | sim (limite do Storage, 50 MB no plano grátis) | 🟡 |
| Redes: X, Instagram, Facebook, LinkedIn, TikTok, YouTube, Threads, Bluesky, Telegram, Discord | sim | sim | ✅ |
| Pinterest, Google Business Profile, Slack | sim | não | ⬜ |
| Snapchat (beta fechado), Reddit (suspenso) | não disponível de fato | não | — |
| Blogs (WordPress, Shopify, Wix, Webflow) | sim | não | ⬜ |
| Horário diferente por rede no mesmo post | sim | não | ⬜ |
| Primeiro comentário (IG, FB, LinkedIn, YouTube, Threads) | sim | não | ⬜ |
| Instagram: stories, reels, carrossel, colaboradores, marcar pessoas, capa, local | sim | feed, carrossel, reels e stories | 🟡 |
| X: thread, enquete, quote, reply | sim | só post simples | 🟡 |
| TikTok: privacidade, dueto/stitch, conteúdo comercial, capa | sim | só privado com padrões | 🟡 |
| YouTube: visibilidade, playlist, categoria, Shorts, para crianças | sim | título e privado | 🟡 |
| LinkedIn: documento PDF, enquete, página da empresa | sim | perfil pessoal, texto, imagem e vídeo | 🟡 |
| Discord/Telegram: embeds, enquete, fórum, modo de formatação | sim | mensagem simples | 🟡 |
| Aprovação antes de publicar | sim | não | ⬜ |
| Reciclagem (evergreen) | sim | não | ⬜ |
| Importação em massa por CSV | sim | não | ⬜ |
| Editar, despublicar e fixar depois de publicado | sim | edita/exclui só no NinePro | 🟡 |
| Trazer posts feitos fora da plataforma | sim | só Instagram | 🟡 |

## 2. Análises
| Recurso | Zernio | NinePro | |
|---|---|---|---|
| Métricas por post | 12 redes | só Instagram | 🟡 |
| Insights de conta e demografia | IG, FB, LinkedIn, TikTok, YouTube, Pinterest, GBP | só Instagram | 🟡 |
| Crescimento de seguidores | sim | não | ⬜ |
| Melhor horário para postar | sim | não | ⬜ |
| Frequência × engajamento, queda de conteúdo | sim | não | ⬜ |
| Análises da caixa de entrada | sim | sim | ✅ |
| GA4 e Search Console | sim | tela vazia | ⬜ |

## 3. Caixa de entrada
| Recurso | Zernio | NinePro | |
|---|---|---|---|
| DMs WhatsApp e Instagram | sim | sim | ✅ |
| DMs Facebook Messenger, X, Telegram, Bluesky, TikTok, LinkedIn, Slack | sim | não | ⬜ |
| Comentários Instagram | sim | sim (responder, ocultar, apagar) | ✅ |
| Comentários Facebook, X, Threads, TikTok, YouTube, LinkedIn, Bluesky | sim | não | ⬜ |
| Comentários em anúncios | sim | não | ⬜ |
| Avaliações (Google e Facebook) | sim | tela de demonstração | ⬜ |
| Menções | IG, FB, LinkedIn | só Instagram | 🟡 |
| Contatos com tags e campos personalizados | sim | lista de contatos simples | 🟡 |
| Disparos | multicanal | só WhatsApp | 🟡 |
| Botões, ice breakers, menu persistente | sim | botão no comentário → DM | 🟡 |
| E-mail (Gmail, Outlook, IMAP) | sim | não | ⬜ |

## 4. Automações
| Recurso | Zernio | NinePro | |
|---|---|---|---|
| Comentário → DM | IG e FB com DM; outras redes só resposta pública | Instagram | 🟡 |
| Sequências | 11 canais | WhatsApp e Instagram | 🟡 |
| Fluxos em grafo (18 tipos de nó: condição, espera, aguardar resposta, A/B, IA, webhook, transferir) | sim | fluxos simples de gatilho → resposta | 🟡 |
| Regras de anúncio com prévia | sim, mais backtest, desfazer e aprovação | prévia e execução | 🟡 |
| Automações por evento (ex.: post falhou → avisar) | sim | não | ⬜ |
| Eventos de webhook | ~150 | 14 | 🟡 |
| HubSpot e Salesforce | sim | não | ⬜ |

## 5. Anúncios
| Recurso | Zernio | NinePro | |
|---|---|---|---|
| Painel, campanhas, criativos, leads, públicos | sim | Meta, Google, TikTok, LinkedIn (leitura) | 🟡 |
| Pausar e ativar campanha | sim | sim | ✅ |
| Criar campanha, conjunto e anúncio | sim | não | ⬜ |
| Impulsionar post | sim | não | ⬜ |
| Alterar orçamento, lance, duplicar | sim | não | ⬜ |
| Pinterest Ads, X Ads, Reddit Ads, Microsoft Ads, OpenAI Ads | sim | não | ⬜ |
| API de conversões multi-destino e tag do site | sim | tag própria + registro de conversão | 🟡 |
| Google Ads: palavras-chave, termos de busca, recomendações | sim | telas ocultas | ⬜ |
| Catálogos, biblioteca de anúncios, estimativa de alcance | sim | não | ⬜ |

## 6. Agentes de IA
| Recurso | Zernio | NinePro | |
|---|---|---|---|
| MCP com OAuth 2.1, PKCE e registro dinâmico | sim | sim | ✅ |
| Busca de ferramentas sob demanda (`search_tools`/`call_tool`) | sim | sim | ✅ |
| Quantidade de ferramentas | ~1.300 (uma por endpoint) | 61 | 🟡 |
| Modo agência (todos os perfis) | sim | sim | ✅ |
| CLI e SDKs (8 linguagens) | sim | não | ⬜ |
| n8n, Make, Zapier | sim | não | ⬜ |
| llms.txt, Agent Skills, server card no registry | sim | não | ⬜ |

## 7. Plataforma
| Recurso | Zernio | NinePro | |
|---|---|---|---|
| Espaços/perfis, equipe, chaves de API, webhooks, logs | sim | sim | ✅ |
| Papéis Billing Manager e Viewer; acesso limitado por perfil | sim | dono, admin, membro | 🟡 |
| 2FA, SSO | sim | tela | 🟡 |
| Links de conexão com marca própria (white-label) | sim | não | ⬜ |
| Retenção zero de conteúdo | sim | tela | 🟡 |
| Cobrança por uso, saldo, recarga | sim | tela de demonstração | ⬜ |

## 8. Fora do núcleo (pesado ou regulado)
Telefonia (números, voz, SIP, 10DLC, chamada identificada), SMS, RCS, iMessage, WhatsApp Calling, Meta Business Agent, calendário, arquivos, Shopify Commerce (85 endpoints), campanhas de creators com pagamentos, Treasury. No NinePro essas áreas são telas de demonstração.

## Onde o NinePro já é melhor
- Em português e pensado para o Brasil (fuso de Brasília, WhatsApp no centro).
- Uma só interface para tudo, enquanto o Zernio é API-first com dashboard mais simples.
- Validação de mídia já roda sozinha no compositor, rede por rede.
