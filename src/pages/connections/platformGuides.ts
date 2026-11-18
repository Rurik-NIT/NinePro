/** Textos de ajuda de cada plataforma no modal de conexão (o que fazer em cada site). */
export type PlatformKey = "meta" | "google" | "tiktok" | "linkedin" | "whatsapp" | "instagram" | "facebook" | "threads" | "linkedin_social" | "youtube" | "tiktok_social" | "x" | "telegram" | "discord" | "bluesky" | "pinterest" | "google_business" | "slack";

interface Guide {
  label: string;
  site: string;
  loginLabel: string;
  appDesc: string;
  tokenDesc: string;
  appSteps: string[];
  tokenSteps: string[];
  note?: (mode: "app_proprio" | "token") => string;
}

export const PLATFORM_GUIDE: Record<PlatformKey, Guide> = {
  meta: {
    label: "Meta Ads", site: "o Facebook", loginLabel: "Entrar com Facebook",
    appDesc: "Use o app que sua empresa já tem no Meta for Developers.",
    tokenDesc: "Token de usuário do sistema do Business Manager. Não expira.",
    appSteps: [
      "No seu app em developers.facebook.com, adicione o produto Login do Facebook (ou Login do Facebook para Empresas).",
      "Em Login do Facebook › Configurações › URIs de redirecionamento OAuth válidos, cole o endereço abaixo e salve.",
      "Copie o ID do app e a Chave secreta em Configurações do app › Básico.",
    ],
    tokenSteps: [
      "No Business Manager: Configurações do negócio › Usuários › Usuários do sistema; crie um usuário Administrador.",
      "Em Atribuir ativos, dê acesso às contas de anúncio.",
      "Clique em Gerar novo token, escolha um app da empresa, marque ads_read, ads_management e business_management e a validade Nunca.",
    ],
    note: (m) => (m === "app_proprio" ? "Com o app em modo de desenvolvimento, conectam as contas de quem tem papel no app. Para as suas próprias contas, isso já basta." : "O token é conferido com a Meta antes de salvar e fica guardado criptografado."),
  },
  google: {
    label: "Google Ads", site: "o Google", loginLabel: "Entrar com Google",
    appDesc: "Cliente OAuth do Google Cloud + developer token da sua conta de administrador.",
    tokenDesc: "Cliente OAuth, developer token e um refresh token gerado por você.",
    appSteps: [
      "No Google Cloud, ative a Google Ads API e crie um ID do cliente OAuth do tipo Aplicativo da Web.",
      "Em URIs de redirecionamento autorizados, cole o endereço abaixo.",
      "No Google Ads (conta de administrador/MCC) › Administrador › Central de API, copie o developer token.",
      "Se acessa as contas por uma MCC, informe o ID dela.",
    ],
    tokenSteps: [
      "Tenha um ID do cliente OAuth (Google Cloud) e o developer token (Central de API da MCC).",
      "Gere um refresh token com o escopo https://www.googleapis.com/auth/adwords usando o seu cliente (por exemplo, no OAuth Playground com “Use your own OAuth credentials”).",
      "Preencha os campos abaixo.",
    ],
    note: () => "O developer token precisa de acesso Básico (ou superior) aprovado pelo Google para ler contas reais; com acesso de teste, só contas de teste.",
  },
  tiktok: {
    label: "TikTok Ads", site: "o TikTok", loginLabel: "Entrar com TikTok",
    appDesc: "Use o app que sua empresa tem no TikTok for Business Developers.",
    tokenDesc: "Token de acesso long-term + IDs das contas de anúncio.",
    appSteps: [
      "Em business-api.tiktok.com › My Apps, abra o seu app (com as permissões de Ads Management e Reporting).",
      "Em Advertiser redirect URL, cole o endereço abaixo e salve.",
      "Copie o App ID e o Secret.",
    ],
    tokenSteps: [
      "No portal TikTok for Business Developers, autorize o seu app nas contas de anúncio e copie o access token gerado.",
      "No TikTok Ads Manager, copie o ID de cada conta de anúncio (advertiser ID).",
      "Cole o token e os IDs abaixo.",
    ],
  },
  linkedin: {
    label: "LinkedIn Ads", site: "o LinkedIn", loginLabel: "Entrar com LinkedIn",
    appDesc: "Use o app da sua empresa no LinkedIn Developers (com Advertising API).",
    tokenDesc: "Token gerado no LinkedIn Developers. Vale 60 dias.",
    appSteps: [
      "Em linkedin.com/developers, abra o seu app e confirme que ele tem o produto Advertising API aprovado.",
      "Em Auth › Authorized redirect URLs, cole o endereço abaixo.",
      "Copie o Client ID e o Client secret.",
    ],
    tokenSteps: [
      "Em linkedin.com/developers › Tools › Token generator, escolha o seu app.",
      "Marque r_ads, r_ads_reporting e rw_ads e gere o token.",
      "Cole abaixo. Ele vale 60 dias; depois, gere outro e reconecte.",
    ],
    note: (m) => (m === "token" ? "Tokens do LinkedIn expiram em 60 dias. Com o app da empresa, a renovação é automática quando o app tem refresh token habilitado." : "A Advertising API precisa ser aprovada pelo LinkedIn para o seu app."),
  },
  whatsapp: {
    label: "WhatsApp Business", site: "o Facebook", loginLabel: "Entrar com Facebook",
    appDesc: "Use o app da sua empresa no Meta for Developers com o produto WhatsApp.",
    tokenDesc: "Token permanente de usuário do sistema. O jeito mais rápido.",
    appSteps: [
      "No seu app em developers.facebook.com, adicione os produtos WhatsApp e Login do Facebook.",
      "Em Login do Facebook › Configurações › URIs de redirecionamento OAuth válidos, cole o endereço abaixo e salve.",
      "Copie o ID do app e a Chave secreta em Configurações do app › Básico.",
      "Depois de conectar, cole a URL de webhook e o token de verificação (aparecem no cartão) em WhatsApp › Configuração.",
    ],
    tokenSteps: [
      "No Business Manager: Configurações do negócio › Usuários do sistema; crie um usuário Administrador.",
      "Em Atribuir ativos, dê controle total da conta do WhatsApp Business e do app.",
      "Gere um token com whatsapp_business_messaging e whatsapp_business_management, validade Nunca.",
      "Depois de conectar, cole a URL de webhook e o token de verificação (aparecem no cartão) em WhatsApp › Configuração do seu app e assine o campo messages.",
    ],
    note: (m) => (m === "token" ? "Com token próprio, as mensagens chegam assim que o webhook do seu app apontar para o NinePro. Não depende de aprovação da Meta para o seu próprio número." : "O número precisa estar registrado na Cloud API (WhatsApp › Configuração da API)."),
  },
  instagram: {
    label: "Instagram", site: "o Instagram", loginLabel: "Entrar com Instagram",
    appDesc: "Use o app da sua empresa (produto Instagram, login do Instagram).",
    tokenDesc: "Token gerado no painel do app. Renovado sozinho a cada 60 dias.",
    appSteps: [
      "No seu app em developers.facebook.com, adicione o produto Instagram › Configuração da API com login do Instagram.",
      "Em Configurar login comercial do Instagram › URIs de redirecionamento, cole o endereço abaixo.",
      "Copie o ID e a Chave secreta do app do Instagram (não são os do app da Meta).",
      "Depois de conectar, cole a URL de webhook e o token de verificação (aparecem no cartão) em Configurar webhooks e assine messages e comments.",
    ],
    tokenSteps: [
      "A conta do Instagram precisa ser profissional (Empresa ou Criador de conteúdo).",
      "No seu app: Instagram › Configuração da API com login do Instagram › Gerar tokens de acesso › Adicionar conta.",
      "Entre com a conta do Instagram e copie o token gerado.",
      "Depois de conectar, cole a URL de webhook e o token de verificação (aparecem no cartão) em Configurar webhooks.",
    ],
    note: () => "Com o app em modo de desenvolvimento, conectam as contas que têm papel de testador no app. Para as suas próprias contas, isso já basta.",
  },
  facebook: {
    label: "Facebook", site: "o Facebook", loginLabel: "Entrar com Facebook",
    appDesc: "O app da sua empresa no Meta for Developers (o mesmo dos anúncios serve).",
    tokenDesc: "Token de usuário ou de Página com permissão de publicar.",
    appSteps: [
      "No seu app em developers.facebook.com › Login do Facebook › Configurações, cole o endereço abaixo em URIs de redirecionamento.",
      "Em Casos de uso, adicione Gerenciar tudo na sua Página (pages_show_list, pages_read_engagement e pages_manage_posts).",
      "Copie o ID do app e a Chave secreta em Configurações do app › Básico.",
    ],
    tokenSteps: [
      "Abra o Explorador da Graph API, escolha seu app e marque pages_show_list, pages_read_engagement e pages_manage_posts.",
      "Gere o token de usuário (ou escolha a Página para um token de Página) e cole abaixo.",
    ],
    note: () => "Em modo de desenvolvimento, publicam as Páginas de quem tem papel no app. Para as suas Páginas, isso já basta.",
  },
  threads: {
    label: "Threads", site: "o Threads", loginLabel: "Entrar com Threads",
    appDesc: "App da Meta com o caso de uso Acessar a API do Threads.",
    tokenDesc: "Token do Threads gerado no painel do app. Renovado sozinho.",
    appSteps: [
      "No seu app em developers.facebook.com › Casos de uso › Acessar a API do Threads › Configurações, cole o endereço abaixo em URLs de retorno de chamada.",
      "Marque threads_basic e threads_content_publish.",
      "Copie o ID e a Chave secreta do app do Threads (aparecem na mesma tela).",
    ],
    tokenSteps: [
      "Em Funções do app, adicione sua conta do Threads como testadora e aceite o convite no Threads (Configurações › Conta › Permissões do site).",
      "Gere o token no Explorador da Graph API (graph.threads.net) com threads_basic e threads_content_publish.",
    ],
  },
  linkedin_social: {
    label: "LinkedIn", site: "o LinkedIn", loginLabel: "Entrar com LinkedIn",
    appDesc: "App no LinkedIn Developers com Share on LinkedIn (perfil) e, se aprovado, Community Management API (Páginas).",
    tokenDesc: "Token gerado no LinkedIn Developers. Vale 60 dias.",
    appSteps: [
      "No LinkedIn Developers, abra o app › Products e adicione Sign In with LinkedIn using OpenID Connect e Share on LinkedIn.",
      "Em Auth › Authorized redirect URLs, cole o endereço abaixo.",
      "Copie o Client ID e o Client secret.",
      "Para publicar em Páginas da empresa, peça a Community Management API (aprovação do LinkedIn).",
    ],
    tokenSteps: ["No LinkedIn Developers › Token generator, escolha o app e marque openid, profile e w_member_social.", "Copie o token gerado. Ele vale 60 dias."],
  },
  youtube: {
    label: "YouTube", site: "o Google", loginLabel: "Entrar com Google",
    appDesc: "Cliente OAuth do Google Cloud com a YouTube Data API v3 ativada.",
    tokenDesc: "Cliente OAuth e um refresh token gerado por você.",
    appSteps: [
      "No Google Cloud › APIs e serviços, ative a YouTube Data API v3.",
      "Em Credenciais, crie um ID do cliente OAuth do tipo Aplicativo da Web e cole o endereço abaixo em URIs de redirecionamento.",
      "Na Tela de consentimento OAuth, adicione o seu e-mail como usuário de teste.",
    ],
    tokenSteps: ["No OAuth Playground (engrenagem › Use your own OAuth credentials), use o seu cliente.", "Autorize o escopo youtube.upload e troque o código pelo refresh token."],
    note: () => "Enquanto o projeto do Google não passa pela auditoria da API do YouTube, os vídeos enviados ficam privados.",
  },
  tiktok_social: {
    label: "TikTok", site: "o TikTok", loginLabel: "Entrar com TikTok",
    appDesc: "App no TikTok for Developers com Login Kit e Content Posting API (não é o app do TikTok Ads).",
    tokenDesc: "Client key, client secret e um refresh token do seu app.",
    appSteps: [
      "Em developers.tiktok.com, crie o app e adicione os produtos Login Kit e Content Posting API (com Direct Post).",
      "Em Login Kit › Redirect URI, cole o endereço abaixo.",
      "Marque os escopos user.info.basic, video.publish e video.upload e copie o Client key e o Client secret.",
    ],
    tokenSteps: ["Faça o login OAuth pelo seu app e copie o refresh token (vale 365 dias).", "Informe também o Client key e o Client secret."],
    note: () => "Até o TikTok auditar o app, as publicações saem como privadas e só contas adicionadas como testadoras conectam.",
  },
  x: {
    label: "X (Twitter)", site: "o X", loginLabel: "Entrar com X",
    appDesc: "App no X Developer Portal com autenticação OAuth 2.0 (leitura e escrita).",
    tokenDesc: "Client ID, client secret e um refresh token do seu app.",
    appSteps: [
      "Em developer.x.com › seu app › User authentication settings, ative OAuth 2.0, tipo Web App, permissão Read and write.",
      "Em Callback URI, cole o endereço abaixo.",
      "Em Keys and tokens, copie o OAuth 2.0 Client ID e o Client Secret.",
    ],
    tokenSteps: ["Faça o login OAuth 2.0 do seu app com o escopo offline.access e copie o refresh token.", "Informe também o Client ID e o Client secret."],
    note: () => "O plano gratuito da API do X permite um número limitado de publicações por mês.",
  },
  telegram: {
    label: "Telegram", site: "o Telegram", loginLabel: "Token do bot",
    appDesc: "",
    tokenDesc: "Token do seu bot e os canais ou grupos onde ele publica.",
    appSteps: [],
    tokenSteps: [
      "No Telegram, fale com @BotFather, envie /newbot e copie o token.",
      "No seu canal: Administradores › Adicionar administrador › escolha o bot e deixe Publicar mensagens marcado.",
      "Informe o @ do canal (ou o ID -100…) abaixo, um por linha.",
    ],
  },
  discord: {
    label: "Discord", site: "o Discord", loginLabel: "Webhook",
    appDesc: "",
    tokenDesc: "URL do webhook de cada canal.",
    appSteps: [],
    tokenSteps: ["No canal do servidor: Editar canal › Integrações › Webhooks › Novo webhook.", "Copie a URL do webhook e cole abaixo. Um por linha para vários canais."],
  },
  bluesky: {
    label: "Bluesky", site: "o Bluesky", loginLabel: "Senha de app",
    appDesc: "",
    tokenDesc: "Seu usuário e uma senha de app (não a senha da conta).",
    appSteps: [],
    tokenSteps: ["No Bluesky: Configurações › Privacidade e segurança › Senhas de app › Adicionar senha de app.", "Copie a senha gerada e informe abaixo com o seu usuário."],
  },
  pinterest: {
    label: "Pinterest", site: "o Pinterest", loginLabel: "Entrar com Pinterest",
    appDesc: "Use o app da sua empresa em developers.pinterest.com.",
    tokenDesc: "App ID, chave secreta e um refresh token gerado pelo seu app.",
    appSteps: [
      "Em developers.pinterest.com › My apps, crie ou abra o app (conta Business).",
      "Em Redirect URIs, cole o endereço abaixo e salve.",
      "Copie o App ID e a App secret key.",
    ],
    tokenSteps: ["Faça o login OAuth do seu app com os escopos boards:read, boards:write, pins:read, pins:write e user_accounts:read.", "Copie o refresh token (vale 1 ano) e informe abaixo com o App ID e a chave."],
    note: () => "Apps em Trial access publicam pins visíveis só para a própria conta até o Pinterest liberar o acesso padrão.",
  },
  google_business: {
    label: "Google Meu Negócio", site: "o Google", loginLabel: "Entrar com Google",
    appDesc: "Use um cliente OAuth do Google Cloud com as APIs do Business Profile liberadas.",
    tokenDesc: "ID do cliente, chave secreta e refresh token com o escopo business.manage.",
    appSteps: [
      "No Google Cloud, ative My Business Account Management, My Business Business Information e Google My Business API.",
      "Em APIs e serviços › Credenciais, crie um cliente OAuth (Aplicativo da Web) e cole o endereço abaixo em URIs de redirecionamento.",
      "Copie o ID do cliente e a chave secreta.",
    ],
    tokenSteps: ["No OAuth Playground, use o seu cliente com o escopo https://www.googleapis.com/auth/business.manage.", "Troque o código pelo refresh token e informe abaixo com o ID e a chave do cliente."],
    note: () => "O Google libera as APIs do Business Profile por pedido: até a aprovação, a cota do projeto é zero e a publicação falha com aviso.",
  },
  slack: {
    label: "Slack", site: "o Slack", loginLabel: "Adicionar ao Slack",
    appDesc: "Use o app da sua empresa em api.slack.com/apps.",
    tokenDesc: "Token do bot (xoxb-…) do app instalado no workspace.",
    appSteps: [
      "Em api.slack.com/apps, crie ou abra o app.",
      "Em OAuth & Permissions, adicione os Bot Token Scopes chat:write, chat:write.public, channels:read, groups:read e files:write.",
      "Em Redirect URLs, cole o endereço abaixo. Depois copie o Client ID e o Client Secret em Basic Information.",
    ],
    tokenSteps: ["Em OAuth & Permissions, com os escopos chat:write, chat:write.public, channels:read, groups:read e files:write, instale o app no workspace.", "Copie o Bot User OAuth Token (xoxb-…) e cole abaixo. Para canais privados, convide o app no canal (/invite)."],
  },
};
