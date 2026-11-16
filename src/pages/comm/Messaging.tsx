import { Copy, FileText, Link2, MessageCircle, MessageSquare, Plus, QrCode, Target, UserPlus, Users, Workflow } from "lucide-react";
import { useState } from "react";
import { IM_AUDIENCE, IM_SANDBOX, WA_SENDERS } from "@/data/demo/extra";
import { formatDateTime } from "@/lib/format";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Button, IconButton } from "@/components/ui/Button";
import { StatusBadge, Tag } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { Tooltip } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { DemoBadge, EmptyState } from "@/components/feedback/States";
import { ListScreen } from "@/components/templates/ListScreen";

const connectWa = <Tooltip content="Requer integração com a API do WhatsApp Business"><span tabIndex={0}><Button variant="primary" icon={<MessageCircle />} disabled>Conectar WhatsApp</Button></span></Tooltip>;

export function WhatsAppOverview() {
  type S = (typeof WA_SENDERS)[number];
  return (
    <ListScreen<S>
      title="WhatsApp" description="Remetentes do WhatsApp Business: números para atender, enviar modelos e rodar fluxos."
      rows={WA_SENDERS} getId={(s) => s.id}
      filters={[
        { id: "t", label: "Tipo", options: [{ value: "Número de teste compartilhado", label: "Teste" }, { value: "Próprio", label: "Próprio" }], match: (s, v) => s.type === v },
        { id: "s", label: "Status", options: [{ value: "Teste", label: "Teste" }, { value: "Ativo", label: "Ativo" }], match: (s, v) => s.status === v },
      ]}
      actions={connectWa}
      columns={[
        { id: "n", header: "Remetente", sticky: true, cell: (s) => <div className="flex flex-col"><span className="font-semibold">{s.name}</span><span className="t-caption">{s.type}</span></div> },
        { id: "num", header: "Número", cell: (s) => <span className="num">{s.number}</span> },
        { id: "t", header: "Tipo", cell: () => <Tag>Sandbox</Tag> },
        { id: "c", header: "Chamadas", cell: (s) => (s.calling ? "Ativas" : "—") },
        { id: "st", header: "Status", cell: (s) => <StatusBadge tone="info">{s.status}</StatusBadge> },
        { id: "id", header: "ID da conta", cell: (s) => <span className="font-mono text-[12px] text-text-dim">{s.accountId}</span> },
      ]}
      empty={{ icon: <MessageCircle />, title: "Nenhum remetente", description: "Conecte um número do WhatsApp Business." }}
    />
  );
}

function WaEmpty({ title, what, icon }: { title: string; what: string; icon: React.ReactNode }) {
  return (
    <Page>
      <PageHeader meta={<DemoBadge />} title={title} />
      <div className="panel"><EmptyState icon={icon} title="Nenhum remetente do WhatsApp ainda" description={`Conecte um remetente primeiro e depois gerencie ${what} aqui.`} actions={connectWa} /></div>
    </Page>
  );
}
export const WhatsAppTemplates = () => <WaEmpty title="Modelos" what="os modelos de mensagem" icon={<FileText />} />;
export const WhatsAppFlows = () => <WaEmpty title="Fluxos" what="os fluxos" icon={<Workflow />} />;
export const WhatsAppGroups = () => <WaEmpty title="Grupos" what="os grupos" icon={<Users />} />;
export const WhatsAppConversions = () => <WaEmpty title="Conversões" what="as conversões" icon={<Target />} />;

export function IMessageOverview() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState("");
  return (
    <Page>
      <PageHeader meta={<DemoBadge />} title="iMessage" description="Converse com clientes pelo iMessage, direto da caixa de entrada."
        actions={<Tooltip content="Requer contratação de remetente dedicado"><span tabIndex={0}><Button variant="primary" icon={<MessageSquare />} disabled>Conectar iMessage</Button></span></Tooltip>} />
      <section className="panel flex flex-col gap-4 p-5 md:flex-row md:items-center">
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="t-title">Teste grátis na linha sandbox</span>
          <p className="t-secondary">Adicione seu telefone ou e-mail Apple, envie o código de entrada para a linha sandbox e as mensagens chegam na caixa de entrada e nos webhooks. Respostas valem por 24 h após cada mensagem enviada. Até {IM_SANDBOX.max} contatos.</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-1.5"><span className="t-caption">Código</span><b className="font-mono tracking-[0.08em]">{IM_SANDBOX.code}</b><IconButton label="Copiar código" size="sm" onClick={() => navigator.clipboard?.writeText(IM_SANDBOX.code).then(() => toast({ tone: "info", title: "Código copiado" }), () => undefined)}><Copy /></IconButton></span>
            <span className="t-secondary">para <b className="num text-text">{IM_SANDBOX.line}</b></span>
            <span className="t-caption">ID da conta sandbox {IM_SANDBOX.accountId}</span>
          </div>
        </div>
        <Button icon={<UserPlus />} disabled={IM_SANDBOX.contacts >= IM_SANDBOX.max} onClick={() => setOpen(true)}>Adicionar contato ({IM_SANDBOX.contacts}/{IM_SANDBOX.max})</Button>
      </section>
      <div className="panel"><EmptyState icon={<MessageSquare />} title="Nenhum remetente iMessage ainda" description="Contrate um remetente dedicado para responder clientes pela caixa de entrada." /></div>
      <Modal open={open} onOpenChange={setOpen} icon={<UserPlus />} title="Adicionar contato à sandbox"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" disabled={contact.length < 6} onClick={() => { toast({ tone: "success", title: "Contato validado (demonstração)" }); setOpen(false); setContact(""); }}>Adicionar</Button></>}>
        <Field label="Telefone ou e-mail Apple" required>{(p) => <Input {...p} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="+55 11 9…  ou  nome@icloud.com" />}</Field>
      </Modal>
    </Page>
  );
}

export function IMessageOptIn() {
  return (
    <ListScreen<{ id: string }>
      title="Links de opt-in" description="Links e QR codes que abrem uma conversa com o seu remetente."
      rows={[]} getId={(r) => r.id}
      columns={[{ id: "s", header: "Remetente", cell: () => null }, { id: "l", header: "Link", cell: () => null }, { id: "q", header: "QR", cell: () => null }, { id: "t", header: "Links rastreados", cell: () => null }]}
      empty={{ icon: <Link2 />, title: "Nenhum remetente iMessage ativo", description: "Links de opt-in pertencem a um remetente. Conecte um na página do iMessage." }}
      after={<p className="flex items-center gap-2 t-caption"><QrCode className="size-3.5" />Cada link gera um QR code e pode ter variações rastreadas por origem.</p>}
    />
  );
}

export function IMessageAudience() {
  type C = (typeof IM_AUDIENCE)[number];
  return (
    <ListScreen<C>
      title="Público" description="Pessoas que já trocaram mensagens com seus remetentes."
      rows={IM_AUDIENCE} getId={(c) => c.id} searchText={(c) => c.contact}
      columns={[
        { id: "c", header: "Contato", sticky: true, cell: (c) => <span className="num font-semibold">{c.contact}</span> },
        { id: "s", header: "Remetente", cell: (c) => c.sender },
        { id: "st", header: "Status", cell: (c) => <StatusBadge tone="positive">{c.status}</StatusBadge> },
        { id: "o", header: "Origem", cell: (c) => <Tag>{c.source}</Tag> },
        { id: "l", header: "Última mensagem", align: "right", sortValue: (c) => c.lastMessage.getTime(), cell: (c) => <span className="text-text-soft">{formatDateTime(c.lastMessage)}</span> },
      ]}
      empty={{ icon: <Users />, title: "Ninguém escreveu ainda", description: "Contatos aparecem depois da primeira mensagem. Compartilhe o link de opt-in ou o QR do remetente." }}
      after={<p className="t-caption"><Plus className="mr-1 inline size-3" />Contatos da sandbox contam para o limite de 5.</p>}
    />
  );
}
