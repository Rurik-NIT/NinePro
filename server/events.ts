/** Eventos de webhook que o NinePro realmente envia. Compartilhado entre servidor e telas. */
export const WEBHOOK_EVENTS = [
  { id: "lead.criado", label: "Lead criado" },
  { id: "lead.atualizado", label: "Status do lead alterado" },
  { id: "campanha.status_alterado", label: "Campanha pausada ou ativada" },
  { id: "publico.criado", label: "Público criado" },
  { id: "regra.criada", label: "Regra automática criada" },
  { id: "regra.alterada", label: "Regra ligada ou desligada" },
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["id"] | "webhook.teste";
