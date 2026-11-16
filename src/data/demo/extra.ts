/**
 * ⚠️ DADOS FICTÍCIOS DE DEMONSTRAÇÃO — módulos de paridade (conversões, públicos, formulários,
 * desenvolvedores, telefonia, mensageria, caixa de entrada, publicações, comércio, criadores).
 * Determinísticos, sem relação com contas reais. Toda tela que os usa exibe <DemoBadge />.
 */
import { CAMPAIGNS, TODAY, type PlatformId } from "./index";

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const r = rng(4242);
const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
const int = (a: number, b: number) => Math.floor(a + r() * (b - a + 1));
const H = 3_600_000, D = 86_400_000;
const ago = (ms: number) => new Date(TODAY.getTime() + 20 * H - ms);
const FIRST = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gabriela", "Heitor", "Isabela", "João", "Karina", "Lucas", "Marina", "Nicolas", "Olívia", "Pedro", "Rafaela", "Samuel", "Tainá", "Vitor"];
const LAST = ["Almeida", "Barros", "Cardoso", "Duarte", "Esteves", "Farias", "Gomes", "Lima", "Moreira", "Nogueira", "Pacheco", "Rocha"];
const person = () => `${pick(FIRST)} ${pick(LAST)}`;

/* ---------- Conversões ---------- */
export type ConvEventType = "Compra" | "Lead" | "Cadastro" | "Início de checkout" | "Negócio ganho";
export type ConvSource = "Site (tag)" | "Loja virtual" | "Pagamentos" | "CRM" | "API";
export interface ConvEvent { id: string; type: ConvEventType; source: ConvSource; sentTo: PlatformId[]; page: string; campaign: string; value: number; receivedAt: Date; status: "Aceito" | "Parcial" | "Rejeitado" }
export const CONV_EVENTS: ConvEvent[] = Array.from({ length: 64 }, (_, i) => {
  const type = pick(["Compra", "Compra", "Lead", "Cadastro", "Início de checkout", "Negócio ganho"] as const);
  const c = pick(CAMPAIGNS);
  return {
    id: `evt-${(9000 + i).toString(36)}`, type, source: pick(["Site (tag)", "Site (tag)", "Loja virtual", "Pagamentos", "CRM", "API"] as const),
    sentTo: (r() < 0.6 ? ["meta", "google"] : [pick(["meta", "google", "tiktok"] as const)]) as PlatformId[],
    page: pick(["/checkout/obrigado", "/produto/vestido-linho", "/lp/verao", "/contato", "/carrinho"]), campaign: c.name,
    value: type === "Compra" ? int(89, 890) : type === "Negócio ganho" ? int(1500, 9000) : 0,
    receivedAt: ago(int(1, 60 * 24 * 6) * 60_000), status: (r() < 0.86 ? "Aceito" : r() < 0.5 ? "Parcial" : "Rejeitado") as ConvEvent["status"],
  };
}).sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

export const TRACKED_SITES = [
  { id: "s1", site: "lojaaurora.com.br", via: "Loja virtual", status: "Ativo" as const, visitsToday: 4821, subdomain: "t.lojaaurora.com.br", lastVisit: ago(4 * 60_000) },
  { id: "s2", site: "blog.lojaaurora.com.br", via: "Tag manual", status: "Ativo" as const, visitsToday: 612, subdomain: "—", lastVisit: ago(31 * 60_000) },
  { id: "s3", site: "outlet.lojaaurora.com.br", via: "Tag manual", status: "Sem eventos" as const, visitsToday: 0, subdomain: "—", lastVisit: ago(3 * D) },
];
export const OTHER_SOURCES = [
  { id: "stripe", name: "Pagamentos (Stripe)", kind: "Pagamentos", connected: false },
  { id: "hubspot", name: "Negócios do CRM (HubSpot)", kind: "CRM", connected: false },
  { id: "meta-forms", name: "Formulários do Meta", kind: "Formulários", connected: false },
  { id: "google-forms", name: "Formulários do Google", kind: "Formulários", connected: false },
  { id: "li-forms", name: "Formulários do LinkedIn", kind: "Formulários", connected: false },
  { id: "tt-forms", name: "Formulários do TikTok", kind: "Formulários", connected: false },
];

/* ---------- Públicos ---------- */
export const AUDIENCES = [
  { id: "a1", name: "Compradores 180 dias", type: "Lista de clientes", size: 18400, status: "Pronto", account: "Loja Aurora — BM principal", platform: "meta" as PlatformId },
  { id: "a2", name: "Semelhante 1% — compradores", type: "Semelhante", size: 2_100_000, status: "Pronto", account: "Loja Aurora — BM principal", platform: "meta" as PlatformId },
  { id: "a3", name: "Visitantes 30 dias sem compra", type: "Retargeting do site", size: 52300, status: "Pronto", account: "Aurora Search", platform: "google" as PlatformId },
  { id: "a4", name: "Carrinho abandonado 7 dias", type: "Retargeting do site", size: 3900, status: "Preenchendo", account: "Loja Aurora — BM principal", platform: "meta" as PlatformId },
  { id: "a5", name: "Interesse moda 25–44 (receita)", type: "Receita salva", size: 0, status: "Receita", account: "—", platform: "meta" as PlatformId },
  { id: "a6", name: "Decisores de varejo", type: "Segmentação salva", size: 410000, status: "Pronto", account: "Aurora B2B", platform: "linkedin" as PlatformId },
  { id: "a7", name: "Engajados TikTok 60 dias", type: "Engajamento", size: 87000, status: "Pequeno demais", account: "Aurora TikTok", platform: "tiktok" as PlatformId },
];

/* ---------- Formulários de lead ---------- */
export const LEAD_FORMS = [
  { id: "f1", name: "Lista VIP Verão", status: "Ativo", locale: "pt-BR", createdAt: ago(41 * D), leads: 1284, platform: "meta" as PlatformId },
  { id: "f2", name: "Orçamento B2B", status: "Ativo", locale: "pt-BR", createdAt: ago(88 * D), leads: 312, platform: "linkedin" as PlatformId },
  { id: "f3", name: "Inscrição webinar", status: "Arquivado", locale: "pt-BR", createdAt: ago(140 * D), leads: 907, platform: "meta" as PlatformId },
  { id: "f4", name: "Cupom primeira compra", status: "Rascunho", locale: "pt-BR", createdAt: ago(2 * D), leads: 0, platform: "meta" as PlatformId },
];

/* ---------- Desenvolvedores ---------- */
export const API_KEYS = [
  { id: "k1", name: "Chave padrão", key: "np_live_4f2a…9c1e", scope: "Todos os perfis", status: "Ativa", permission: "Leitura e escrita", createdAt: ago(0) },
  { id: "k2", name: "Integração BI", key: "np_live_81bd…03aa", scope: "Loja Aurora", status: "Ativa", permission: "Somente leitura", createdAt: ago(23 * D) },
  { id: "k3", name: "Script antigo", key: "np_live_c9e0…77f2", scope: "Todos os perfis", status: "Revogada", permission: "Leitura e escrita", createdAt: ago(190 * D) },
];
export const MEMBERS = [
  { id: "u1", name: "Gestor Demo", email: "gestor@exemplo.com", role: "Proprietário", access: "Acesso total", lastLogin: ago(30 * 60_000) },
  { id: "u2", name: "Ana Lima", email: "ana@exemplo.com", role: "Administrador", access: "Acesso total", lastLogin: ago(5 * H) },
  { id: "u3", name: "Pedro Rocha", email: "pedro@exemplo.com", role: "Membro", access: "Perfis selecionados", lastLogin: ago(3 * D) },
  { id: "u4", name: "Marina Duarte", email: "marina@exemplo.com", role: "Membro", access: "Somente anúncios", lastLogin: ago(9 * D) },
];
export const WEBHOOKS = [
  { id: "w1", name: "Leads para o CRM", endpoint: "https://crm.exemplo.com/hooks/leads", status: "Ativo", events: ["lead.criado"], health: 99.4, lastDelivery: ago(12 * 60_000) },
  { id: "w2", name: "Alertas de orçamento", endpoint: "https://hooks.slack.exemplo/T0/abc", status: "Ativo", events: ["anuncio.alerta", "regra.executada"], health: 100, lastDelivery: ago(2 * H) },
  { id: "w3", name: "Publicações (legado)", endpoint: "https://api.antigo.exemplo/posts", status: "Pausado", events: ["post.publicado", "post.falhou"], health: 71.2, lastDelivery: ago(6 * D) },
];
export const WEBHOOK_EVENTS = ["post.publicado", "post.falhou", "mensagem.recebida", "comentario.recebido", "lead.criado", "anuncio.alerta", "regra.executada", "conta.desconectada"];
const ACTIVITIES = ["GET /v1/anuncios/arvore", "GET /v1/anuncios/metricas", "POST /v1/posts", "GET /v1/contas", "POST /v1/eventos", "GET /v1/leads", "PATCH /v1/campanhas/{id}", "GET /v1/perfis"];
export const LOGS = Array.from({ length: 80 }, (_, i) => {
  const act = pick(ACTIVITIES);
  const status = r() < 0.9 ? (act.startsWith("POST") ? 201 : 200) : pick([400, 401, 404, 429, 500, 503]);
  return { id: `log-${i}`, at: ago(int(1, 60 * 24 * 7) * 60_000), status, activity: act, platform: pick(["Meta Ads", "Google Ads", "Instagram", "LinkedIn", "—"]), profile: pick(["Loja Aurora", "Aurora Outlet", "—"]), durationMs: int(40, status >= 500 ? 23000 : 1800) };
}).sort((a, b) => b.at.getTime() - a.at.getTime());

/* ---------- Telefonia ---------- */
export const PHONE_NUMBERS = [
  { id: "n1", number: "+55 11 4003-9090", country: "Brasil", type: "Teste (sandbox)", channels: ["WhatsApp"], status: "Ativo", price: 0 },
  { id: "n2", number: "+55 11 3090-1122", country: "Brasil", type: "Próprio", channels: ["Voz", "SMS"], status: "Ativo", price: 29.9 },
  { id: "n3", number: "+1 415 555 0142", country: "Estados Unidos", type: "Comprado", channels: ["Voz", "SMS", "WhatsApp"], status: "Verificando", price: 6.5 },
];
export const CALLS = Array.from({ length: 24 }, (_, i) => {
  const status = pick(["Concluída", "Concluída", "Concluída", "Sem resposta", "Ocupado", "Falhou"] as const);
  const dur = status === "Concluída" ? int(20, 1200) : 0;
  return { id: `call_${(5000 + i).toString(36)}`, startedAt: ago(int(1, 60 * 24 * 10) * 60_000), contact: person(), direction: pick(["Recebida", "Feita"] as const), status, durationS: dur, cost: dur ? +(dur / 60 * 0.12).toFixed(2) : 0 };
}).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
export const SIP_TRUNKS = [{ id: "t1", name: "PABX matriz", host: "sip.matriz.exemplo.com", transport: "TLS", numbers: 1, createdAt: ago(60 * D) }];
export const BRANDS_10DLC = [{ id: "b1", brand: "Loja Aurora Ltda.", status: "Aprovada", trust: 78, throughput: "75 msg/s", monthly: 4, numbers: 1 }];
export const SENDER_IDS = [{ id: "sid1", name: "AURORA", addedAt: ago(20 * D) }];
export const RCS_AGENTS: { id: string; agent: string; country: string; status: string; company: string; price: string }[] = [];
export const CALLER_IDS = [{ id: "ci1", identity: "Loja Aurora", status: "Em verificação", numbers: 1, reasons: ["Confirmação de pedido", "Atendimento"] }];

/* ---------- WhatsApp / iMessage ---------- */
export const WA_SENDERS = [
  { id: "wa1", name: "Sandbox", number: "+55 11 4003-9090", type: "Número de teste compartilhado", calling: false, status: "Teste", accountId: "—" },
];
export const IM_SANDBOX = { code: "AURORA-7Q2", line: "+1 631 361 0274", accountId: "…4c527f", contacts: 2, max: 5 };
export const IM_AUDIENCE = [
  { id: "c1", contact: "+55 11 9****-1022", sender: "Sandbox", status: "Inscrito", source: "Link de opt-in", lastMessage: ago(3 * H) },
  { id: "c2", contact: "ana@exemplo.com", sender: "Sandbox", status: "Inscrito", source: "Código de entrada", lastMessage: ago(2 * D) },
];

/* ---------- Caixa de entrada ---------- */
export const CHANNELS = ["Instagram", "Facebook", "WhatsApp", "LinkedIn", "TikTok", "Google"] as const;
export type Channel = (typeof CHANNELS)[number];
const SNIPPETS = ["Vocês entregam em Curitiba?", "Qual o prazo de troca?", "Ainda tem o vestido no tamanho M?", "Recebi o pedido, amei!", "Consigo parcelar em quantas vezes?", "O cupom não funcionou no checkout", "Vocês têm loja física?", "Pode me mandar o link do produto?"];
export interface Conversation { id: string; contact: string; channel: Channel; account: string; snippet: string; at: Date; unread: number; status: "Aberta" | "Resolvida"; assignedTo?: string; messages: { from: "contato" | "equipe"; text: string; at: Date }[] }
export const CONVERSATIONS: Conversation[] = Array.from({ length: 22 }, (_, i) => {
  const at = ago(int(2, 60 * 24 * 5) * 60_000);
  const snip = pick(SNIPPETS);
  return {
    id: `cv-${i}`, contact: person(), channel: pick(["Instagram", "Instagram", "WhatsApp", "WhatsApp", "Facebook", "LinkedIn"] as const), account: "@lojaaurora", snippet: snip, at,
    unread: r() < 0.4 ? int(1, 3) : 0, status: (r() < 0.75 ? "Aberta" : "Resolvida") as Conversation["status"], assignedTo: r() < 0.5 ? pick(["Ana Lima", "Pedro Rocha"]) : undefined,
    messages: [
      { from: "contato" as const, text: snip, at: new Date(at.getTime() - 9 * 60_000) },
      { from: "equipe" as const, text: "Oi! Já vou verificar para você.", at: new Date(at.getTime() - 6 * 60_000) },
      { from: "contato" as const, text: "Obrigada!", at },
    ],
  };
}).sort((a, b) => b.at.getTime() - a.at.getTime());
export const COMMENT_POSTS = Array.from({ length: 9 }, (_, i) => ({ id: `cp-${i}`, channel: pick(["Instagram", "Facebook", "TikTok", "LinkedIn"] as const), caption: pick(["Coleção Verão chegou ☀️", "Bastidores do ensaio", "Frete grátis só hoje", "Qual a sua cor favorita?", "Novidade na loja"]), comments: int(3, 140), unanswered: int(0, 12), at: ago(int(1, 20) * D) }));
export const REVIEWS = Array.from({ length: 10 }, (_, i) => ({ id: `rv-${i}`, author: person(), channel: pick(["Google", "Facebook"] as const), rating: pick([5, 5, 5, 4, 4, 3, 2, 1]), text: pick(["Atendimento excelente e entrega rápida.", "Produto bonito, mas demorou para chegar.", "Amei a qualidade!", "Tive problema com a troca.", "Recomendo, voltarei a comprar."]), replied: r() < 0.5, at: ago(int(1, 40) * D) }));
export const MENTIONS = Array.from({ length: 8 }, (_, i) => ({ id: `mn-${i}`, author: `@${pick(FIRST).toLowerCase()}${int(10, 99)}`, channel: pick(["Instagram", "LinkedIn"] as const), kind: pick(["Menção", "Marcação"] as const), text: pick(["Olha o look que comprei na @lojaaurora", "Parceria incrível com @lojaaurora", "Recebidos da semana @lojaaurora"]), at: ago(int(1, 14) * D) }));
export const INBOX_WORKFLOWS = [
  { id: "wf1", name: "Comentário → DM com cupom", platform: "Instagram", account: "@lojaaurora", nodes: 4, runs: 1284, status: "Ativo", createdAt: ago(40 * D) },
  { id: "wf2", name: "Boas-vindas no WhatsApp", platform: "WhatsApp", account: "Sandbox", nodes: 3, runs: 92, status: "Pausado", createdAt: ago(12 * D) },
];
export const CONTACTS = Array.from({ length: 18 }, (_, i) => ({ id: `ct-${i}`, name: person(), channels: [pick(["Instagram", "WhatsApp", "Facebook"] as const)], tags: r() < 0.5 ? ["cliente"] : r() < 0.5 ? ["lead"] : [], lastSeen: ago(int(1, 30) * D), conversations: int(1, 9) }));

/* ---------- Publicações ---------- */
export type PostStatus = "Agendada" | "Publicada" | "Rascunho" | "Falhou" | "Aguardando aprovação";
export interface Post { id: string; text: string; channels: Channel[]; status: PostStatus; at: Date; profile: string; metrics?: { likes: number; comments: number; reach: number } }
export const POSTS: Post[] = Array.from({ length: 26 }, (_, i) => {
  const status = pick(["Agendada", "Agendada", "Publicada", "Publicada", "Publicada", "Rascunho", "Falhou", "Aguardando aprovação"] as const);
  const future = status === "Agendada" || status === "Aguardando aprovação";
  return {
    id: `post-${i}`, text: pick(["Coleção Verão chegou ☀️ Peças leves para dias quentes.", "Frete grátis em todo o site até domingo!", "Bastidores do nosso ensaio de verão.", "3 jeitos de usar a camisa de linho.", "Últimas unidades do vestido midi.", "Nova loja em Curitiba — inauguração sábado."]),
    channels: r() < 0.5 ? ["Instagram", "Facebook"] : [pick(["Instagram", "LinkedIn", "TikTok"] as const)], status,
    at: future ? new Date(TODAY.getTime() + int(1, 14) * D + int(8, 20) * H) : ago(int(1, 30) * D), profile: pick(["Loja Aurora", "Aurora Outlet"]),
    metrics: status === "Publicada" ? { likes: int(40, 2400), comments: int(2, 180), reach: int(1200, 64000) } : undefined,
  };
});
export const QUEUES = [{ id: "q1", profile: "Loja Aurora", name: "Padrão", slots: ["Seg 09:00", "Qua 12:00", "Sex 18:00"], next: new Date(TODAY.getTime() + 2 * D + 9 * H), status: "Ativa" }];

/* ---------- Comércio / Criadores ---------- */
export const PRODUCTS = Array.from({ length: 14 }, (_, i) => ({ id: `p-${i}`, name: pick(["Vestido midi linho", "Camisa de linho", "Saia plissada", "Calça pantalona", "Blusa canelada", "Bolsa de palha", "Sandália rasteira"]) + ` ${i + 1}`, sku: `AUR-${1000 + i}`, price: int(89, 459), stock: int(0, 120), status: r() < 0.85 ? "Ativo" : "Rascunho", collection: pick(["Verão", "Essenciais", "Outlet"]) }));
export const COLLECTIONS = [{ id: "c1", name: "Verão", products: 6, kind: "Manual" }, { id: "c2", name: "Essenciais", products: 5, kind: "Automática" }, { id: "c3", name: "Outlet", products: 3, kind: "Automática" }];
export const DISCOUNTS = [{ id: "d1", code: "VERAO10", kind: "10% no pedido", uses: 412, status: "Ativo", endsAt: new Date(TODAY.getTime() + 12 * D) }, { id: "d2", code: "FRETEGRATIS", kind: "Frete grátis", uses: 1290, status: "Ativo", endsAt: new Date(TODAY.getTime() + 2 * D) }, { id: "d3", code: "BEMVINDA", kind: "R$ 30 na primeira compra", uses: 88, status: "Expirado", endsAt: ago(5 * D) }];
export const CREATOR_CAMPAIGNS = [
  { id: "cc1", name: "Unboxing Verão", status: "Ativa", terms: "R$ 40 por mil views", budgetUsed: 0.62, budget: 8000, creators: 14, waiting: 3 },
  { id: "cc2", name: "Looks de inverno", status: "Encerrada", terms: "R$ 300 por post aprovado", budgetUsed: 1, budget: 6000, creators: 20, waiting: 0 },
];

/* ---------- Faturamento / uso ---------- */
export const USAGE = [
  { product: "Contas sociais conectadas", used: "2 contas", paidFrom: "Plano", amount: 0 },
  { product: "Mensagens WhatsApp", used: "1.240 mensagens", paidFrom: "Saldo", amount: 74.4 },
  { product: "Chamadas de voz", used: "312 min", paidFrom: "Saldo", amount: 37.44 },
  { product: "SMS", used: "860 mensagens", paidFrom: "Saldo", amount: 51.6 },
  { product: "Números de telefone", used: "2 números", paidFrom: "Saldo", amount: 36.4 },
];
