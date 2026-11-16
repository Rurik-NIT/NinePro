import { BadgeCheck, Hash, Phone as PhoneIcon, PhoneCall, Plus, Server, ShieldCheck, Smartphone } from "lucide-react";
import { useState } from "react";
import { BRANDS_10DLC, CALLER_IDS, CALLS, PHONE_NUMBERS, RCS_AGENTS, SENDER_IDS, SIP_TRUNKS } from "@/data/demo/extra";
import { formatDateLong, formatDateTime, formatValue } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { StatusBadge, Tag } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { Select, Tooltip } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { InlineNotice } from "@/components/feedback/States";
import { Progress } from "@/components/data/Metrics";
import { ListScreen } from "@/components/templates/ListScreen";

const needs = (label: string, icon = <Plus />, variant: "primary" | "outline" = "primary") => (
  <Tooltip content="Requer integração com operadora"><span tabIndex={0}><Button variant={variant} icon={icon} disabled>{label}</Button></span></Tooltip>
);
const stTone = (s: string) => (["Ativo", "Aprovada", "Concluída"].includes(s) ? "positive" : ["Verificando", "Em verificação"].includes(s) ? "info" : ["Sem resposta", "Ocupado"].includes(s) ? "warning" : s === "Falhou" ? "negative" : "neutral");

export function PhoneOverview() {
  type N = (typeof PHONE_NUMBERS)[number];
  const monthly = PHONE_NUMBERS.reduce((a, n) => a + n.price, 0);
  return (
    <ListScreen<N>
      title="Telefonia" description="Números para voz, SMS e WhatsApp. Traga o seu ou compre um novo."
      rows={PHONE_NUMBERS} getId={(n) => n.id} searchText={(n) => n.number}
      actions={<>{needs("Trazer o meu", <PhoneIcon />, "outline")}{needs("Comprar número")}</>}
      columns={[
        { id: "n", header: "Número", sticky: true, sortValue: (n) => n.number, cell: (n) => <div className="flex flex-col"><span className="num font-semibold">{n.number}</span><span className="t-caption">{n.country} · {n.type}</span></div> },
        { id: "ch", header: "Canais", cell: (n) => <div className="flex gap-1">{n.channels.map((c) => <Tag key={c}>{c}</Tag>)}</div> },
        { id: "st", header: "Status", cell: (n) => <StatusBadge tone={stTone(n.status)}>{n.status}</StatusBadge> },
        { id: "p", header: "Preço", align: "right", sortValue: (n) => n.price, cell: (n) => (n.price ? `${formatValue(n.price, "currency")}/mês` : "Grátis") },
      ]}
      empty={{ icon: <PhoneIcon />, title: "Nenhum número", description: "Compre um número ou traga o seu." }}
      after={<p className="num t-secondary">{PHONE_NUMBERS.length} números · {PHONE_NUMBERS.filter((n) => n.status === "Ativo").length} ativos · {formatValue(monthly, "currency")} por mês, pagos do saldo</p>}
    />
  );
}

export function Calls() {
  type C = (typeof CALLS)[number];
  const fmt = (s: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "—");
  return (
    <ListScreen<C>
      title="Chamadas" description="Histórico de chamadas feitas e recebidas pelos seus números."
      rows={CALLS} getId={(c) => c.id} searchText={(c) => `${c.contact} ${c.id}`} searchPlaceholder="Buscar contato ou ID"
      filters={[
        { id: "st", label: "Status", options: ["Concluída", "Sem resposta", "Ocupado", "Falhou"].map((v) => ({ value: v, label: v })), match: (c, v) => c.status === v },
        { id: "dir", label: "Direção", options: ["Recebida", "Feita"].map((v) => ({ value: v, label: v })), match: (c, v) => c.direction === v },
      ]}
      actions={needs("Nova chamada", <PhoneCall />)}
      columns={[
        { id: "at", header: "Início", sticky: true, sortValue: (c) => c.startedAt.getTime(), cell: (c) => <span className="num text-text-soft">{formatDateTime(c.startedAt)}</span> },
        { id: "ct", header: "Contato", sortValue: (c) => c.contact, cell: (c) => <div className="flex flex-col"><span className="font-semibold">{c.contact}</span><span className="t-caption">{c.direction}</span></div> },
        { id: "st", header: "Status", cell: (c) => <StatusBadge tone={stTone(c.status)}>{c.status}</StatusBadge> },
        { id: "d", header: "Duração", align: "right", sortValue: (c) => c.durationS, cell: (c) => <span className="num">{fmt(c.durationS)}</span> },
        { id: "cost", header: "Custo", align: "right", sortValue: (c) => c.cost, cell: (c) => (c.cost ? formatValue(c.cost, "currency") : "—") },
        { id: "id", header: "ID", cell: (c) => <span className="font-mono text-[12px] text-text-dim">{c.id}</span> },
      ]}
      defaultSort={{ id: "at", dir: "desc" }}
      empty={{ icon: <PhoneCall />, title: "Nenhuma chamada ainda" }}
    />
  );
}

export function SipTrunks() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState("");
  type T = (typeof SIP_TRUNKS)[number];
  return (
    <>
      <ListScreen<T>
        title="SIP" description="Conecte seu PABX ou plataforma de voz por trunk SIP e associe números."
        rows={SIP_TRUNKS} getId={(t) => t.id}
        actions={<Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>Novo trunk</Button>}
        columns={[
          { id: "n", header: "Trunk", sticky: true, cell: (t) => <span className="font-semibold">{t.name}</span> },
          { id: "h", header: "Host", cell: (t) => <span className="font-mono text-[12px]">{t.host}</span> },
          { id: "tr", header: "Transporte", cell: (t) => <Tag>{t.transport}</Tag> },
          { id: "num", header: "Números", align: "right", cell: (t) => t.numbers },
          { id: "c", header: "Criado em", align: "right", cell: (t) => <span className="text-text-soft">{formatDateLong(t.createdAt)}</span> },
        ]}
        empty={{ icon: <Server />, title: "Nenhum trunk ainda", description: "Crie um, aponte sua plataforma de voz para as credenciais e associe um número." }}
      />
      <Modal open={open} onOpenChange={setOpen} icon={<Server />} title="Novo trunk SIP"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" disabled={!host} onClick={() => { toast({ tone: "success", title: "Trunk validado", description: "Credenciais reais exigem integração com operadora." }); setOpen(false); }}>Criar trunk</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Host de destino" required>{(p) => <Input {...p} value={host} onChange={(e) => setHost(e.target.value)} placeholder="sip.suaempresa.com" />}</Field>
          <Field label="Transporte">{(p) => <Select id={p.id} value="TLS" onValueChange={() => undefined} options={[{ value: "TLS", label: "TLS (recomendado)" }, { value: "TCP", label: "TCP" }, { value: "UDP", label: "UDP" }]} />}</Field>
        </div>
      </Modal>
    </>
  );
}

export function BrandedCalling() {
  type C = (typeof CALLER_IDS)[number];
  return (
    <ListScreen<C>
      title="Chamada identificada" description="Seu nome aparece na tela de quem recebe a ligação, em operadoras compatíveis."
      rows={CALLER_IDS} getId={(c) => c.id}
      before={<InlineNotice tone="info" icon={<BadgeCheck />}>Exige empresa registrada e verificação da operadora. A exibição do nome depende da operadora e do aparelho; não há garantia de exibição. Cobrança mensal por identidade verificada mais um valor por chamada identificada, debitados do saldo.</InlineNotice>}
      actions={<><Button onClick={() => undefined} disabled>Enviar formulário à empresa</Button>{needs("Configurar identidade")}</>}
      columns={[
        { id: "i", header: "Identidade", sticky: true, cell: (c) => <span className="font-semibold">{c.identity}</span> },
        { id: "st", header: "Status", cell: (c) => <StatusBadge tone={stTone(c.status)}>{c.status}</StatusBadge> },
        { id: "n", header: "Números", align: "right", cell: (c) => c.numbers },
        { id: "r", header: "Motivos de chamada", cell: (c) => <div className="flex flex-wrap gap-1">{c.reasons.map((r) => <Tag key={r}>{r}</Tag>)}</div> },
      ]}
      empty={{ icon: <BadgeCheck />, title: "Nenhuma identidade configurada" }}
    />
  );
}

export function TenDlc() {
  type B = (typeof BRANDS_10DLC)[number];
  return (
    <ListScreen<B>
      title="10DLC" description="Registro de marca e campanha para enviar SMS comercial a números dos EUA."
      rows={BRANDS_10DLC} getId={(b) => b.id}
      actions={needs("Registrar", <ShieldCheck />)}
      columns={[
        { id: "b", header: "Marca", sticky: true, cell: (b) => <span className="font-semibold">{b.brand}</span> },
        { id: "st", header: "Status", cell: (b) => <StatusBadge tone={stTone(b.status)}>{b.status}</StatusBadge> },
        { id: "ts", header: "Trust score", cell: (b) => <div className="flex w-32 items-center gap-2"><Progress size="sm" value={b.trust / 100} tone={b.trust >= 75 ? "positive" : "warning"} ariaLabel="Trust score" /><span className="num text-secondary font-bold">{b.trust}</span></div> },
        { id: "tp", header: "Vazão", cell: (b) => <span className="num text-text-soft">{b.throughput}</span> },
        { id: "m", header: "Mensal", align: "right", cell: (b) => formatValue(b.monthly, "currency") },
        { id: "n", header: "Números", align: "right", cell: (b) => b.numbers },
      ]}
      empty={{ icon: <ShieldCheck />, title: "Nenhuma marca registrada" }}
    />
  );
}

export function SenderIds() {
  const toast = useToast();
  const [ids, setIds] = useState(SENDER_IDS);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  type S = (typeof SENDER_IDS)[number];
  const valid = /^[A-Za-z0-9 ]{3,11}$/.test(name) && /[A-Za-z]/.test(name);
  return (
    <>
      <ListScreen<S>
        title="IDs de remetente" description="Envie SMS com o nome da marca (ex.: AURORA) em vez de um número, onde a operadora permitir."
        rows={ids} getId={(s) => s.id}
        actions={<Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>Novo ID de remetente</Button>}
        columns={[
          { id: "n", header: "Nome", sticky: true, cell: (s) => <span className="font-mono font-bold tracking-[0.06em]">{s.name}</span> },
          { id: "a", header: "Adicionado em", align: "right", cell: (s) => <span className="text-text-soft">{formatDateLong(s.addedAt)}</span> },
        ]}
        empty={{ icon: <Hash />, title: "Nenhum ID de remetente", description: "Envie SMS com o nome da sua marca." }}
      />
      <Modal open={open} onOpenChange={setOpen} icon={<Hash />} title="Novo ID de remetente"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" disabled={!valid} onClick={() => { setIds((s) => [{ id: `sid${Date.now()}`, name: name.toUpperCase(), addedAt: new Date() }, ...s]); toast({ tone: "success", title: "ID adicionado (demonstração)" }); setOpen(false); setName(""); }}>Adicionar</Button></>}>
        <Field label="Nome" required hint="De 3 a 11 caracteres, letras e números, com pelo menos uma letra." error={name && !valid ? "Formato inválido." : undefined}>{(p) => <Input {...p} value={name} maxLength={11} onChange={(e) => setName(e.target.value)} placeholder="AURORA" className="font-mono uppercase" />}</Field>
      </Modal>
    </>
  );
}

export function Rcs() {
  type R = (typeof RCS_AGENTS)[number];
  return (
    <ListScreen<R>
      title="RCS" description="Mensagens verificadas com logo, cartões e botões, no app de mensagens do celular."
      rows={RCS_AGENTS} getId={(a) => a.id}
      actions={needs("Novo agente RCS", <Smartphone />)}
      columns={[
        { id: "a", header: "Agente", sticky: true, cell: (a) => a.agent },
        { id: "c", header: "País", cell: (a) => a.country },
        { id: "s", header: "Status", cell: (a) => a.status },
        { id: "e", header: "Empresa", cell: (a) => a.company },
        { id: "p", header: "Preço", align: "right", cell: (a) => a.price },
      ]}
      empty={{ icon: <Smartphone />, title: "Nenhum agente RCS ainda", description: "Envie mensagens de marca verificadas, com logo, cartões ricos e botões. Há taxa de configuração, de aprovação e mensalidade, além das mensagens." }}
    />
  );
}
