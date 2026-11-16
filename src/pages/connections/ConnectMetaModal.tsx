import { AppWindow, Copy, ExternalLink, KeyRound, LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { InlineNotice, LoadingState } from "@/components/feedback/States";

type Mode = "app_ninepro" | "app_proprio" | "token";
interface Options { ninepro: boolean; redirectUri: string; scopes: string[]; ownAppId: string | null }
type Call = <T>(body: Record<string, unknown>) => Promise<T>;

/**
 * Três jeitos de conectar a Meta Ads:
 *  - Entrar com Facebook (app do NinePro) — só aparece quando o app do NinePro está disponível;
 *  - App da própria empresa (ID + chave secreta) — não depende da aprovação do app do NinePro;
 *  - Token de acesso (usuário do sistema do Business Manager) — não expira, ideal para agências.
 */
export function ConnectMetaModal({ open, onOpenChange, ws, call, onConnected }: { open: boolean; onOpenChange: (o: boolean) => void; ws: string; call: Call; onConnected: () => void }) {
  const toast = useToast();
  const [opts, setOpts] = useState<Options | null>(null);
  const [mode, setMode] = useState<Mode>("app_proprio");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null); setAppSecret(""); setToken(""); setOpts(null);
    call<Options>({ action: "options", workspaceId: ws }).then((o) => {
      setOpts(o);
      setMode(o.ninepro ? "app_ninepro" : "app_proprio");
      if (o.ownAppId) setAppId(o.ownAppId);
    }).catch(() => setOpts({ ninepro: false, redirectUri: `${location.origin}/api/connect`, scopes: ["ads_read", "ads_management", "business_management"], ownAppId: null }));
  }, [open, ws, call]);

  const copy = (v: string, what: string) => navigator.clipboard?.writeText(v).then(() => toast({ tone: "info", title: `${what} copiado` }), () => undefined);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (mode === "token") {
        const r = await call<{ user: string }>({ action: "connect_token", workspaceId: ws, token });
        toast({ tone: "success", title: "Meta conectada", description: `Token de ${r.user}. Buscando contas e campanhas…` });
        onOpenChange(false);
        onConnected();
      } else {
        const { url } = await call<{ url: string }>({ action: "start", workspaceId: ws, platform: "meta", mode, appId: appId.trim(), appSecret: appSecret.trim() });
        window.location.href = url;
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const canSubmit = mode === "app_ninepro" || (mode === "app_proprio" && /^\d{5,20}$/.test(appId.trim()) && (appSecret.trim().length === 32 || (!!opts?.ownAppId && opts.ownAppId === appId.trim()))) || (mode === "token" && token.trim().length >= 50);

  const choices: { id: Mode; icon: JSX.Element; title: string; desc: string; show: boolean }[] = [
    { id: "app_ninepro", icon: <LogIn />, title: "Entrar com Facebook", desc: "O jeito mais simples: entre com a sua conta e escolha as contas de anúncio.", show: !!opts?.ninepro },
    { id: "app_proprio", icon: <AppWindow />, title: "App da sua empresa", desc: "Use o app que sua empresa já tem no Meta for Developers.", show: true },
    { id: "token", icon: <KeyRound />, title: "Token de acesso", desc: "Cole um token de usuário do sistema do Business Manager. Não expira.", show: true },
  ];

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" title="Conectar Meta Ads" description="Facebook e Instagram Ads. Escolha como prefere autorizar o NinePro."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!canSubmit || !opts} onClick={() => void submit()}>{mode === "token" ? "Conectar" : "Continuar para o Facebook"}</Button></>}>
      {!opts ? <LoadingState /> : (
        <div className="flex flex-col gap-5">
          <div role="radiogroup" aria-label="Forma de conexão" className={cn("grid gap-2", choices.filter((c) => c.show).length === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
            {choices.filter((c) => c.show).map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={mode === c.id} onClick={() => { setMode(c.id); setError(null); }}
                className={cn("flex flex-col gap-1.5 rounded-md border p-3 text-left transition-colors [&_svg]:size-4", mode === c.id ? "border-accent-line-strong bg-accent-tint" : "border-line hover:border-line-strong")}>
                <span className="flex items-center gap-2 font-semibold">{c.icon}{c.title}</span>
                <span className="t-caption">{c.desc}</span>
              </button>
            ))}
          </div>

          {mode === "app_ninepro" && (
            <p className="t-secondary">Você vai para a tela oficial da Meta, entra com a sua conta e autoriza a leitura das campanhas e o controle de veiculação. Depois volta para cá e a primeira sincronização começa sozinha.</p>
          )}

          {mode === "app_proprio" && (
            <div className="flex flex-col gap-4">
              <ol className="ml-5 flex list-decimal flex-col gap-1.5 t-secondary">
                <li>No seu app em <b>developers.facebook.com</b>, adicione o produto <b>Login do Facebook</b> (ou Login do Facebook para Empresas).</li>
                <li>Em <b>Login do Facebook › Configurações › URIs de redirecionamento OAuth válidos</b>, cole o endereço abaixo e salve.</li>
                <li>Copie o <b>ID do app</b> e a <b>Chave secreta do app</b> em <b>Configurações do app › Básico</b> e informe aqui.</li>
              </ol>
              <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 p-2.5">
                <code className="flex-1 break-all font-mono text-[12px]">{opts.redirectUri}</code>
                <IconButton label="Copiar endereço de redirecionamento" size="sm" onClick={() => copy(opts.redirectUri, "Endereço")}><Copy /></IconButton>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="ID do app" required>{(p) => <Input {...p} value={appId} onChange={(e) => setAppId(e.target.value)} inputMode="numeric" placeholder="123456789012345" autoComplete="off" />}</Field>
                <Field label="Chave secreta do app" required={!opts.ownAppId || opts.ownAppId !== appId.trim()} hint={opts.ownAppId && opts.ownAppId === appId.trim() ? "Já guardada. Preencha só para trocar." : "Guardada criptografada."}>
                  {(p) => <Input {...p} type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="32 caracteres" autoComplete="off" />}
                </Field>
              </div>
              <InlineNotice tone="info">Com o app em modo de desenvolvimento, conectam as contas de anúncio de quem tem papel no app (administrador, desenvolvedor ou testador). Para as suas próprias contas, isso já basta.</InlineNotice>
            </div>
          )}

          {mode === "token" && (
            <div className="flex flex-col gap-4">
              <ol className="ml-5 flex list-decimal flex-col gap-1.5 t-secondary">
                <li>No <b>Business Manager</b> (business.facebook.com), vá em <b>Configurações do negócio › Usuários › Usuários do sistema</b> e crie um usuário do tipo Administrador.</li>
                <li>Em <b>Atribuir ativos</b>, dê acesso às contas de anúncio que o NinePro deve ler e controlar.</li>
                <li>Clique em <b>Gerar novo token</b>, escolha um app da empresa e marque as permissões <code className="font-mono">{opts.scopes.join(", ")}</code>. Em validade, escolha <b>Nunca</b>.</li>
              </ol>
              <Field label="Token de acesso" required hint="Guardado criptografado; nunca é exibido de novo.">
                {(p) => <textarea id={p.id} aria-describedby={p["aria-describedby"]} value={token} onChange={(e) => setToken(e.target.value)} rows={3} spellCheck={false} autoComplete="off"
                  className="w-full resize-y rounded-md border border-line bg-surface p-2.5 font-mono text-[12px] text-text placeholder:text-text-dim focus:border-accent-line-strong focus:outline-none focus:ring-[3px] focus:ring-accent-tint" placeholder="EAAG…" />}
              </Field>
              <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 self-start text-secondary font-semibold text-text-muted hover:text-text"><ExternalLink className="size-3.5" />Abrir usuários do sistema no Business Manager</a>
            </div>
          )}

          {error && <InlineNotice tone="negative">{error}</InlineNotice>}
        </div>
      )}
    </Modal>
  );
}
