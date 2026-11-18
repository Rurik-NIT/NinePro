/** Partes extras do compositor: opções por rede, horário por rede, reciclagem, aprovação e importação por CSV. */
import { ChevronDown, Download, FileUp, Plus, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/format";
import { channelCall } from "@/lib/channelsApi";
import { Tag } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Controls";
import { Modal } from "@/components/ui/Dialog";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { InlineNotice } from "@/components/feedback/States";
import { NETWORK, type ChannelKind } from "@/config/networks";
import { optionVisible, POST_OPTIONS, type NetOptions, type OptField, type OptKind, type PostOptions } from "@/config/postOptions";

const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/* ------------------------------------------------------------------ opções por rede */
function ListField({ f, value, onChange }: { f: OptField; value: string[]; onChange: (v: string[]) => void }) {
  const long = (f.max ?? 0) > 100;
  const items = value.length ? value : [""];
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((v, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1">{long ? <Textarea value={v} rows={2} maxLength={f.max} aria-label={`${f.label} ${i + 1}`} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            : <Input value={v} maxLength={f.max} aria-label={`${f.label} ${i + 1}`} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />}</div>
          {items.length > 1 && <IconButton size="sm" label="Remover" onClick={() => onChange(items.filter((_, j) => j !== i))}><X /></IconButton>}
        </div>
      ))}
      {items.length < (f.maxItems ?? 20) && <Button size="sm" variant="ghost" icon={<Plus />} className="self-start" onClick={() => onChange([...items, ""])}>Adicionar</Button>}
    </div>
  );
}

function OptionInput({ f, o, set }: { f: OptField; o: NetOptions; set: (k: string, v: NetOptions[string] | undefined) => void }) {
  const v = o[f.key];
  if (f.type === "bool") return <Checkbox checked={v === true} onCheckedChange={(c) => set(f.key, c ? true : undefined)} label={f.label} description={f.hint} />;
  return (
    <Field label={f.label} hint={f.hint}>{(p) => {
      if (f.type === "select") return <Select id={p.id} value={typeof v === "string" ? v : f.options![0].value} onValueChange={(x) => set(f.key, x === f.options![0].value ? undefined : x)} options={f.options!} />;
      if (f.type === "list") return <ListField f={f} value={Array.isArray(v) ? v : []} onChange={(x) => set(f.key, x.length ? x : undefined)} />;
      if (f.type === "textarea") return <Textarea id={p.id} rows={2} maxLength={f.max} value={typeof v === "string" ? v : ""} onChange={(e) => set(f.key, e.target.value || undefined)} />;
      if (f.type === "number") return <Input {...p} type="number" min={f.min} max={f.max} value={typeof v === "number" ? String(v) : ""} onChange={(e) => set(f.key, e.target.value === "" ? undefined : Number(e.target.value))} className="max-w-[200px]" />;
      if (f.type === "datetime") return <Input {...p} type="datetime-local" value={typeof v === "string" && v ? localInput(new Date(v)) : ""} onChange={(e) => set(f.key, e.target.value ? new Date(e.target.value).toISOString() : undefined)} className="max-w-[260px]" />;
      return <Input {...p} type={f.type === "url" ? "url" : "text"} maxLength={f.max} placeholder={f.type === "url" ? "https://" : undefined} value={typeof v === "string" ? v : ""} onChange={(e) => set(f.key, e.target.value || undefined)} />;
    }}</Field>
  );
}

/** Painel "Opções do X" para cada rede escolhida. O formato do Instagram fica no seletor próprio do compositor. */
export function NetworkOptions({ kinds, value, onChange, pinterestBoards }: { kinds: ChannelKind[]; value: PostOptions; onChange: (v: PostOptions) => void; pinterestBoards?: { id: string; nome: string }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const list = kinds.filter((k): k is OptKind => k in POST_OPTIONS);
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-secondary font-semibold text-text-soft">Opções por rede</span>
      <div className="flex flex-col divide-y divide-line rounded-md border border-line">
        {list.map((k) => {
          const o = value[k] ?? {};
          const n = Object.keys(o).length;
          const set = (key: string, v: NetOptions[string] | undefined) => { const next = { ...o }; if (v === undefined) delete next[key]; else next[key] = v; onChange({ ...value, [k]: next }); };
          const fields = POST_OPTIONS[k].filter((f) => !(k === "instagram" && f.key === "formato")).filter((f) => optionVisible(f, o));
          return (
            <div key={k}>
              <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
                <span className="inline-flex items-center gap-1.5 [&_svg]:size-3.5">{NETWORK[k].icon}{NETWORK[k].label}</span>
                {n > 0 && <Tag tone="info">{n} {n === 1 ? "opção" : "opções"}</Tag>}
                <span className="flex-1" />
                <span className="t-caption">{POST_OPTIONS[k].filter((f) => !(k === "instagram" && f.key === "formato")).slice(0, 3).map((f) => f.label.toLowerCase()).join(", ")}…</span>
                <ChevronDown className={`size-4 transition-transform ${open === k ? "rotate-180" : ""}`} />
              </button>
              {open === k && (
                <div className="grid gap-3 px-3 pb-3 pt-1 md:grid-cols-2">
                  {fields.map((f) => (
                    <div key={f.key} className={f.type === "textarea" || f.type === "list" || f.type === "bool" ? "md:col-span-2" : ""}>
                      {k === "pinterest" && f.key === "pasta" && pinterestBoards?.length
                        ? <Field label="Pasta" hint="Vazio = a primeira pasta da conta.">{(p) => <Select id={p.id} value={typeof o.pasta === "string" ? o.pasta : "padrao"} onValueChange={(x) => set("pasta", x === "padrao" ? undefined : x)} options={[{ value: "padrao", label: "Primeira pasta" }, ...pinterestBoards.map((b) => ({ value: b.id, label: b.nome }))]} />}</Field>
                        : <OptionInput f={f} o={o} set={set} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Tira itens vazios das listas antes de enviar. */
export function tidyOptions(v: PostOptions, kinds: string[]): PostOptions {
  const out: PostOptions = {};
  for (const [k, o] of Object.entries(v)) {
    if (!kinds.includes(k) || !o) continue;
    const c: NetOptions = {};
    for (const [key, val] of Object.entries(o)) { const x = Array.isArray(val) ? val.map((s) => s.trim()).filter(Boolean) : val; if (Array.isArray(x) ? x.length : x !== "" && x !== undefined) c[key] = x; }
    if (Object.keys(c).length) out[k as OptKind] = c;
  }
  return out;
}

/* ------------------------------------------------------------------ horário por rede */
export function PerNetworkTimes({ kinds, base, value, onChange }: { kinds: ChannelKind[]; base: string; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {kinds.map((k) => (
        <Field key={k} label={NETWORK[k].label} hint={value[k] ? undefined : "vazio = horário principal"}>{(p) => <Input {...p} type="datetime-local" value={value[k] ?? ""} placeholder={base} min={localInput(new Date(Date.now() + 120_000))} onChange={(e) => { const n = { ...value }; if (e.target.value) n[k] = e.target.value; else delete n[k]; onChange(n); }} />}</Field>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ reciclagem */
export interface RecyclingDraft { on: boolean; dias: string; vezes: string; variacoes: string[] }
export const emptyRecycling: RecyclingDraft = { on: false, dias: "30", vezes: "", variacoes: [] };
export function RecyclingFields({ value, onChange, kinds }: { value: RecyclingDraft; onChange: (v: RecyclingDraft) => void; kinds: ChannelKind[] }) {
  const skipped = kinds.filter((k) => k === "youtube" || k === "tiktok_social");
  return (
    <div className="flex flex-col gap-2">
      <Checkbox checked={value.on} onCheckedChange={(on) => onChange({ ...value, on })} label="Reciclar esta publicação" description="Depois de publicada, ela é agendada de novo a cada N dias (conteúdo perene)." />
      {value.on && (
        <div className="grid gap-3 rounded-md border border-line p-3 md:grid-cols-2">
          <Field label="A cada (dias)">{(p) => <Input {...p} type="number" min={1} max={365} value={value.dias} onChange={(e) => onChange({ ...value, dias: e.target.value })} />}</Field>
          <Field label="Quantas vezes" hint="Vazio = sem limite">{(p) => <Input {...p} type="number" min={1} max={100} value={value.vezes} onChange={(e) => onChange({ ...value, vezes: e.target.value })} />}</Field>
          <div className="md:col-span-2">
            <Field label="Textos alternativos" hint="Opcional. A cada vez, usa o próximo texto (evita repetir igual).">{() => <ListField f={{ key: "v", label: "Texto alternativo", type: "list", max: 5000, maxItems: 10 }} value={value.variacoes} onChange={(variacoes) => onChange({ ...value, variacoes })} />}</Field>
          </div>
          {skipped.length > 0 && <span className="t-caption md:col-span-2">{skipped.map((k) => NETWORK[k].label).join(" e ")} não aceitam repetir o mesmo conteúdo: ficam fora da reciclagem.</span>}
        </div>
      )}
    </div>
  );
}
export const recyclingPayload = (r: RecyclingDraft) => (r.on && Number(r.dias) >= 1 ? { a_cada_dias: Number(r.dias), ...(Number(r.vezes) >= 1 ? { vezes: Number(r.vezes) } : {}), variacoes: r.variacoes.map((s) => s.trim()).filter(Boolean) } : null);

/* ------------------------------------------------------------------ regra de aprovação do espaço */
export type ApprovalPolicy = "nenhuma" | "agentes" | "membros" | "todos";
export const POLICY_LABEL: Record<ApprovalPolicy, string> = { nenhuma: "Ninguém precisa de aprovação", agentes: "Publicações feitas por agentes de IA e pela API", membros: "Publicações de membros (não admins) e de agentes de IA", todos: "Todas as publicações" };
export function useApprovalPolicy(ws?: string) {
  const [policy, setPolicy] = useState<ApprovalPolicy>("nenhuma");
  useEffect(() => { if (ws && supabase) supabase.from("workspaces").select("approval_policy").eq("id", ws).maybeSingle().then(({ data }) => setPolicy(((data as { approval_policy?: ApprovalPolicy } | null)?.approval_policy) ?? "nenhuma")); }, [ws]);
  return [policy, setPolicy] as const;
}
export function ApprovalPolicyModal({ open, onOpenChange, ws, policy, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; ws: string; policy: ApprovalPolicy; onSaved: (p: ApprovalPolicy) => void }) {
  const toast = useToast();
  const [v, setV] = useState<ApprovalPolicy>(policy);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setV(policy); }, [open, policy]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} icon={<ShieldCheck />} title="Aprovação de publicações" description="Quem precisa da aprovação de um administrador antes de publicar."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} onClick={async () => {
        setBusy(true);
        try { await channelCall({ action: "posts_policy", workspaceId: ws, policy: v }); onSaved(v); toast({ tone: "success", title: "Regra de aprovação salva" }); onOpenChange(false); }
        catch (e) { toast({ tone: "error", title: "Não foi possível salvar", description: e instanceof Error ? e.message : String(e) }); }
        setBusy(false);
      }}>Salvar</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="Precisa de aprovação">{(p) => <Select id={p.id} value={v} onValueChange={(x) => setV(x as ApprovalPolicy)} options={(Object.keys(POLICY_LABEL) as ApprovalPolicy[]).map((value) => ({ value, label: POLICY_LABEL[value] }))} />}</Field>
        <span className="t-caption">Publicações que precisam de aprovação ficam com o status "Aguardando aprovação". Um administrador aprova (publica ou agenda) ou rejeita (volta para rascunho com o motivo). Quem publica sempre pode marcar "Enviar para aprovação" por conta própria.</span>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ importar CSV */
interface ImportLine { linha: number; ok: boolean; erro?: string; quando?: string | null; modo?: string; contas?: string[] }
const TEMPLATE = 'data;texto;redes;contas;midias;titulo;primeiro_comentario;aprovacao\n25/12/2026 09:00;"Feliz Natal! 🎄 Aproveite 20% OFF hoje.";instagram|facebook;;https://exemplo.com/natal.jpg;;Link na bio!;nao\nfila;"Dica da semana: como escolher o tamanho certo.";;@sualoja;;;;\n;"Rascunho para revisar depois";linkedin;;;;;\n';
export function ImportCsvModal({ open, onOpenChange, ws, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; ws: string; onDone: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<{ validas: number; invalidas: number; linhas: ImportLine[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setCsv(""); setPreview(null); setError(null); } }, [open]);
  const run = async (dryRun: boolean) => {
    setBusy(true); setError(null);
    try {
      const r = await channelCall<{ validas: number; invalidas: number; linhas: ImportLine[] }>({ action: "post_import", workspaceId: ws, csv, dryRun });
      if (dryRun) setPreview(r);
      else { toast({ tone: r.invalidas ? "warning" : "success", title: `${r.validas} publicação(ões) criada(s)`, description: r.invalidas ? `${r.invalidas} linha(s) com erro não foram importadas.` : undefined }); onDone(); onOpenChange(false); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const download = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + TEMPLATE], { type: "text/csv;charset=utf-8" })); a.download = "modelo-publicacoes.csv"; a.click(); URL.revokeObjectURL(a.href); };
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" icon={<FileUp />} title="Importar publicações por CSV" description="Uma linha por publicação. Confira a prévia antes de criar."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>{preview ? <Button variant="primary" loading={busy} disabled={!preview.validas} onClick={() => void run(false)}>Importar {preview.validas} publicação(ões)</Button> : <Button variant="primary" loading={busy} disabled={!csv.trim()} onClick={() => void run(true)}>Conferir</Button>}</>}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<FileUp />} onClick={() => fileRef.current?.click()}>Escolher arquivo</Button>
          <Button variant="ghost" icon={<Download />} onClick={download}>Baixar modelo</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); setPreview(null); } e.target.value = ""; }} />
        </div>
        <Field label="Conteúdo do CSV" hint="Colunas: data (dd/mm/aaaa hh:mm, “fila” ou vazio = rascunho), texto, redes, contas, midias, titulo, primeiro_comentario, aprovacao. Listas separadas por |.">{(p) => <Textarea id={p.id} rows={6} value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} className="font-mono text-[12px]" />}</Field>
        {preview && (
          <div className="flex flex-col gap-2">
            <span className="t-secondary">{preview.validas} linha(s) prontas · {preview.invalidas} com erro</span>
            <div className="max-h-[260px] overflow-auto rounded-md border border-line">
              <table className="w-full text-[13px]">
                <thead className="bg-surface-2 text-left t-caption"><tr><th className="px-2 py-1.5">Linha</th><th className="px-2 py-1.5">Quando</th><th className="px-2 py-1.5">Onde</th><th className="px-2 py-1.5">Situação</th></tr></thead>
                <tbody>{preview.linhas.map((l) => (
                  <tr key={l.linha} className="border-t border-line align-top">
                    <td className="px-2 py-1.5 num">{l.linha}</td>
                    <td className="px-2 py-1.5">{l.modo === "fila" ? "Próximo horário da fila" : l.quando ? formatDateTime(new Date(l.quando)) : l.modo === "rascunho" ? "Rascunho" : "—"}</td>
                    <td className="px-2 py-1.5">{l.contas?.join(", ") || "—"}</td>
                    <td className="px-2 py-1.5">{l.ok ? <Tag tone="positive">Pronta</Tag> : <span className="text-negative">{l.erro}</span>}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </div>
        )}
        {error && <InlineNotice tone="negative">{error}</InlineNotice>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ rejeitar */
export function RejectModal({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setNote(""); }, [open]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Rejeitar publicação" description="Ela volta para rascunho com o motivo, para quem criou ajustar."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="danger" loading={busy} onClick={async () => { setBusy(true); await onConfirm(note); setBusy(false); onOpenChange(false); }}>Rejeitar</Button></>}>
      <Field label="Motivo" hint="Opcional, mas ajuda quem vai corrigir.">{(p) => <Textarea id={p.id} rows={3} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: troque a imagem e tire o preço do texto." />}</Field>
    </Modal>
  );
}
