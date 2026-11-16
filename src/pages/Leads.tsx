import { Download, Mail, RefreshCw, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { LEAD_STATUS, PLATFORMS, type Lead, type LeadStatus } from "@/data/demo";
import { useData } from "@/data/source";
import { useFilters } from "@/lib/filters";
import { formatDateTime } from "@/lib/format";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Avatar, Count, StatusBadge, Tag } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Dialog";
import { SearchInput } from "@/components/ui/Input";
import { MultiSelect, Select } from "@/components/ui/Menu";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { DemoBadge, EmptyState } from "@/components/feedback/States";
import { DataTable, TableToolbar, type Column } from "@/components/data/DataTable";
import { PlatformLabel } from "@/components/data/Platform";

export default function Leads() {
  const { activePlatforms } = useFilters();
  const toast = useToast();
  const data = useData();
  const LEADS = data.leads;
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"todos" | LeadStatus>("todos");
  const [forms, setForms] = useState<string[]>([]);
  const [open, setOpen] = useState<Lead | null>(null);
  const [statusOverride, setStatusOverride] = useState<Record<string, LeadStatus>>({});
  const [refreshing, setRefreshing] = useState(false);

  const all = useMemo(() => LEADS.map((l) => ({ ...l, status: statusOverride[l.id] ?? l.status })), [LEADS, statusOverride]);
  const formOptions = [...new Set(LEADS.map((l) => l.form))].map((f) => ({ value: f, label: f }));
  const rows = all.filter((l) => activePlatforms.includes(l.platform))
    .filter((l) => tab === "todos" || l.status === tab)
    .filter((l) => !forms.length || forms.includes(l.form))
    .filter((l) => !q || `${l.name} ${l.email} ${l.campaign}`.toLowerCase().includes(q.toLowerCase()));

  const counts = (s: LeadStatus) => all.filter((l) => l.status === s && activePlatforms.includes(l.platform)).length;

  const columns: Column<Lead>[] = [
    { id: "lead", header: "Lead", sticky: true, sortValue: (l) => l.name, cell: (l) => (
      <div className="flex items-center gap-2.5"><Avatar name={l.name} size={28} /><div className="flex flex-col"><span className="text-body font-semibold">{l.name}</span><span className="t-caption">{l.email}</span></div></div>
    ) },
    { id: "status", header: "Status", sortValue: (l) => l.status, cell: (l) => <StatusBadge tone={LEAD_STATUS[l.status].tone}>{LEAD_STATUS[l.status].label}</StatusBadge> },
    { id: "form", header: "Formulário", sortValue: (l) => l.form, cell: (l) => <span className="text-text-soft">{l.form}</span> },
    { id: "source", header: "Origem", sortValue: (l) => l.platform, cell: (l) => <div className="flex flex-col"><PlatformLabel id={l.platform} muted /><span className="max-w-[220px] truncate t-caption pl-[18px]">{l.campaign}</span></div> },
    { id: "submitted", header: "Recebido", align: "right", sortValue: (l) => l.submittedAt.getTime(), cell: (l) => <span className="text-text-soft">{formatDateTime(l.submittedAt)}</span> },
  ];

  const exportCsv = () => {
    const csv = [["Nome", "E-mail", "Status", "Formulário", "Plataforma", "Campanha", "Recebido"], ...rows.map((l) => [l.name, l.email, LEAD_STATUS[l.status].label, l.form, PLATFORMS[l.platform].label, l.campaign, l.submittedAt.toISOString()])]
      .map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: "ninepro-leads-demo.csv" }).click();
    URL.revokeObjectURL(url);
    toast({ tone: "success", title: `${rows.length} leads exportados`, description: "Arquivo CSV com os filtros atuais." });
  };

  return (
    <Page>
      <PageHeader meta={<DemoBadge liveable />} title={<span className="inline-flex items-center gap-3">Leads <Count>{rows.length}</Count></span>}
        description="Cadastros recebidos dos formulários de anúncio, com status de qualificação."
        actions={<>
          <IconButton label="Atualizar" variant="outline" onClick={async () => { setRefreshing(true); await data.refresh(); setTimeout(() => setRefreshing(false), 300); }}><RefreshCw className={refreshing ? "animate-spin" : ""} /></IconButton>
          <Button icon={<Download />} onClick={exportCsv} disabled={!rows.length}>Exportar CSV</Button>
        </>} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}
        items={[{ value: "todos", label: "Todos", count: all.filter((l) => activePlatforms.includes(l.platform)).length }, ...(Object.keys(LEAD_STATUS) as LeadStatus[]).map((s) => ({ value: s, label: LEAD_STATUS[s].label, count: counts(s) }))]} />

      <section className="panel overflow-hidden">
        <TableToolbar>
          <SearchInput value={q} onValueChange={setQ} placeholder="Buscar nome, e-mail ou campanha" size="sm" wrapperClassName="w-full sm:w-[300px]" />
          <MultiSelect label="Formulário" size="sm" options={formOptions} value={forms} onValueChange={setForms} />
        </TableToolbar>
        <DataTable caption="Leads" rows={rows} columns={columns} getId={(l) => l.id} defaultSort={{ id: "submitted", dir: "desc" }} onRowClick={setOpen} loading={refreshing}
          className="max-h-[calc(100dvh-330px)]"
          empty={<EmptyState icon={<UserRound />} title="Nenhum lead aqui" description="Nada com esses filtros. Leads novos aparecem assim que a plataforma os envia." />} />
      </section>

      <Drawer open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open?.name ?? ""} description={open?.email} icon={<UserRound />}
        footer={<><Button variant="ghost" onClick={() => setOpen(null)}>Fechar</Button><span className="flex-1" /><Button icon={<Mail />} onClick={() => open && (location.href = `mailto:${open.email}`)}>Enviar e-mail</Button></>}>
        {open && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <span className="text-secondary font-semibold text-text-soft">Status</span>
              <Select value={statusOverride[open.id] ?? open.status} onValueChange={async (v) => { setStatusOverride((s) => ({ ...s, [open.id]: v as LeadStatus })); const err = await data.setLeadStatus(open.id, v as LeadStatus); toast(err ? { tone: "error", title: "Não foi possível salvar", description: err } : { tone: "success", title: "Status atualizado", description: `${open.name} → ${LEAD_STATUS[v as LeadStatus].label}${data.mode === "supabase" ? "" : " (local)"}` }); }}
                options={(Object.keys(LEAD_STATUS) as LeadStatus[]).map((s) => ({ value: s, label: LEAD_STATUS[s].label }))} />
            </div>
            <dl className="flex flex-col divide-y divide-line-soft rounded-md border border-line">
              {[["Formulário", open.form], ["Campanha", open.campaign], ["Plataforma", <PlatformLabel key="p" id={open.platform} />], ["Recebido em", formatDateTime(open.submittedAt)]].map(([k, v]) => (
                <div key={String(k)} className="flex items-center justify-between gap-4 px-3 py-2.5"><dt className="t-secondary">{k}</dt><dd className="text-right text-body font-semibold">{v}</dd></div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-1.5"><Tag>Formulário instantâneo</Tag><Tag>Consentimento registrado</Tag></div>
          </div>
        )}
      </Drawer>
    </Page>
  );
}
