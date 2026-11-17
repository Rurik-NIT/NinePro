import { useEffect, useMemo, useState } from "react";
import { Bot, ShieldCheck, TriangleAlert } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Controls";
import { InlineNotice, LoadingState } from "@/components/feedback/States";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { supabase } from "@/lib/supabase";
import { AGENT_SCOPES } from "@/config/agentScopes";

interface ClientInfo { nome?: string; site?: string | null; logo?: string | null; retorno?: string; erro?: string }

async function appCall<T>(body: Record<string, unknown>): Promise<T> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  const res = await fetch("/api/app", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const r = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(r.error ?? `Erro ${res.status}`);
  return r;
}

/** Tela de autorização OAuth: um agente de IA (Claude, ChatGPT, Grok…) pede acesso a um espaço do NinePro. */
export default function Authorize() {
  const { user, signOut } = useAuth();
  const { workspaces, current } = useWorkspace();
  const p = useMemo(() => new URLSearchParams(window.location.search), []);
  const clientId = p.get("client_id") ?? "", redirectUri = p.get("redirect_uri") ?? "", state = p.get("state");
  const requested = useMemo(() => {
    const asked = (p.get("scope") ?? "").split(/[\s,]+/).filter((s) => AGENT_SCOPES.some((x) => x.id === s));
    return asked.length ? asked : AGENT_SCOPES.map((s) => s.id);
  }, [p]);
  const [info, setInfo] = useState<ClientInfo | null>(null);
  const [wsId, setWsId] = useState(current?.id ?? "");
  const [scopes, setScopes] = useState<string[]>(requested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const role = workspaces.find((w) => w.id === wsId)?.role ?? "member";
  const isMember = role === "member";

  const paramError = p.get("response_type") !== "code" ? "Pedido inválido: response_type precisa ser “code”."
    : !clientId || !redirectUri ? "Pedido inválido: faltam client_id ou redirect_uri."
      : !p.get("code_challenge") || (p.get("code_challenge_method") ?? "S256") !== "S256" ? "O agente precisa usar PKCE (S256)." : null;

  useEffect(() => {
    if (paramError) return;
    appCall<ClientInfo>({ action: "oauth_client", clientId, redirectUri }).then(setInfo).catch((e) => setInfo({ erro: e.message }));
  }, [clientId, redirectUri, paramError]);
  useEffect(() => { if (!wsId && current) setWsId(current.id); }, [current, wsId]);
  useEffect(() => { if (isMember) setScopes(["leitura"]); else setScopes(requested); }, [isMember, requested]);

  const back = (params: Record<string, string>) => {
    const u = new URL(redirectUri);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (state) u.searchParams.set("state", state);
    u.searchParams.set("iss", window.location.origin);
    window.location.assign(u.toString());
  };
  const allow = async () => {
    setBusy(true); setError(null);
    try {
      const { code } = await appCall<{ code: string }>({ action: "oauth_approve", clientId, redirectUri, codeChallenge: p.get("code_challenge"), codeChallengeMethod: p.get("code_challenge_method") ?? "S256", scopes, workspaceId: wsId, resource: p.get("resource") ?? "" });
      back({ code });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  const deny = () => back({ error: "access_denied", error_description: "A pessoa negou o acesso." });

  const fatal = paramError ?? info?.erro;
  return (
    <div className="grid min-h-full place-items-center bg-canvas p-4">
      <div className="flex w-full max-w-[460px] flex-col gap-6 py-8">
        <div className="flex justify-center"><Logo /></div>
        <div className="panel flex flex-col gap-5 p-6">
          {fatal ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <TriangleAlert className="size-6 text-negative" />
              <h1 className="t-headline">Não foi possível conectar</h1>
              <p className="t-secondary">{fatal}</p>
            </div>
          ) : !info ? <LoadingState label="Carregando pedido de acesso…" /> : (
            <>
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="grid size-12 place-items-center overflow-hidden rounded-lg border border-line bg-surface-2">
                  {info.logo ? <img src={info.logo} alt="" className="size-full object-cover" /> : <Bot className="size-6 text-text-dim" />}
                </div>
                <h1 className="t-headline"><span className="text-text">{info.nome}</span> quer acessar seu NinePro</h1>
                <p className="t-secondary">O agente vai agir em nome de <strong className="text-text">{user?.email}</strong> no espaço escolhido, só com as permissões marcadas.</p>
              </div>

              {workspaces.length > 1 && (
                <label className="flex flex-col gap-1.5">
                  <span className="t-label">Espaço de trabalho</span>
                  <select className="h-9 rounded-md border border-line bg-surface px-2.5 text-body text-text" value={wsId} onChange={(e) => setWsId(e.target.value)}>
                    {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </label>
              )}

              <div className="flex flex-col gap-1.5">
                <span className="t-label">Permissões</span>
                <div className="flex flex-col divide-y divide-line rounded-md border border-line">
                  {AGENT_SCOPES.filter((s) => requested.includes(s.id)).map((s) => (
                    <Checkbox key={s.id} className="p-3" checked={scopes.includes(s.id)} disabled={s.id === "leitura" || (isMember && s.id !== "leitura")}
                      onCheckedChange={(v) => setScopes((cur) => v ? [...new Set([...cur, s.id])] : cur.filter((x) => x !== s.id))}
                      label={s.titulo} description={s.descricao} />
                  ))}
                </div>
                {isMember && <p className="t-caption text-text-dim">Como membro deste espaço, você só pode liberar a leitura.</p>}
              </div>

              <InlineNotice icon={<ShieldCheck />}>Você pode desconectar este agente quando quiser em Integração com agentes. O NinePro nunca compartilha suas senhas.</InlineNotice>
              {error && <InlineNotice tone="negative">{error}</InlineNotice>}

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={deny} disabled={busy}>Negar</Button>
                <Button variant="primary" onClick={allow} loading={busy} disabled={!wsId || !scopes.length}>Autorizar</Button>
              </div>
              <p className="text-center t-caption text-text-dim">
                Voltará para <span className="text-text">{info.retorno}</span> · <button className="underline hover:text-text" onClick={() => void signOut()}>Trocar de conta</button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
