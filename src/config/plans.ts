/**
 * Planos à venda (compartilhado entre telas e servidor). PREÇOS E LIMITES SÃO EDITÁVEIS AQUI.
 * Todos os planos têm todos os recursos; muda só a quantidade de redes conectadas e de pessoas na equipe.
 * Cobrança: cada espaço de trabalho (empresa/cliente) tem a sua assinatura.
 */
export type PlanId = "teste" | "essencial" | "profissional" | "agencia";
export type PlanStatus = "teste" | "ativo" | "atrasado" | "cancelado";

export interface Plan { id: PlanId; name: string; price: number | null; tagline: string; connections: number; members: number; highlight?: boolean; features: string[] }

export const TRIAL_DAYS = 14;

export const PLANS: Plan[] = [
  { id: "teste", name: "Teste grátis", price: 0, tagline: `${TRIAL_DAYS} dias com tudo liberado, sem cartão.`, connections: 15, members: 5, features: ["Tudo do Profissional", "Sem cartão de crédito", "Ao fim, escolha um plano"] },
  { id: "essencial", name: "Essencial", price: 97, tagline: "Para quem cuida das próprias redes.", connections: 5, members: 2, features: ["5 redes conectadas", "2 pessoas na equipe", "Publicação e agendamento em 13 redes", "Caixa de entrada WhatsApp e Instagram", "Análises de todas as redes", "Agentes de IA (Claude, ChatGPT…)"] },
  { id: "profissional", name: "Profissional", price: 197, tagline: "Para empresas com anúncios e equipe.", connections: 15, members: 5, highlight: true, features: ["15 redes conectadas", "5 pessoas na equipe", "Tudo do Essencial", "Anúncios Meta, Google, TikTok e LinkedIn", "Regras automáticas e conversões (Meta e TikTok)", "Aprovação de publicações"] },
  { id: "agencia", name: "Agência", price: 497, tagline: "Para agências e times grandes.", connections: 50, members: 15, features: ["50 redes conectadas", "15 pessoas na equipe", "Tudo do Profissional", "Modo agência para agentes de IA", "Importação em massa (CSV)", "Suporte prioritário"] },
];
export const PLAN_BY_ID = Object.fromEntries(PLANS.map((p) => [p.id, p])) as Record<PlanId, Plan>;
export const PAID_PLANS = PLANS.filter((p) => p.id !== "teste");
export const STATUS_LABEL: Record<PlanStatus, string> = { teste: "Em teste", ativo: "Ativo", atrasado: "Pagamento pendente", cancelado: "Cancelado" };

export interface WorkspaceBilling { plan: PlanId; plan_status: PlanStatus; trial_ends_at: string | null; current_period_end: string | null }
/** O espaço pode usar o NinePro (publicar, conectar, enviar)? "atrasado" ainda pode (período de carência). */
export function billingActive(b: Partial<WorkspaceBilling> | null | undefined, now = Date.now()) {
  if (!b) return true; // sem informação (modo demonstração): não bloqueia
  // ativo/atrasado: vale até 7 dias depois do fim do período pago (o Stripe renova a data; plano manual precisa ser renovado pelo admin)
  if (b.plan_status === "ativo" || b.plan_status === "atrasado") return !b.current_period_end || Date.parse(b.current_period_end) + 7 * 86_400_000 > now;
  if (b.plan_status === "teste") return !b.trial_ends_at || Date.parse(b.trial_ends_at) > now;
  return false;
}
export const trialDaysLeft = (b: Partial<WorkspaceBilling> | null | undefined, now = Date.now()) =>
  b?.plan_status === "teste" && b.trial_ends_at ? Math.max(0, Math.ceil((Date.parse(b.trial_ends_at) - now) / 86_400_000)) : null;
export const limitsOf = (b: Partial<WorkspaceBilling> | null | undefined) => PLAN_BY_ID[(b?.plan as PlanId) ?? "teste"] ?? PLAN_BY_ID.teste;
export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
