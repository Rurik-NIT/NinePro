/** Permissões que um agente de IA pode receber pelo OAuth (espelho de server/oauth.ts → SCOPES). */
export const AGENT_SCOPES: { id: string; titulo: string; descricao: string; sensivel?: boolean }[] = [
  { id: "leitura", titulo: "Ler dados", descricao: "Campanhas, métricas, leads, contas conectadas, publicações, conversas e comentários" },
  { id: "publicacoes", titulo: "Publicar e agendar", descricao: "Criar, agendar e publicar posts, reels, carrosséis e stories" },
  { id: "mensagens", titulo: "Enviar mensagens", descricao: "Responder conversas e comentários e enviar modelos do WhatsApp" },
  { id: "automacoes", titulo: "Gerenciar automações", descricao: "Criar, ligar e pausar automações de comentário → DM e respostas automáticas" },
  { id: "anuncios", titulo: "Gerenciar anúncios", descricao: "Pausar e ativar campanhas, criar públicos e regras automáticas. Pode alterar seu investimento", sensivel: true },
  { id: "crm", titulo: "Leads e conversões", descricao: "Registrar leads, mudar o status e enviar conversões" },
];
export const scopeTitle = (id: string) => (id === "todos_espacos" ? "Todos os espaços" : AGENT_SCOPES.find((s) => s.id === id)?.titulo ?? id);
