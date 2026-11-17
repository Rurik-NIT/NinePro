import { Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/lib/workspace";
import { CHANNEL_ACCOUNT_COLS, channelCall, type ChannelAccount } from "@/lib/channelsApi";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { InlineNotice } from "@/components/feedback/States";

export interface WaTemplate { id: string; name: string; language: string; category: string | null; status: string | null; rejected_reason: string | null; waba_id: string; components: { type: string; text?: string; format?: string; buttons?: { text: string }[] }[]; updated_at: string }
export const TEMPLATE_COLS = "id, name, language, category, status, rejected_reason, waba_id, components, updated_at";

export const bodyOf = (t: WaTemplate) => t.components.find((c) => c.type === "BODY")?.text ?? "";
export const varsOf = (text: string) => [...new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
export const TEMPLATE_STATUS: Record<string, { label: string; tone: "positive" | "info" | "negative" | "warning" | "neutral" }> = {
  APPROVED: { label: "Aprovado", tone: "positive" }, PENDING: { label: "Em análise", tone: "info" }, IN_APPEAL: { label: "Em recurso", tone: "info" },
  REJECTED: { label: "Rejeitado", tone: "negative" }, PAUSED: { label: "Pausado", tone: "warning" }, DISABLED: { label: "Desativado", tone: "neutral" }, FLAGGED: { label: "Sinalizado", tone: "warning" },
};
export const CATEGORY_LABEL: Record<string, string> = { MARKETING: "Marketing", UTILITY: "Utilidade", AUTHENTICATION: "Autenticação" };

/** Canais conectados do espaço atual (com recarga). */
export function useChannelAccounts(kind?: "whatsapp" | "instagram") {
  const { current } = useWorkspace();
  const ws = current?.id;
  const [accounts, setAccounts] = useState<ChannelAccount[] | null>(null);
  const reload = useCallback(async () => {
    if (!supabase || !ws) return;
    let q = supabase.from("channel_accounts").select(CHANNEL_ACCOUNT_COLS).eq("workspace_id", ws).not("connection_id", "is", null).order("name");
    if (kind) q = q.eq("kind", kind);
    const { data } = await q;
    setAccounts((data as ChannelAccount[] | null) ?? []);
  }, [ws, kind]);
  useEffect(() => { void reload(); }, [reload]);
  return { accounts, reload, ws, admin: current?.role === "owner" || current?.role === "admin" };
}

/** Enviar modelo do WhatsApp: inicia conversa ou fala depois das 24 horas. */
export function SendTemplateModal({ open, onOpenChange, ws, defaultTo, defaultName, defaultTemplateId, onSent }: { open: boolean; onOpenChange: (o: boolean) => void; ws: string; defaultTo?: string; defaultName?: string; defaultTemplateId?: string; onSent?: (conversationId: string) => void }) {
  const toast = useToast();
  const [templates, setTemplates] = useState<WaTemplate[] | null>(null);
  const [numbers, setNumbers] = useState<ChannelAccount[]>([]);
  const [tplId, setTplId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [to, setTo] = useState("");
  const [name, setName] = useState("");
  const [vars, setVars] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !supabase) return;
    setTo(defaultTo ?? ""); setName(defaultName ?? ""); setTplId(defaultTemplateId ?? ""); setVars([]); setError(null);
    void Promise.all([
      supabase.from("wa_templates").select(TEMPLATE_COLS).eq("workspace_id", ws).eq("status", "APPROVED").order("name"),
      supabase.from("channel_accounts").select(CHANNEL_ACCOUNT_COLS).eq("workspace_id", ws).eq("kind", "whatsapp").not("connection_id", "is", null).order("name"),
    ]).then(([t, n]) => { setTemplates((t.data as WaTemplate[] | null) ?? []); const list = (n.data as ChannelAccount[] | null) ?? []; setNumbers(list); setAccountId(list[0]?.id ?? ""); });
  }, [open, ws, defaultTo, defaultName, defaultTemplateId]);

  const tpl = templates?.find((t) => t.id === tplId);
  const body = tpl ? bodyOf(tpl) : "";
  const varList = useMemo(() => varsOf(body), [body]);
  const preview = body.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[Number(n) - 1] || `{{${n}}}`);
  const usable = numbers.filter((n) => !tpl || n.detail.waba === tpl.waba_id);
  const digits = to.replace(/\D/g, "");
  const valid = !!tpl && digits.length >= 10 && digits.length <= 15 && varList.every((n) => (vars[n - 1] ?? "").trim());

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await channelCall<{ conversationId: string }>({ action: "send_template", workspaceId: ws, templateId: tplId, to, contactName: name, bodyParams: varList.map((n) => vars[n - 1] ?? ""), accountId: usable.some((u) => u.id === accountId) ? accountId : undefined });
      toast({ tone: "success", title: "Mensagem enviada", description: `Modelo “${tpl?.name}” para +${digits}.` });
      onOpenChange(false);
      onSent?.(r.conversationId);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" icon={<Send />} title="Enviar modelo do WhatsApp" description="Use um modelo aprovado para iniciar uma conversa ou falar depois de 24 horas."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={() => void submit()}>Enviar</Button></>}>
      {templates === null ? null : templates.length === 0 ? (
        <InlineNotice tone="info">Nenhum modelo aprovado ainda. Crie um em WhatsApp › Modelos e aguarde a aprovação da Meta (costuma levar minutos).</InlineNotice>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Modelo" required className="md:col-span-2">{(p) => <Select id={p.id} value={tplId} onValueChange={(v) => { setTplId(v); setVars([]); }} placeholder="Escolha o modelo" options={templates.map((t) => ({ value: t.id, label: `${t.name} · ${t.language}` }))} />}</Field>
          <Field label="Número do cliente" required hint="Com DDI e DDD.">{(p) => <Input {...p} value={to} onChange={(e) => setTo(e.target.value)} placeholder="+55 11 91234-5678" inputMode="tel" />}</Field>
          <Field label="Nome do contato">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Opcional" />}</Field>
          {usable.length > 1 && <Field label="Enviar pelo número" className="md:col-span-2">{(p) => <Select id={p.id} value={accountId} onValueChange={setAccountId} options={usable.map((n) => ({ value: n.id, label: `${n.name}${n.display_name ? ` · ${n.display_name}` : ""}` }))} />}</Field>}
          {varList.map((n) => (
            <Field key={n} label={`Variável {{${n}}}`} required>{(p) => <Input {...p} value={vars[n - 1] ?? ""} onChange={(e) => setVars((v) => { const c = [...v]; c[n - 1] = e.target.value; return c; })} />}</Field>
          ))}
          {tpl && <div className="md:col-span-2"><span className="t-label !text-[10px]">Prévia</span><p className="mt-1 whitespace-pre-wrap rounded-md border border-line bg-surface-2 p-3 text-body">{preview}</p></div>}
          {error && <div className="md:col-span-2"><InlineNotice tone="negative">{error}</InlineNotice></div>}
        </div>
      )}
    </Modal>
  );
}
