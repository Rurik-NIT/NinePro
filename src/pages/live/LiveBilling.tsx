/** Faturamento e uso reais: plano do espaço, teste grátis, limites e assinatura (Stripe ou contato com vendas). */
import { Check, CreditCard, ExternalLink, Mail, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { appCall } from "@/lib/channelsApi";
import { useWorkspace } from "@/lib/workspace";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { brl, PAID_PLANS, PLAN_BY_ID, STATUS_LABEL, type PlanId, type PlanStatus } from "@/config/plans";
import { LEGAL } from "@/config/legal";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { InlineNotice, LoadingState } from "@/components/feedback/States";

export interface BillingInfo {
  disponivel: boolean; plano: PlanId; nome_plano: string; status: PlanStatus; ativo: boolean; dias_de_teste: number | null; teste_ate: string | null; renova_em: string | null; tem_assinatura: boolean;
  uso: { conexoes: number; limite_conexoes: number; membros: number; limite_membros: number; publicacoes_no_mes: number }; stripe: boolean; contato_vendas: string | null;
}

export function useBilling() {
  const { current } = useWorkspace();
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const load = useCallback(async () => { if (current?.id) setInfo(await appCall<BillingInfo>({ action: "billing_status", workspaceId: current.id }).catch(() => null)); }, [current?.id]);
  useEffect(() => { void load(); }, [load]);
  return { info, load, ws: current?.id, admin: current?.role === "owner" || current?.role === "admin" };
}

function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = Math.min(100, (used / Math.max(1, max)) * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between"><span className="text-secondary font-semibold">{label}</span><span className="num t-secondary">{used} de {max}</span></div>
      <span className="h-2 overflow-hidden rounded-full bg-bar-idle"><span className={cn("block h-full rounded-full", pct >= 100 ? "bg-negative" : pct >= 80 ? "bg-warning" : "bg-accent")} style={{ width: `${pct}%` }} /></span>
    </div>
  );
}

export function LiveBilling() {
  const toast = useToast();
  const [params] = useSearchParams();
  const { info, load, ws, admin } = useBilling();
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (params.get("assinatura") === "ok") { toast({ tone: "success", title: "Assinatura confirmada", description: "Obrigado! O plano é atualizado em instantes." }); const t = setTimeout(() => void load(), 4000); return () => clearTimeout(t); } }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!info) return <Page><PageHeader title="Faturamento" /><LoadingState /></Page>;
  const contact = info.contato_vendas || (!/^\[/.test(LEGAL.emailContato) ? LEGAL.emailContato : null);
  const go = async (action: "billing_checkout" | "billing_portal", plan?: string) => {
    setBusy(plan ?? action);
    try { const r = await appCall<{ url: string }>({ action, workspaceId: ws, plan }); window.location.href = r.url; }
    catch (e) { toast({ tone: "error", title: "Não foi possível abrir o pagamento", description: e instanceof Error ? e.message : String(e) }); setBusy(null); }
  };
  const mailto = (plan: string) => contact ? `mailto:${contact}?subject=${encodeURIComponent(`Quero assinar o plano ${plan} do NinePro`)}` : undefined;
  return (
    <Page>
      <PageHeader title="Faturamento" description="Plano, limites e assinatura deste espaço de trabalho. Cada empresa ou cliente tem a sua." />
      {!info.disponivel && <InlineNotice tone="info">A cobrança ainda está sendo ativada neste ambiente. Enquanto isso, nada fica bloqueado.</InlineNotice>}
      {info.disponivel && !info.ativo && <InlineNotice tone="negative">{info.status === "cancelado" ? "A assinatura foi cancelada." : "O teste grátis terminou."} Os dados continuam aqui, mas publicar, enviar mensagens e conectar contas estão pausados até você escolher um plano.</InlineNotice>}
      <section className="panel grid gap-5 p-5 md:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-2">
          <span className="t-label">Plano atual</span>
          <div className="flex flex-wrap items-center gap-2"><span className="text-[22px] font-extrabold">{info.nome_plano}</span><StatusBadge tone={!info.ativo ? "negative" : info.status === "atrasado" ? "warning" : info.status === "teste" ? "info" : "positive"}>{STATUS_LABEL[info.status]}</StatusBadge></div>
          <span className="t-secondary">
            {info.status === "teste" && info.dias_de_teste != null ? (info.dias_de_teste > 0 ? `Faltam ${info.dias_de_teste} dia(s) de teste (até ${formatDateTime(new Date(info.teste_ate!))}).` : "O teste terminou.") : info.renova_em ? `Período pago até ${formatDateTime(new Date(info.renova_em))}.` : PLAN_BY_ID[info.plano]?.price ? `${brl(PLAN_BY_ID[info.plano].price!)} por mês.` : ""}
          </span>
          {info.status === "atrasado" && <span className="text-[13px] text-warning">Não conseguimos cobrar o último pagamento. Atualize o cartão para não perder o acesso.</span>}
          {info.tem_assinatura && admin && <Button className="mt-2 self-start" icon={<CreditCard />} loading={busy === "billing_portal"} onClick={() => void go("billing_portal")}>Gerenciar assinatura e cartão</Button>}
        </div>
        <div className="flex flex-col gap-4">
          <Meter label="Redes conectadas" used={info.uso.conexoes} max={info.uso.limite_conexoes} />
          <Meter label="Pessoas na equipe" used={info.uso.membros} max={info.uso.limite_membros} />
          <span className="t-caption">{info.uso.publicacoes_no_mes} publicação(ões) criadas neste mês · publicações sem limite em todos os planos.</span>
        </div>
      </section>
      <div className="grid grid-cols-1 gap-gutter md:grid-cols-3">
        {PAID_PLANS.map((p) => {
          const currentPlan = info.plano === p.id && info.status !== "teste" && info.ativo;
          return (
            <div key={p.id} className={cn("panel flex flex-col gap-3 p-5", p.highlight && "border-accent-line-strong")}>
              <div className="flex items-center justify-between"><span className="t-title">{p.name}</span>{p.highlight && <Tag tone="info"><Sparkles className="size-3" />Mais escolhido</Tag>}</div>
              <span className="t-secondary">{p.tagline}</span>
              <span className="flex items-baseline gap-1"><span className="text-[28px] font-extrabold">{brl(p.price!)}</span><span className="t-caption">/mês por espaço</span></span>
              <ul className="flex flex-1 flex-col gap-1.5">{p.features.map((f) => <li key={f} className="flex items-start gap-2 text-[13px]"><Check className="mt-0.5 size-3.5 shrink-0 text-positive" />{f}</li>)}</ul>
              {currentPlan ? <Tag tone="positive">Seu plano</Tag>
                : !admin ? <span className="t-caption">Peça ao dono ou a um admin do espaço para assinar.</span>
                : info.stripe ? <Button variant={p.highlight ? "primary" : "outline"} loading={busy === p.id} onClick={() => void (info.tem_assinatura ? go("billing_portal") : go("billing_checkout", p.id))}>{info.tem_assinatura ? "Trocar para este plano" : "Assinar"}</Button>
                : contact ? <a href={mailto(p.name)} className={buttonClasses(p.highlight ? "primary" : "outline")}><Mail className="size-4" />Falar com vendas</a>
                : <span className="t-caption">Assinatura on-line em breve. Fale com quem te apresentou o NinePro.</span>}
            </div>
          );
        })}
      </div>
      <p className="t-caption">Pagamento mensal por cartão (Stripe), cancele quando quiser{info.stripe ? "" : " — ou por Pix/boleto com o time de vendas"}. Dúvidas: {contact ?? "fale com o suporte"}. <a href="/termos" target="_blank" className="inline-flex items-center gap-1 underline">Termos de uso<ExternalLink className="size-3" /></a></p>
    </Page>
  );
}

/** Faixa no topo: teste acabando, teste encerrado, pagamento pendente ou assinatura cancelada. */
export function BillingBanner() {
  const { info } = useBilling();
  if (!info?.disponivel) return null;
  const late = info.status === "atrasado";
  const ending = info.status === "teste" && info.dias_de_teste != null && info.dias_de_teste <= 5 && info.ativo;
  if (info.ativo && !late && !ending) return null;
  const text = !info.ativo ? (info.status === "cancelado" ? "Assinatura cancelada: publicar, enviar e conectar estão pausados." : "Seu teste grátis terminou: publicar, enviar e conectar estão pausados.")
    : late ? "Não conseguimos cobrar o último pagamento. Atualize o cartão para não perder o acesso."
    : `Seu teste grátis termina em ${info.dias_de_teste} dia(s).`;
  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-b px-4 py-2 text-[13px]", !info.ativo ? "border-negative/30 bg-negative-tint" : "border-warning/30 bg-warning-tint")}>
      <span className="flex-1 font-semibold">{text}</span>
      <a href="/faturamento" className={buttonClasses(!info.ativo ? "primary" : "outline", "sm")}>Ver planos</a>
    </div>
  );
}
