# 12 — Configurações (13 seções) e construtor de automação

Mapeado em 2026-11-16 com cliques reais no painel do navegador (a varredura automática não abria as seções). Só leitura: nenhum campo foi salvo, e o rascunho de automação aberto para inspeção **não** foi salvo.

## Configurações — CONFIRMADO

| Seção (rota da referência) | Conteúdo observado |
|---|---|
| Profile (`section=profile`) | Avatar (enviar/remover, JPEG/PNG/WebP/GIF até 5 MB), Nome + Salvar; grupo Acesso: e-mail gerenciado pelo provedor de login, "defina uma senha para alterar" |
| Usage | Abre a tela `/usage` (período, por produto/por conta) |
| Billing | Abre a tela `/billing` |
| Security (`section=sessions`) | **Verificação em duas etapas** (inativa; exige senha definida; códigos de recuperação), **Sessões ativas** (navegador/SO, IP, data de entrada, "este dispositivo", sair por sessão), **Sair de todos os dispositivos** |
| Content retention | Retenção zero de conteúdo para a equipe inteira (switch) ou só para perfis escolhidos |
| Notifications | **Alertas** (falhas de publicação, desconexão de contas, pagamentos, uso), **Atualizações** (campanhas de criadores, e-mails de marketing), **Canal de notificação** (Slack/Telegram), e-mail alternativo para alertas, **webhook de notificação** (salvar + enviar teste), conectar Slack/Telegram só para notificações |
| Connected apps | Assistentes de IA autorizados via OAuth, com o acesso concedido e revogação imediata; vazio "nenhum assistente conectado" |
| Slack | Slack Connect com a equipe de suporte, liberado a partir de N contas conectadas (contador do que falta) |
| Leaderboard | Inscrição do produto num ranking público por uso verificado: checklist de revisão (ativo, site não listado, dono do site, produto real), nome, slogan (0/80), site, logo, clipe demo (até 60 s), "mostrar faixa de uso", enviar para revisão |
| AI providers | Chaves próprias de provedores para passos de IA dos fluxos (Anthropic, OpenAI, Google Gemini, Mistral, Groq, OpenRouter): formato esperado, link para obter, Salvar; cobrança direta do provedor; chave nunca exibida de novo |
| White Labeling | Tela de conexão com marca própria: mostrar em todo link, título do app, logo, links de termos e privacidade, selo, cor de destaque, banner, ícones, cor do botão, raio, tipografia, superfícies, textos (boas-vindas/sucesso/erro com {brand}/{platform}), prévia com abas Boas-vindas/Formulário/Sucesso/Erro |
| Single sign-on | Domínio de e-mail da empresa (verificado por DNS), protocolo SAML/OIDC, metadados do provedor de identidade, entrada automática como membro, conectar |
| Danger Zone (`section=danger`) | Excluir conta: enviar código por e-mail, campo de código (expira em 1 h), confirmar exclusão |

## Construtor de automação (`/automations/new`) — CONFIRMADO
**Layout:** campo de nome no topo, status "Rascunho", **Salvar rascunho**, **Ativar**; canvas com zoom e encaixe; nós encadeados verticalmente com "+" entre eles; **painel inspetor** à direita do nó selecionado; botão **Prévia**.

**Nós padrão:** INÍCIO → SÓ SE → AÇÃO (enviar alerta).

**Início — o que dispara:**
1. *Anúncios em horário*: frequência (padrão a cada hora), só entre datas, pular uma janela diária; o que observa: conexão (conta de anúncios), verificar cada **campanha / conjunto / anúncio**, onde está o orçamento, ativo há pelo menos N dias, filtros por nome.
2. *Publicações em horário* (opções não detalhadas).
3. *Quando algo acontece*: escolher evento + perfil. **Eventos (40, em 9 grupos):** Publicações (falhou, parcial, publicada, agendada, reciclada, publicada em uma plataforma, falhou em uma plataforma, publicada excluída, publicada fora da ferramenta); Contas (conectou, desconectou, perdeu permissões, em resfriamento de envio, modelo do WhatsApp mudou de status, qualidade do WhatsApp mudou); Anúncios (conta parou de sincronizar, objeto mudou de status, anúncio reprovado, problema de entrega, campanha sem orçamento, conta mudou de status, campanha mudou de status); Caixa de entrada (mensagem chegou, falha de entrega, nova conversa, reação, mensagem vinda de anúncio/link); Comentários; Avaliações; Chamadas (chegou, terminou, falhou); Leads (novo lead); Pedidos (novo, alterado, reembolsado).

**Só se — condições:** grupo **E** ("todas as condições") com alternância para **OU** ("qualquer uma"); linha = métrica + período + operador + valor ("como número"). **Métricas (18):** Investimento, Impressões, Cliques, Conversões, CTR %, CPC, CPM, CPA, ROAS, Orçamento diário, % do orçamento usado, Dia do mês, Dia útil do mês, %CAC, Custo por venda, Custo por lead qualificado, Lead→venda, Taxa de qualificação. Opções de período e de operador: DESCONHECIDAS (o seletor não expôs a lista).

**"+" entre nós:** *Alterar algo*. **Ações de alteração (8):** Pausar; Reativar o que uma regra pausou; Ajustar orçamento diário; Ajustar lance ou teto de custo; Ajustar CPA ou ROAS alvo (Google); Mover orçamento do pior para o melhor; Duplicar (a cópia começa pausada); Marcar no nome.

**Enviar alerta:** destino Slack ou e-mail (os dois desabilitados sem canal conectado).

## Conexões — onboarding (CONFIRMADO)
Título de boas-vindas + 4 passos **sequenciais** (2–4 ficam bloqueados até responder o 1):
1. *Como você quer usar?* — dois cartões ilustrados: usar você mesmo / integrar ao seu software; link "ainda não sei? conecte uma conta primeiro" (pula para o passo 2 com "voltar à pergunta").
2. *Conecte sua primeira conta ou número* — 31 conectores: TikTok, Instagram, YouTube, Facebook, LinkedIn, X, Threads, Bluesky, Pinterest, Google Business, Discord, Slack, Shopify, WordPress, Wix, Webflow, WhatsApp, Telegram, LINE, WeChat, iMessage, Número de telefone, Meta Ads, Google Ads, TikTok Ads, LinkedIn Ads, Pinterest Ads, X Ads, OpenAI Ads, Reddit Ads, Microsoft Ads.
3. *Onde você vai trabalhar?* — painel, API, ou Claude/ChatGPT/Cursor (opções internas não abertas: o passo exige responder o 1, o que gravaria uma preferência na conta).
4. *Fique por dentro* — acompanhar novidades (X, Telegram).
Rodapé: "Pular configuração".

## Produto Console (CONFIRMADO)
Sidebar plana: Plataformas · Números · Perfis · Sessões · Webhooks · Logs · Chaves de API · Seus apps · Equipe · Configurações.
- **Plataformas (38):** tabela plataforma/slug/autenticação (OAuth2, credenciais, token de bot; "via Facebook/LinkedIn/Pinterest")/capacidades (publicação, análises, caixa de entrada, anúncios, comércio, e-mail, agenda, contatos)/contas; filtro por categoria.
- **Perfis:** filtros plataforma/status/ordem, novo perfil; colunas perfil, ID, plataformas conectadas, ativas, precisam reconectar, última atividade.
- **Seus apps:** apps OAuth próprios (marca na tela de consentimento): app, plataforma, status, client ID, permissões, ID do app, contas.
- **Sessões:** filtros resultado/plataforma/perfil, período 24h/7d/30d; colunas quando, perfil, plataforma, método, resultado.
- **Números:** conectar número de WhatsApp, comprar número; colunas número, ID, tipo, canais, perfil, status, preço, adicionado.
- **Webhooks, Logs, Chaves de API, Equipe, Configurações:** mesmas telas do Estúdio.
