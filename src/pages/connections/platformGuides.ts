/** Textos de ajuda de cada plataforma no modal de conexão (o que fazer em cada site). */
export type PlatformKey = "meta" | "google" | "tiktok" | "linkedin" | "whatsapp" | "instagram";

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
};
