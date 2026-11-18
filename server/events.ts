/** Eventos de webhook que o NinePro realmente envia. Compartilhado entre servidor e telas. */
export const WEBHOOK_EVENTS = [
  { id: "lead.criado", label: "Lead criado" },
  { id: "lead.atualizado", label: "Status do lead alterado" },
  { id: "campanha.status_alterado", label: "Campanha pausada ou ativada" },
  { id: "publico.criado", label: "Público criado" },
  { id: "regra.criada", label: "Regra automática criada" },
  { id: "regra.alterada", label: "Regra ligada ou desligada" },
  { id: "regra.disparou", label: "Regra automática agiu ou alertou" },
  { id: "conversao.recebida", label: "Conversão recebida (tag do site ou API)" },
  { id: "mensagem.recebida", label: "Mensagem recebida (WhatsApp ou Instagram)" },
  { id: "mensagem.enviada", label: "Mensagem enviada pela equipe ou por um agente" },
  { id: "comentario.recebido", label: "Comentário ou menção no Instagram" },
  { id: "publicacao.publicada", label: "Publicação feita (uma ou mais redes)" },
  { id: "publicacao.falhou", label: "Publicação não pôde ser feita" },
  { id: "publicacao.aguardando_aprovacao", label: "Publicação enviada para aprovação" },
  { id: "publicacao.aprovada", label: "Publicação aprovada" },
  { id: "publicacao.rejeitada", label: "Publicação rejeitada (voltou para rascunho)" },
  { id: "publicacao.reciclada", label: "Publicação reciclada (nova data agendada)" },
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["id"] | "webhook.teste";
