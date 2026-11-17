import { Bot, Copy, ExternalLink, KeyRound, ScrollText, Unplug, Webhook } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/lib/workspace";
import { scopeTitle } from "@/config/agentScopes";
import { Button } from "@/components/ui/Button";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Tag } from "@/components/ui/Badge";
import { buttonClasses, IconButton } from "@/components/ui/Button";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { InlineNotice, LoadingState } from "@/components/feedback/States";

interface Op { method: string; path: string; id: string; summary: string; description: string; write: boolean }

function CopyBlock({ code, label }: { code: string; label: string }) {
  const toast = useToast();
  return (
    <div className="relative rounded-md border border-line bg-surface-2">
      <pre className="overflow-x-auto p-3 pr-11 font-mono text-[12px] leading-relaxed text-text-soft"><code>{code}</code></pre>
      <IconButton label={`Copiar ${label}`} size="sm" className="absolute right-2 top-2" onClick={() => navigator.clipboard?.writeText(code).then(() => toast({ tone: "info", title: `${label} copiado` }), () => undefined)}><Copy /></IconButton>
    </div>
  );
}

interface AgentConn { id: string; client_name: string; scopes: string[]; created_at: string; last_used_at: string | null; user_id: string | null }
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "nunca");

/** Conectar por OAuth (sem chave) e lista dos agentes já conectados ao espaço. */
function ConnectAgents({ origin }: { origin: string }) {
  const toast = useToast();
  const { current } = useWorkspace();
  const [list, setList] = useState<AgentConn[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const mcpUrl = `${origin}/api/mcp`;
  const load = () => {
    if (!supabase || !current) { setList([]); return; }
    supabase.from("oauth_tokens").select("id, client_name, scopes, created_at, last_used_at, user_id").eq("workspace_id", current.id).is("revoked_at", null).order("created_at", { ascending: false })
      .then(({ data, error }) => setList(error ? [] : ((data ?? []) as AgentConn[])));
  };
  useEffect(load, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const revoke = async (a: AgentConn) => {
    if (!window.confirm(`Desconectar ${a.client_name}? O agente perde o acesso na hora.`)) return;
    setBusy(a.id);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      const res = await fetch("/api/app", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "oauth_revoke", workspaceId: current?.id, tokenId: a.id }) });
      const r = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(r.error ?? `Erro ${res.status}`);
      toast({ tone: "success", title: `${a.client_name} desconectado` });
      load();
    } catch (e) { toast({ tone: "error", title: "Não foi possível desconectar", description: e instanceof Error ? e.message : String(e) }); }
    setBusy(null);
  };
  const steps = [
    { app: "Claude (claude.ai e app)", how: "Configurações › Conectores › Adicionar conector personalizado › cole o endereço › Conectar." },
    { app: "ChatGPT", how: "Configurações › Aplicativos e conectores › Criar (modo desenvolvedor) › cole o endereço › autenticação OAuth." },
    { app: "Grok e outros agentes", how: "Adicione um servidor MCP remoto com o endereço abaixo. Na primeira chamada abre esta tela de login e permissões." },
    { app: "Claude Code / Cursor", how: "claude mcp add --transport http ninepro " + mcpUrl + "  ·  no Cursor: Settings › MCP › Add server (URL)." },
  ];
  return (
    <section className="panel flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-tint text-accent"><Bot className="size-5" /></div>
        <div className="flex flex-col gap-0.5">
          <h2 className="t-title font-semibold">Conectar um agente de IA com um clique</h2>
          <p className="t-secondary max-w-[760px]">Cole o endereço do NinePro no agente. Ele abre a tela de login do NinePro, você escolhe o espaço e as permissões e pronto: sem copiar chave. Depois é só pedir, por exemplo, “analise minhas publicações dos últimos 90 dias e sugira 3 ideias” ou “publique este vídeo e crie a automação: quem comentar GUIA recebe o link no direct”.</p>
        </div>
      </div>
      <CopyBlock code={mcpUrl} label="endereço MCP" />
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {steps.map((s) => (
          <li key={s.app} className="rounded-md border border-line-soft p-3">
            <span className="font-semibold">{s.app}</span>
            <p className="t-secondary break-words">{s.how}</p>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <span className="t-label">Agentes conectados a este espaço</span>
        {!list ? <LoadingState /> : !list.length ? <p className="t-secondary">Nenhum agente conectado ainda.</p> : (
          <ul className="divide-y divide-line-soft rounded-md border border-line">
            {list.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">{a.client_name}</span>
                  <span className="t-caption text-text-dim">Conectado em {when(a.created_at)} · último uso: {when(a.last_used_at)}</span>
                  <div className="flex flex-wrap gap-1">{a.scopes.map((s) => <Tag key={s}>{scopeTitle(s)}</Tag>)}</div>
                </div>
                <Button size="sm" variant="outline" icon={<Unplug />} loading={busy === a.id} onClick={() => void revoke(a)}>Desconectar</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}


/** Como ligar agentes (Grok, Claude, ChatGPT, n8n, código próprio) ao NinePro. */
export default function AgentIntegration() {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://ninepro.vercel.app";
  const [tab, setTab] = useState("mcp");
  const [ops, setOps] = useState<Op[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/v1/openapi.json").then((r) => r.json()).then((spec: { paths: Record<string, Record<string, { operationId: string; summary: string; description: string }>> }) => {
      const list: Op[] = [];
      for (const [path, methods] of Object.entries(spec.paths)) for (const [m, op] of Object.entries(methods)) list.push({ method: m.toUpperCase(), path, id: op.operationId, summary: op.summary, description: op.description, write: m !== "get" });
      setOps(list);
    }).catch(() => setFailed(true));
  }, []);

  const mcpConfig = JSON.stringify({ mcpServers: { ninepro: { type: "http", url: `${origin}/api/mcp`, headers: { Authorization: "Bearer np_live_SUA_CHAVE" } } } }, null, 2);
  const curl = `# Resumo dos últimos 7 dias
curl ${origin}/api/v1/resumo?dias=7 \\
  -H "Authorization: Bearer np_live_SUA_CHAVE"

# Registrar um lead captado pelo agente
curl -X POST ${origin}/api/v1/leads \\
  -H "Authorization: Bearer np_live_SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{"nome": "Maria Silva", "email": "maria@exemplo.com", "telefone": "+55 11 99999-0000"}'

# Chamar qualquer ferramenta pelo nome
curl -X POST ${origin}/api/v1/ferramentas/listar_campanhas \\
  -H "Authorization: Bearer np_live_SUA_CHAVE" \\
  -H "Content-Type: application/json" -d '{"dias": 30, "status": "active"}'`;
  const verify = `// Node.js — confira a assinatura antes de confiar no evento
import crypto from "node:crypto";

export function eventoValido(corpoBruto, cabecalhoAssinatura, segredo) {
  const esperado = "sha256=" + crypto.createHmac("sha256", segredo).update(corpoBruto).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(cabecalhoAssinatura ?? ""));
}

// Corpo enviado pelo NinePro:
// { "id": "…", "evento": "lead.criado", "criado_em": "2026-…", "espaco_id": "…", "dados": { … } }`;

  return (
    <Page>
      <PageHeader title="Integração com agentes" description="Ligue agentes de IA (Claude, ChatGPT, Grok, Cursor), automações (n8n, Make) ou o seu próprio código ao NinePro. O agente lê desempenho e análises, publica no Instagram, responde conversas e cria automações de comentário → DM."
        actions={<Link to="/chaves-api" className={buttonClasses("primary")}><KeyRound className="size-4" />Criar chave de API</Link>} />

      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
        {[
          { label: "MCP (agentes de IA)", value: `${origin}/api/mcp`, hint: "Streamable HTTP · JSON-RPC" },
          { label: "API REST", value: `${origin}/api/v1`, hint: "JSON · Authorization: Bearer" },
          { label: "Especificação OpenAPI", value: `${origin}/api/v1/openapi.json`, hint: "Para ferramentas que importam OpenAPI" },
        ].map((e) => (
          <section key={e.label} className="panel flex flex-col gap-2 p-4">
            <span className="t-label">{e.label}</span>
            <CopyBlock code={e.value} label={e.label} />
            <span className="t-caption">{e.hint}</span>
          </section>
        ))}
      </div>

      <ConnectAgents origin={origin} />

      <InlineNotice tone="info">Cada chave de API dá acesso a um único espaço de trabalho. Chaves “Somente leitura” não veem nem executam as ferramentas de escrita. Toda chamada aparece em <Link to="/logs" className="font-semibold underline">Logs</Link>.</InlineNotice>

      <Tabs value={tab} onValueChange={setTab} items={[{ value: "mcp", label: "MCP" }, { value: "rest", label: "REST" }, { value: "webhooks", label: "Webhooks" }, { value: "ferramentas", label: "Ferramentas", count: ops?.length }]}>
        <TabPanel value="mcp" className="flex flex-col gap-3 pt-4">
          <p className="t-secondary max-w-[760px]">Agentes com OAuth (Claude, ChatGPT, Grok, Cursor) só precisam do endereço do servidor: o login e as permissões são pedidos na hora. Para os demais, envie uma chave de API no cabeçalho <code className="font-mono">Authorization</code>. O agente descobre sozinho as ferramentas disponíveis (<code className="font-mono">tools/list</code>). Exemplo de configuração:</p>
          <CopyBlock code={mcpConfig} label="configuração MCP" />
        </TabPanel>
        <TabPanel value="rest" className="flex flex-col gap-3 pt-4">
          <p className="t-secondary max-w-[760px]">Para agentes que chamam APIs (function calling), automações e código próprio. Respostas em JSON; erros vêm como <code className="font-mono">{"{ \"erro\": \"…\" }"}</code> com o status HTTP correspondente.</p>
          <CopyBlock code={curl} label="exemplos" />
        </TabPanel>
        <TabPanel value="webhooks" className="flex flex-col gap-3 pt-4">
          <p className="t-secondary max-w-[760px]">Para o NinePro avisar o agente quando algo acontece (lead criado, status alterado, regra criada), cadastre o endereço do agente em <Link to="/webhooks" className="font-semibold underline">Webhooks</Link>. Cada entrega é um POST em JSON, assinado com o segredo do webhook.</p>
          <CopyBlock code={verify} label="verificação de assinatura" />
        </TabPanel>
        <TabPanel value="ferramentas" className="pt-4">
          {failed ? <InlineNotice tone="negative">Não foi possível carregar a lista de ferramentas.</InlineNotice> : !ops ? <LoadingState /> : (
            <section className="panel overflow-hidden">
              <ul className="divide-y divide-line-soft">
                {ops.map((o) => (
                  <li key={`${o.method}${o.path}`} className="flex flex-col gap-1.5 px-4 py-3 md:flex-row md:items-start md:gap-4">
                    <div className="flex min-w-[300px] items-center gap-2">
                      <Tag tone={o.write ? "warning" : undefined}>{o.method}</Tag>
                      <code className="font-mono text-[12px]">{o.path}</code>
                    </div>
                    <div className="flex flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2 font-semibold">{o.summary}<span className="font-mono text-[11px] text-text-dim">{o.id}</span></span>
                      <span className="t-secondary">{o.description}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </TabPanel>
      </Tabs>

      <div className="flex flex-wrap gap-2">
        <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer" className={buttonClasses("outline")}><ExternalLink className="size-4" />Abrir OpenAPI</a>
        <Link to="/webhooks" className={buttonClasses("outline")}><Webhook className="size-4" />Webhooks</Link>
        <Link to="/logs" className={buttonClasses("outline")}><ScrollText className="size-4" />Logs</Link>
      </div>
    </Page>
  );
}
