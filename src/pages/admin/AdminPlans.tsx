/** Super admin: clientes (espaços de trabalho) com plano, status e validade; liberação manual (Pix, boleto, contrato). */
import { Building2, CreditCard } from "lucide-react";
import { useEffect, useState } from "react";
import { adminCall, type AdminWorkspace } from "@/lib/adminApi";
import { formatDateTime } from "@/lib/format";
import { billingActive, PLAN_BY_ID, PLANS, STATUS_LABEL, type PlanId, type PlanStatus } from "@/config/plans";
import { StatusBadge, Tag } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { DataTable } from "@/components/data/DataTable";
import { EmptyState, InlineNotice } from "@/components/feedback/States";

const day = (iso?: string | null) => (iso ? formatDateTime(new Date(iso)).split(",")[0] : "—");
const toInput = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

export function AdminPlans({ workspaces, onChanged }: { workspaces: AdminWorkspace[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<AdminWorkspace | null>(null);
  const billing = (w: AdminWorkspace) => ({ plan: (w.plan ?? "teste") as PlanId, plan_status: (w.planStatus ?? "teste") as PlanStatus, trial_ends_at: w.trialEndsAt ?? null, current_period_end: w.periodEnd ?? null });
  const hasBilling = workspaces.some((w) => w.plan);
  return (
    <section className="panel overflow-hidden">
      {!hasBilling && <div className="p-4"><InlineNotice tone="warning">A migração de planos (20261119000018) ainda não foi aplicada no banco. Os planos aparecem depois dela.</InlineNotice></div>}
      <DataTable caption="Clientes e planos" rows={workspaces} getId={(w) => w.id} defaultSort={{ id: "n", dir: "asc" }}
        columns={[
          { id: "n", header: "Cliente (espaço)", sticky: true, sortValue: (w) => w.name.toLowerCase(), cell: (w) => <span className="flex flex-col"><span className="font-semibold">{w.name}</span><span className="t-caption">{w.members} pessoa(s){w.note ? ` · ${w.note}` : ""}</span></span> },
          { id: "p", header: "Plano", sortValue: (w) => w.plan ?? "", cell: (w) => <Tag>{PLAN_BY_ID[(w.plan ?? "teste") as PlanId]?.name ?? w.plan ?? "—"}</Tag> },
          { id: "s", header: "Status", cell: (w) => { const b = billing(w); const ok = billingActive(b); return <StatusBadge tone={!ok ? "negative" : b.plan_status === "atrasado" ? "warning" : b.plan_status === "teste" ? "info" : "positive"}>{!ok && b.plan_status === "teste" ? "Teste encerrado" : STATUS_LABEL[b.plan_status] ?? b.plan_status}</StatusBadge>; } },
          { id: "v", header: "Válido até", align: "right", sortValue: (w) => Date.parse((w.planStatus === "teste" ? w.trialEndsAt : w.periodEnd) ?? "") || 0, cell: (w) => <span className="num text-text-soft">{day(w.planStatus === "teste" ? w.trialEndsAt : w.periodEnd)}</span> },
          { id: "c", header: "Cobrança", cell: (w) => w.stripe ? <Tag tone="info"><CreditCard className="size-3" />Cartão (Stripe)</Tag> : <span className="t-caption">Manual</span> },
          { id: "a", header: "", align: "right", cell: (w) => <Button size="sm" disabled={!hasBilling} onClick={() => setEditing(w)}>Alterar plano</Button> },
        ]}
        empty={<EmptyState compact icon={<Building2 />} title="Nenhum cliente ainda" description="Cada conta criada ganha um espaço de trabalho com teste grátis." />} />
      <PlanModal ws={editing} onOpenChange={(o) => !o && setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />
    </section>
  );
}

function PlanModal({ ws, onOpenChange, onSaved }: { ws: AdminWorkspace | null; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const toast = useToast();
  const [plan, setPlan] = useState<PlanId>("essencial");
  const [status, setStatus] = useState<PlanStatus>("ativo");
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!ws) return;
    setPlan((ws.plan ?? "teste") as PlanId); setStatus((ws.planStatus ?? "teste") as PlanStatus); setNote(ws.note ?? "");
    setUntil(toInput(ws.planStatus === "teste" ? ws.trialEndsAt : ws.periodEnd) || toInput(new Date(Date.now() + 31 * 86_400_000).toISOString()));
  }, [ws]);
  const save = async () => {
    if (!ws) return;
    setBusy(true);
    try { await adminCall("set_plan", { workspaceId: ws.id, plan, status, until: until ? new Date(`${until}T23:59:00`).toISOString() : null, note }); toast({ tone: "success", title: "Plano atualizado", description: ws.name }); onSaved(); }
    catch (e) { toast({ tone: "error", title: "Não foi possível alterar", description: e instanceof Error ? e.message : String(e) }); }
    setBusy(false);
  };
  return (
    <Modal open={!!ws} onOpenChange={onOpenChange} icon={<CreditCard />} title={`Plano de ${ws?.name ?? ""}`} description="Para vendas por Pix, boleto ou contrato. Assinaturas pelo cartão são atualizadas sozinhas pelo Stripe."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Salvar</Button></>}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Plano">{(p) => <Select id={p.id} value={plan} onValueChange={(v) => setPlan(v as PlanId)} options={PLANS.map((x) => ({ value: x.id, label: `${x.name}${x.price ? ` · R$ ${x.price}` : ""}` }))} />}</Field>
        <Field label="Status">{(p) => <Select id={p.id} value={status} onValueChange={(v) => setStatus(v as PlanStatus)} options={(["teste", "ativo", "atrasado", "cancelado"] as PlanStatus[]).map((x) => ({ value: x, label: STATUS_LABEL[x] }))} />}</Field>
        <Field label={status === "teste" ? "Teste até" : "Pago até"} hint={status === "teste" ? "Depois desta data o espaço pausa publicar e enviar." : "Até 7 dias depois desta data o acesso continua; depois, pausa até renovar."}>{(p) => <Input {...p} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />}</Field>
        <div className="md:col-span-2"><Field label="Observação" hint="Ex.: Pix recebido em 19/11, contrato anual.">{(p) => <Textarea id={p.id} rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}</Field></div>
      </div>
    </Modal>
  );
}
