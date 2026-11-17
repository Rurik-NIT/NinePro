import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, CloudUpload, FileVideo, Image as ImageIcon, TriangleAlert } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { InlineNotice, LoadingState } from "@/components/feedback/States";
import { supabase } from "@/lib/supabase";

interface Sent { nome: string; tipo: string; tamanho: number | null; url: string }
interface Item { file: File; status: "enviando" | "ok" | "erro"; error?: string }
const ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.m4v,.webm,.avi,.pdf";
const size = (n: number | null) => (n == null ? "" : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

async function api<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/midia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const r = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(r.error ?? `Erro ${res.status}`);
  return r;
}

/** Página pública aberta pelo link que o agente de IA entrega: a pessoa solta fotos e vídeos e volta ao agente. */
export default function Upload() {
  const { token = "" } = useParams();
  const [state, setState] = useState<{ expirado: boolean; expira_em: string; arquivos: Sent[] } | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => api<{ expirado: boolean; expira_em: string; arquivos: Sent[] }>({ acao: "status", token }).then(setState).catch((e) => setFatal(e.message)), [token]);
  useEffect(() => { void refresh(); }, [refresh]);

  const send = async (files: FileList | File[]) => {
    for (const file of [...files]) {
      setItems((cur) => [...cur, { file, status: "enviando" }]);
      const mark = (patch: Partial<Item>) => setItems((cur) => cur.map((x) => (x.file === file ? { ...x, ...patch } : x)));
      try {
        const s = await api<{ path: string; token: string; tipo: string }>({ acao: "assinar", token, nome: file.name, tipo: file.type, tamanho: file.size });
        if (!supabase) throw new Error("Envio indisponível.");
        const { error } = await supabase.storage.from("midia").uploadToSignedUrl(s.path, s.token, file, { contentType: file.type || s.tipo });
        if (error) throw new Error(/size|large|exceed/i.test(error.message) ? "Arquivo grande demais para o armazenamento." : error.message);
        mark({ status: "ok" });
      } catch (e) { mark({ status: "erro", error: e instanceof Error ? e.message : String(e) }); }
    }
    void refresh();
  };

  const busy = items.some((i) => i.status === "enviando");
  const done = (state?.arquivos.length ?? 0) > 0 && !busy;
  return (
    <div className="grid min-h-full place-items-center bg-canvas p-4">
      <div className="flex w-full max-w-[520px] flex-col gap-6 py-8">
        <div className="flex justify-center"><Logo /></div>
        <div className="panel flex flex-col gap-5 p-6">
          {fatal ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center"><TriangleAlert className="size-6 text-negative" /><h1 className="t-headline">Link inválido</h1><p className="t-secondary">{fatal}</p></div>
          ) : !state ? <LoadingState label="Abrindo o link de envio…" /> : state.expirado ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center"><TriangleAlert className="size-6 text-negative" /><h1 className="t-headline">Este link expirou</h1><p className="t-secondary">Peça um novo link ao seu agente de IA.</p></div>
          ) : (
            <>
              <div className="flex flex-col gap-1 text-center">
                <h1 className="t-headline">Envie as fotos e vídeos para o seu agente</h1>
                <p className="t-secondary">Solte aqui os arquivos que o agente vai publicar. Quando terminar, volte para a conversa e diga “enviei”.</p>
              </div>
              <button type="button" onClick={() => input.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) void send(e.dataTransfer.files); }}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors ${drag ? "border-accent bg-accent-tint" : "border-line hover:border-line-strong"}`}>
                <CloudUpload className="size-8 text-text-dim" />
                <span className="font-semibold">Arraste os arquivos ou clique para escolher</span>
                <span className="t-caption text-text-dim">JPG, PNG, WebP, GIF, MP4, MOV, M4V, WebM · até 20 arquivos</span>
              </button>
              <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { if (e.target.files?.length) void send(e.target.files); e.target.value = ""; }} />

              {(items.length > 0 || state.arquivos.length > 0) && (
                <ul className="flex flex-col divide-y divide-line-soft rounded-md border border-line">
                  {state.arquivos.map((f) => (
                    <li key={f.url} className="flex items-center gap-3 p-3">
                      {f.tipo.startsWith("video/") ? <FileVideo className="size-4 text-text-dim" /> : <ImageIcon className="size-4 text-text-dim" />}
                      <span className="flex-1 truncate">{f.nome}</span><span className="t-caption text-text-dim">{size(f.tamanho)}</span><CheckCircle2 className="size-4 text-positive" />
                    </li>
                  ))}
                  {items.filter((i) => i.status !== "ok").map((i) => (
                    <li key={i.file.name + i.file.size} className="flex items-center gap-3 p-3">
                      <span className="flex-1 truncate">{i.file.name}</span>
                      <span className={`t-caption ${i.status === "erro" ? "text-negative" : "text-text-dim"}`}>{i.status === "erro" ? i.error : "Enviando…"}</span>
                    </li>
                  ))}
                </ul>
              )}
              {done && <InlineNotice tone="positive" icon={<CheckCircle2 />}>Pronto! {state.arquivos.length} arquivo(s) recebido(s). Volte para o agente e diga que terminou.</InlineNotice>}
              <div className="flex items-center justify-between">
                <span className="t-caption text-text-dim">Link válido até {new Date(state.expira_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}>Atualizar</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
