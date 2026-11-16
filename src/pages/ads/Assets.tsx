import { FileText, MoreHorizontal, Plus, Users } from "lucide-react";
import { useState } from "react";
import { useData, type Audience, type LeadForm } from "@/data/source";
import { PLATFORMS, PLATFORM_ORDER } from "@/data/demo";
import { formatDateLong, formatValue } from "@/lib/format";
import { Button, IconButton } from "@/components/ui/Button";
import { StatusBadge, Tag } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { Menu, MenuContent, MenuItem, MenuTrigger, Select } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { InlineNotice } from "@/components/feedback/States";
import { PlatformLabel } from "@/components/data/Platform";
import { ListScreen } from "@/components/templates/ListScreen";

const AUD_TYPES = ["Lista de clientes", "Semelhante", "Retargeting do site", "Engajamento", "Segmentação salva", "Receita salva"];
const audTone = (s: string) => (s === "Pronto" ? "positive" : s === "Preenchendo" ? "info" : s === "Pequeno demais" ? "warning" : "neutral");

export function Audiences() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("Lista de clientes");
  const [name, setName] = useState("");
  const data = useData();
  type A = Audience;
  return (
    <>
      <ListScreen<A>
        title="Públicos" description="Listas de clientes, semelhantes, retargeting do site e receitas de segmentação reutilizáveis."
        rows={data.audiences} getId={(a) => a.id} searchText={(a) => a.name} searchPlaceholder="Buscar públicos" refreshable liveable onRefresh={data.refresh}
        filters={[
          { id: "type", label: "Tipo", options: AUD_TYPES.map((t) => ({ value: t, label: t })), match: (a, v) => a.type === v },
          { id: "pl", label: "Plataforma", options: PLATFORM_ORDER.map((p) => ({ value: p, label: PLATFORMS[p].label })), match: (a, v) => a.platform === v },
        ]}
        actions={<Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>Criar público</Button>}
        columns={[
          { id: "name", header: "Público", sticky: true, sortValue: (a) => a.name, cell: (a) => <span className="font-semibold">{a.name}</span> },
          { id: "type", header: "Tipo", sortValue: (a) => a.type, cell: (a) => <Tag>{a.type}</Tag> },
          { id: "size", header: "Tamanho", align: "right", sortValue: (a) => a.size, cell: (a) => (a.size ? formatValue(a.size, "compact") : "—") },
          { id: "status", header: "Status", cell: (a) => <StatusBadge tone={audTone(a.status)}>{a.status}</StatusBadge> },
          { id: "acc", header: "Conta", cell: (a) => <div className="flex flex-col"><PlatformLabel id={a.platform} muted /><span className="t-caption pl-[18px]">{a.account}</span></div> },
          { id: "act", header: <span className="sr-only">Ações</span>, width: 48, cell: (a) => (
            <Menu><MenuTrigger asChild><IconButton label={`Ações de ${a.name}`} size="sm"><MoreHorizontal /></IconButton></MenuTrigger>
              <MenuContent align="end"><MenuItem onSelect={() => toast({ tone: "info", title: "Duplicado (demonstração)", description: a.name })}>Duplicar</MenuItem><MenuItem disabled>Usar em campanha (requer integração)</MenuItem><MenuItem danger disabled>Excluir</MenuItem></MenuContent></Menu>
          ) },
        ]}
        empty={{ icon: <Users />, title: "Nenhum público ainda", description: "Crie uma lista de clientes, um semelhante, um retargeting do site ou salve uma receita de segmentação.", action: <Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>Criar o primeiro público</Button> }}
      />
      <Modal open={open} onOpenChange={setOpen} icon={<Users />} title="Criar público" description="Escolha o tipo e dê um nome. A plataforma calcula o tamanho após a conexão."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" disabled={!name.trim()} onClick={async () => { const err = await data.createAudience(name.trim(), type); toast(err ? { tone: "error", title: "Não foi possível criar", description: err } : { tone: "success", title: data.mode === "supabase" ? "Público salvo" : "Público validado", description: "Para enviar à plataforma, conecte uma conta de anúncios." }); if (!err) { setOpen(false); setName(""); } }}>Criar público</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Tipo">{(p) => <Select id={p.id} value={type} onValueChange={setType} options={AUD_TYPES.map((t) => ({ value: t, label: t }))} />}</Field>
          <Field label="Nome" required>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Compradores últimos 90 dias" />}</Field>
          {type === "Lista de clientes" && <InlineNotice tone="info">Você envia um CSV com e-mails ou telefones; os dados são criptografados antes de sair do navegador.</InlineNotice>}
          {type === "Semelhante" && <InlineNotice tone="info">Escolha um público de origem e o tamanho (1% a 10% do país).</InlineNotice>}
        </div>
      </Modal>
    </>
  );
}

export function LeadForms() {
  const toast = useToast();
  const data = useData();
  type F = LeadForm;
  return (
    <ListScreen<F>
      title="Formulários" description="Formulários instantâneos das plataformas. Os envios aparecem em Anúncios › Leads."
      rows={data.leadForms} liveable getId={(f) => f.id} searchText={(f) => f.name} searchPlaceholder="Buscar formulários"
      filters={[{ id: "st", label: "Status", options: ["Ativo", "Rascunho", "Arquivado"].map((v) => ({ value: v, label: v })), match: (f, v) => f.status === v }]}
      actions={<Button variant="primary" icon={<Plus />} onClick={() => toast({ tone: "info", title: "Novo formulário", description: "A criação exige uma Página do Facebook conectada." })}>Novo formulário</Button>}
      columns={[
        { id: "name", header: "Formulário", sticky: true, sortValue: (f) => f.name, cell: (f) => <div className="flex flex-col"><span className="font-semibold">{f.name}</span><PlatformLabel id={f.platform} muted /></div> },
        { id: "st", header: "Status", cell: (f) => <StatusBadge tone={f.status === "Ativo" ? "positive" : f.status === "Rascunho" ? "info" : "neutral"}>{f.status}</StatusBadge> },
        { id: "loc", header: "Idioma", cell: (f) => <Tag>{f.locale}</Tag> },
        { id: "created", header: "Criado em", sortValue: (f) => f.createdAt.getTime(), cell: (f) => <span className="text-text-soft">{formatDateLong(f.createdAt)}</span> },
        { id: "leads", header: "Leads", align: "right", sortValue: (f) => f.leads, cell: (f) => formatValue(f.leads, "integer") },
      ]}
      empty={{ icon: <FileText />, title: "Nenhuma conta do Facebook conectada", description: "Formulários de lead exigem uma Página do Facebook; anúncios no Instagram usam a Página vinculada." }}
    />
  );
}
