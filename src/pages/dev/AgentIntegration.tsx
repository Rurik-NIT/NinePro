import { Copy, ExternalLink, KeyRound, ScrollText, Webhook } from "lucide-react";
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
      <PageHeader title="Integração com agentes" description="Ligue agentes de IA (Grok, Claude, ChatGPT), automações (n8n, Make) ou o seu próprio código ao NinePro: leitura de desempenho, campanhas, leads e conversões, e ações em leads, campanhas, públicos e regras."
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

      <InlineNotice tone="info">Cada chave de API dá acesso a um único espaço de trabalho. Chaves “Somente leitura” não veem nem executam as ferramentas de escrita. Toda chamada aparece em <Link to="/logs" className="font-semibold underline">Logs</Link>.</InlineNotice>

      <Tabs value={tab} onValueChange={setTab} items={[{ value: "mcp", label: "MCP" }, { value: "rest", label: "REST" }, { value: "webhooks", label: "Webhooks" }, { value: "ferramentas", label: "Ferramentas", count: ops?.length }]}>
        <TabPanel value="mcp" className="flex flex-col gap-3 pt-4">
          <p className="t-secondary max-w-[760px]">Para agentes compatíveis com MCP: informe o endereço do servidor e envie a chave no cabeçalho <code className="font-mono">Authorization</code>. O agente descobre sozinho as ferramentas disponíveis (<code className="font-mono">tools/list</code>). Exemplo de configuração:</p>
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
