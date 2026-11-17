import { AppWindow, Copy, KeyRound, LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { InlineNotice, LoadingState } from "@/components/feedback/States";
import { PLATFORM_GUIDE, type PlatformKey } from "./platformGuides";

type Mode = "app_ninepro" | "app_proprio" | "token";
interface CredField { key: string; label: string; secret?: boolean; placeholder?: string; hint?: string; pattern?: string; multiline?: boolean; optional?: boolean }
interface Options { label: string; ninepro: boolean; redirectUri: string; scopes: string[]; ownAppId: string | null; appFields: CredField[]; tokenFields: CredField[] }
export type Call = <T>(body: Record<string, unknown>) => Promise<T>;

/**
 * Conectar uma plataforma de anúncios por três caminhos:
 *  - Entrar (app do NinePro) — só aparece quando o app do NinePro dessa plataforma está disponível;
 *  - App da sua empresa — credenciais do app do cliente (não depende da aprovação do app do NinePro);
 *  - Token de acesso — credenciais geradas pelo próprio cliente.
 * Os campos de cada caminho vêm do servidor (definição da plataforma).
 */
export function ConnectModal({ platform, open, onOpenChange, ws, call, onConnected }: { platform: PlatformKey; open: boolean; onOpenChange: (o: boolean) => void; ws: string; call: Call; onConnected: () => void }) {
  const toast = useToast();
  const guide = PLATFORM_GUIDE[platform];
  const [opts, setOpts] = useState<Options | null>(null);
  const [mode, setMode] = useState<Mode>("app_proprio");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null); setValues({}); setOpts(null);
    call<Options>({ action: "options", workspaceId: ws, platform }).then((o) => {
      setOpts(o);
      setMode(o.ninepro ? "app_ninepro" : o.appFields.length ? "app_proprio" : "token");
      if (o.ownAppId) setValues({ appId: o.ownAppId });
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [open, ws, call, platform]);

  const fields = mode === "app_proprio" ? opts?.appFields ?? [] : mode === "token" ? opts?.tokenFields ?? [] : [];
  const sameApp = mode === "app_proprio" && !!opts?.ownAppId && opts.ownAppId === (values.appId ?? "").trim();
  const missing = fields.some((f) => !f.optional && !(sameApp && f.secret) && !(values[f.key] ?? "").trim());
  const invalid = fields.find((f) => f.pattern && (values[f.key] ?? "").trim() && !new RegExp(f.pattern).test((values[f.key] ?? "").trim()));

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (mode === "token") {
        const r = await call<{ user: string }>({ action: "connect_token", workspaceId: ws, platform, fields: values });
        toast({ tone: "success", title: `${opts?.label ?? "Plataforma"} conectada`, description: `${r.user}. Buscando contas e campanhas…` });
        onOpenChange(false);
        onConnected();
      } else {
        const { url } = await call<{ url: string }>({ action: "start", workspaceId: ws, platform, mode, fields: values });
        window.location.href = url;
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const choices: { id: Mode; icon: JSX.Element; title: string; desc: string; show: boolean }[] = [
    { id: "app_ninepro", icon: <LogIn />, title: guide.loginLabel, desc: "O jeito mais simples: entre com a sua conta e autorize o NinePro.", show: !!opts?.ninepro },
    { id: "app_proprio", icon: <AppWindow />, title: "App da sua empresa", desc: guide.appDesc, show: (opts?.appFields.length ?? 1) > 0 },
    { id: "token", icon: <KeyRound />, title: "Token de acesso", desc: guide.tokenDesc, show: true },
  ];
  const shown = choices.filter((c) => c.show);

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" title={`Conectar ${opts?.label ?? guide.label}`} description="Escolha como prefere autorizar o NinePro."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!opts || (mode !== "app_ninepro" && (missing || !!invalid))} onClick={() => void submit()}>{mode === "token" ? "Conectar" : `Continuar para ${guide.site}`}</Button></>}>
      {!opts ? (error ? <InlineNotice tone="negative">{error}</InlineNotice> : <LoadingState />) : (
        <div className="flex flex-col gap-5">
          <div role="radiogroup" aria-label="Forma de conexão" className={cn("grid gap-2", shown.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
            {shown.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={mode === c.id} onClick={() => { setMode(c.id); setError(null); }}
                className={cn("flex flex-col gap-1.5 rounded-md border p-3 text-left transition-colors [&_svg]:size-4", mode === c.id ? "border-accent-line-strong bg-accent-tint" : "border-line hover:border-line-strong")}>
                <span className="flex items-center gap-2 font-semibold">{c.icon}{c.title}</span>
                <span className="t-caption">{c.desc}</span>
              </button>
            ))}
          </div>

          {mode === "app_ninepro" && <p className="t-secondary">Você vai para a tela oficial de {guide.site}, entra com a sua conta e autoriza o NinePro. Depois volta para cá e a primeira sincronização começa sozinha.</p>}

          {mode !== "app_ninepro" && (
            <ol className="ml-5 flex list-decimal flex-col gap-1.5 t-secondary">
              {(mode === "app_proprio" ? guide.appSteps : guide.tokenSteps).map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          )}

          {mode === "app_proprio" && (
            <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 p-2.5">
              <span className="t-caption shrink-0">Redirecionamento</span>
              <code className="flex-1 break-all font-mono text-[12px]">{opts.redirectUri}</code>
              <IconButton label="Copiar endereço de redirecionamento" size="sm" onClick={() => navigator.clipboard?.writeText(opts.redirectUri).then(() => toast({ tone: "info", title: "Endereço copiado" }), () => undefined)}><Copy /></IconButton>
            </div>
          )}

          {fields.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {fields.map((f) => (
                <Field key={f.key} label={f.label} required={!f.optional && !(sameApp && f.secret)} className={f.multiline ? "md:col-span-2" : undefined}
                  hint={sameApp && f.secret ? "Já guardada. Preencha só para trocar." : f.hint}
                  error={invalid?.key === f.key ? "Formato inválido." : undefined}>
                  {(p) => f.multiline
                    ? <textarea id={p.id} aria-describedby={p["aria-describedby"]} rows={3} spellCheck={false} autoComplete="off" value={values[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        className="w-full resize-y rounded-md border border-line bg-surface p-2.5 font-mono text-[12px] text-text placeholder:text-text-dim focus:border-accent-line-strong focus:outline-none focus:ring-[3px] focus:ring-accent-tint" />
                    : <Input {...p} type={f.secret ? "password" : "text"} autoComplete="off" value={values[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />}
                </Field>
              ))}
            </div>
          )}

          {mode !== "app_ninepro" && guide.note && <InlineNotice tone="info">{guide.note(mode)}</InlineNotice>}
          {error && <InlineNotice tone="negative">{error}</InlineNotice>}
        </div>
      )}
    </Modal>
  );
}
