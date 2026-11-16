import { Columns3, Copy, Download, Megaphone, MoreHorizontal, Pause, Pencil, Play, Plus, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { COLUMN_PRESETS, LOCKED_COLUMNS, METRICS, sumTotals, type MetricId, type Totals } from "@/config/metrics";
import { CAMPAIGNS, OBJECTIVES, PLATFORMS, STATUS, campaignTotals, scaleTotals, type Campaign, type DeliveryStatus, type Objective } from "@/data/demo";
import { GlobalFilters, useFilters } from "@/lib/filters";
import { formatValue } from "@/lib/format";
import { useLocalState } from "@/lib/useLocalState";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Button, IconButton } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/Input";
import { Count, StatusBadge, Tag } from "@/components/ui/Badge";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuSeparator, MenuTrigger, MultiSelect } from "@/components/ui/Menu";
import { Switch } from "@/components/ui/Controls";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { SegmentedControl } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { DemoBadge, EmptyState } from "@/components/feedback/States";
import { DataTable, TableToolbar, type Column } from "@/components/data/DataTable";
import { MetricConfigurator } from "@/components/data/MetricConfigurator";
import { PlatformDot } from "@/components/data/Platform";
import { Progress } from "@/components/data/Metrics";
import { CreateCampaignModal } from "./campaigns/CreateCampaignModal";

/** Linha hierárquica: campanha → conjunto → anúncio, métricas proporcionais à participação. */
interface Row { id: string; level: 0 | 1 | 2; name: string; sub?: string; status: DeliveryStatus; totals: Totals; campaign: Campaign; children?: Row[] }

export default function Campaigns() {
  const { range, activePlatforms } = useFilters();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState<string[]>([]);
  const [objF, setObjF] = useState<string[]>([]);
  const [preset, setPreset] = useLocalState<string>("ninepro.campaigns.preset", "performance");
  const [custom, setCustom] = useLocalState<MetricId[] | null>("ninepro.campaigns.columns", null);
  const [density, setDensity] = useLocalState<"comfortable" | "compact">("ninepro.campaigns.density", "comfortable");
  const [cfgOpen, setCfgOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /* Estado de veiculação local (demo): alternar não toca nenhuma plataforma. */
  const [overrides, setOverrides] = useState<Record<string, DeliveryStatus>>({});
  const [confirm, setConfirm] = useState<{ ids: string[]; to: DeliveryStatus } | null>(null);

  const metricCols = custom ?? COLUMN_PRESETS[preset].columns;

  const rows = useMemo<Row[]>(() => {
    const term = q.trim().toLowerCase();
    return CAMPAIGNS.filter((c) => activePlatforms.includes(c.platform))
      .filter((c) => !objF.length || objF.includes(c.objective))
      .map((c) => ({ c, status: overrides[c.id] ?? c.status }))
      .filter(({ status }) => !statusF.length || statusF.includes(status))
      .filter(({ c }) => !term || [c.name, c.id, c.account, ...c.adSets.flatMap((s) => [s.name, ...s.ads.map((a) => a.name)])].some((x) => x.toLowerCase().includes(term)))
      .map(({ c, status }) => {
        const t = campaignTotals(c, range);
        return {
          id: c.id, level: 0, name: c.name, sub: `${PLATFORMS[c.platform].label} · ${c.account}`, status, totals: t, campaign: c,
          children: c.adSets.map((s) => ({
            id: s.id, level: 1, name: s.name, sub: "Conjunto de anúncios", status: overrides[c.id] === "paused" ? "paused" : s.status, totals: scaleTotals(t, s.share), campaign: c,
            children: s.ads.map((a) => ({ id: a.id, level: 2, name: a.name, sub: a.format, status: overrides[c.id] === "paused" ? "paused" : a.status, totals: scaleTotals(t, s.share * a.share), campaign: c })),
          })),
        } as Row;
      });
  }, [q, statusF, objF, activePlatforms, range, overrides]);

  const total = sumTotals(rows.map((r) => r.totals));

  const setStatus = (ids: string[], to: DeliveryStatus) => {
    setOverrides((o) => ({ ...o, ...Object.fromEntries(ids.map((id) => [id, to])) }));
    toast({ tone: "success", title: to === "paused" ? `${ids.length} campanha(s) pausada(s)` : `${ids.length} campanha(s) ativada(s)`, description: "Alteração local de demonstração — nenhuma plataforma foi acionada.", action: { label: "Desfazer", onClick: () => setOverrides((o) => { const n = { ...o }; ids.forEach((id) => delete n[id]); return n; }) } });
    setSelected(new Set());
  };

  const columns: Column<Row>[] = [
    {
      id: "name", header: "Campanha", sticky: true, width: 340, sortValue: (r) => r.name,
      cell: (r) => (
        <div className="flex min-w-0 max-w-[300px] items-center gap-2.5">
          {r.level === 0 && <PlatformDot id={r.campaign.platform} />}
          <div className="flex min-w-0 flex-col">
            <span className={r.level === 0 ? "truncate text-body font-semibold" : "truncate text-secondary font-semibold text-text-soft"}>{r.name}</span>
            <span className="truncate t-caption">{r.sub}</span>
          </div>
        </div>
      ),
      footer: <span className="text-secondary">Total · {rows.length} campanhas</span>,
    },
    {
      id: "delivery", header: "Veiculação", width: 150, sortValue: (r) => r.status,
      cell: (r) => r.level === 0 ? (
        <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
          <Switch size="sm" ariaLabel={`Veiculação de ${r.name}`} checked={r.status === "active" || r.status === "learning" || r.status === "limited"} disabled={r.status === "ended"}
            onCheckedChange={(v) => v ? setStatus([r.id], "active") : setConfirm({ ids: [r.id], to: "paused" })} />
          <StatusBadge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusBadge>
        </div>
      ) : <StatusBadge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusBadge>,
    },
    { id: "objective", header: "Objetivo", sortValue: (r) => r.campaign.objective, cell: (r) => r.level === 0 ? <Tag>{OBJECTIVES[r.campaign.objective]}</Tag> : null },
    {
      id: "budget", header: "Orçamento", align: "right", sortValue: (r) => r.campaign.budget,
      cell: (r) => r.level === 0 ? (
        <div className="flex flex-col items-end gap-1">
          <span className="num">{formatValue(r.campaign.budget, "currency0")}<span className="t-caption"> /{r.campaign.budgetType === "diario" ? "dia" : "total"}</span></span>
          {r.campaign.budgetType === "diario" && <div className="w-20"><Progress size="sm" value={Math.min(1, (r.totals.spend / Math.max(1, (range.to.getTime() - range.from.getTime()) / 86_400_000 + 1)) / r.campaign.budget)} tone="neutral" /></div>}
        </div>
      ) : <span className="t-caption">—</span>,
    },
    ...metricCols.map<Column<Row>>((m) => ({
      id: m, header: METRICS[m].short ?? METRICS[m].label, align: "right", sortValue: (r) => METRICS[m].compute(r.totals),
      cell: (r) => <span className={r.level > 0 ? "text-text-soft" : ""}>{formatValue(METRICS[m].compute(r.totals), METRICS[m].format)}</span>,
      footer: formatValue(METRICS[m].compute(total), METRICS[m].format),
    })),
    {
      id: "actions", header: <span className="sr-only">Ações</span>, width: 48,
      cell: (r) => r.level === 0 ? (
        <div onClick={(e) => e.stopPropagation()}>
          <Menu>
            <MenuTrigger asChild><IconButton label={`Ações de ${r.name}`} size="sm"><MoreHorizontal /></IconButton></MenuTrigger>
            <MenuContent align="end">
              <MenuItem icon={<Pencil />} disabled>Editar (requer integração)</MenuItem>
              <MenuItem icon={<Copy />} onSelect={() => { navigator.clipboard?.writeText(r.id).catch(() => undefined); toast({ tone: "info", title: "ID copiado", description: r.id }); }}>Copiar ID</MenuItem>
              <MenuSeparator />
              {r.status === "paused"
                ? <MenuItem icon={<Play />} onSelect={() => setStatus([r.id], "active")}>Ativar</MenuItem>
                : <MenuItem icon={<Pause />} disabled={r.status === "ended"} onSelect={() => setConfirm({ ids: [r.id], to: "paused" })}>Pausar</MenuItem>}
            </MenuContent>
          </Menu>
        </div>
      ) : null,
    },
  ];

  const statusOptions = (Object.keys(STATUS) as DeliveryStatus[]).map((s) => ({ value: s, label: STATUS[s].label }));
  const objOptions = (Object.keys(OBJECTIVES) as Objective[]).map((o) => ({ value: o, label: OBJECTIVES[o] }));

  return (
    <Page>
      <PageHeader
        meta={<DemoBadge />}
        title={<span className="inline-flex items-center gap-3">Campanhas <Count>{rows.length}</Count></span>}
        description="Campanhas, conjuntos e anúncios em uma única tabela. Expanda uma linha para ver os níveis abaixo."
        actions={<><GlobalFilters /><Button variant="primary" icon={<Plus />} onClick={() => setCreateOpen(true)}>Nova campanha</Button></>}
      />

      <section className="panel flex min-h-[420px] flex-col overflow-hidden">
        {selected.size > 0 ? (
          <TableToolbar className="bg-accent-tint" actions={<Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpar seleção</Button>}>
            <span className="text-body font-bold">{selected.size} selecionada(s)</span>
            <Button size="sm" icon={<Play />} onClick={() => setStatus([...selected], "active")}>Ativar</Button>
            <Button size="sm" icon={<Pause />} onClick={() => setConfirm({ ids: [...selected], to: "paused" })}>Pausar</Button>
          </TableToolbar>
        ) : (
          <TableToolbar
            actions={
              <>
                <SegmentedControl ariaLabel="Densidade" size="sm" value={density} onValueChange={setDensity}
                  options={[{ value: "comfortable", label: "Confortável" }, { value: "compact", label: "Compacta" }]} />
                <Menu>
                  <MenuTrigger asChild><Button size="sm" icon={<Columns3 />}>Colunas</Button></MenuTrigger>
                  <MenuContent align="end" className="w-[220px]">
                    <MenuLabel>Conjunto de colunas</MenuLabel>
                    <MenuRadioGroup value={custom ? "custom" : preset} onValueChange={(v) => { if (v !== "custom") { setPreset(v); setCustom(null); } }}
                      options={[...Object.entries(COLUMN_PRESETS).map(([k, p]) => ({ value: k, label: p.label })), ...(custom ? [{ value: "custom", label: "Personalizado" }] : [])]} />
                    <MenuSeparator />
                    <MenuItem icon={<SlidersHorizontal />} onSelect={() => setCfgOpen(true)}>Personalizar colunas…</MenuItem>
                  </MenuContent>
                </Menu>
                <IconButton label="Exportar CSV" variant="outline" size="sm" onClick={() => exportCsv(rows, metricCols)}><Download /></IconButton>
              </>
            }
          >
            <SearchInput value={q} onValueChange={setQ} placeholder="Buscar campanha, conjunto, anúncio ou ID" size="sm" wrapperClassName="w-full sm:w-[320px]" />
            <MultiSelect label="Status" size="sm" options={statusOptions} value={statusF} onValueChange={setStatusF} />
            <MultiSelect label="Objetivo" size="sm" options={objOptions} value={objF} onValueChange={setObjF} />
          </TableToolbar>
        )}

        <DataTable
          caption="Campanhas"
          rows={rows}
          columns={columns}
          getId={(r) => r.id}
          getChildren={(r) => r.children}
          defaultSort={{ id: "spend", dir: "desc" }}
          selectable
          selected={selected}
          onSelectedChange={setSelected}
          density={density}
          footerRow
          className="max-h-[calc(100dvh-280px)] min-h-0 flex-1"
          empty={
            <EmptyState icon={<Megaphone />} title="Nenhuma campanha encontrada"
              description={q || statusF.length || objF.length ? "Nenhum resultado para os filtros atuais." : "Conecte uma conta de anúncios para importar campanhas."}
              actions={(q || statusF.length || objF.length) ? <Button size="sm" onClick={() => { setQ(""); setStatusF([]); setObjF([]); }}>Limpar filtros</Button> : undefined} />
          }
        />
      </section>

      <MetricConfigurator open={cfgOpen} onOpenChange={setCfgOpen} title="Colunas da tabela" icon={<Columns3 />}
        description="A ordem de cima para baixo é a ordem da esquerda para a direita. Investimento é fixo."
        value={metricCols} defaults={COLUMN_PRESETS[preset].columns} locked={LOCKED_COLUMNS} onApply={(v) => setCustom(v)} />

      <ConfirmDialog
        open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm && confirm.ids.length > 1 ? `Pausar ${confirm.ids.length} campanhas?` : "Pausar campanha?"}
        description="A veiculação para imediatamente. O aprendizado da plataforma pode reiniciar ao reativar."
        confirmLabel="Pausar" onConfirm={() => confirm && setStatus(confirm.ids, confirm.to)}
      />

      <CreateCampaignModal open={createOpen} onOpenChange={setCreateOpen} />
    </Page>
  );
}

function exportCsv(rows: Row[], cols: MetricId[]) {
  const head = ["Campanha", "Plataforma", "Status", ...cols.map((c) => METRICS[c].label)];
  const lines = rows.map((r) => [r.name, PLATFORMS[r.campaign.platform].label, STATUS[r.status].label, ...cols.map((c) => { const v = METRICS[c].compute(r.totals); return Number.isFinite(v) ? v.toFixed(2) : ""; })]);
  const csv = [head, ...lines].map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "ninepro-campanhas-demo.csv" });
  a.click();
  URL.revokeObjectURL(url);
}
