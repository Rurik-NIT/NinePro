import { RefreshCw } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Button, IconButton } from "@/components/ui/Button";
import { Count } from "@/components/ui/Badge";
import { SearchInput } from "@/components/ui/Input";
import { MultiSelect } from "@/components/ui/Menu";
import { DemoBadge, EmptyState } from "@/components/feedback/States";
import { DataTable, TableToolbar, type Column } from "@/components/data/DataTable";

export interface ListFilter<T> { id: string; label: string; options: { value: string; label: string }[]; match: (row: T, value: string) => boolean }

/**
 * ListScreen — anatomia padrão das telas de lista da referência:
 * cabeçalho (título + contador + ações) → toolbar (busca, filtros, extras) → tabela com estado vazio
 * dentro do painel (os cabeçalhos continuam visíveis) → conteúdo complementar opcional.
 */
export function ListScreen<T>({
  title, description, demo = true, actions, rows, columns, getId, searchPlaceholder, searchText, filters = [], toolbarExtra,
  empty, onRowClick, defaultSort, before, after, selectable, refreshable, liveable, onRefresh,
}: {
  title: string;
  description?: ReactNode;
  demo?: boolean;
  actions?: ReactNode;
  rows: T[];
  columns: Column<T>[];
  getId: (r: T) => string;
  searchPlaceholder?: string;
  searchText?: (r: T) => string;
  filters?: ListFilter<T>[];
  toolbarExtra?: ReactNode;
  empty: { icon: ReactNode; title: string; description?: ReactNode; action?: ReactNode };
  onRowClick?: (r: T) => void;
  defaultSort?: { id: string; dir: "asc" | "desc" };
  before?: ReactNode;
  after?: ReactNode;
  selectable?: boolean;
  refreshable?: boolean;
  /** Oculta o selo de demonstração quando o banco real está conectado. */
  liveable?: boolean;
  onRefresh?: () => Promise<void> | void;
}) {
  const [q, setQ] = useState("");
  const [fv, setFv] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(
    () => rows
      .filter((r) => !q || !searchText || searchText(r).toLowerCase().includes(q.toLowerCase()))
      .filter((r) => filters.every((f) => !(fv[f.id]?.length) || fv[f.id].some((v) => f.match(r, v)))),
    [rows, q, fv, filters, searchText],
  );
  const hasFilters = !!q || Object.values(fv).some((v) => v.length);
  const showToolbar = !!searchText || filters.length > 0 || !!toolbarExtra || refreshable;

  return (
    <Page>
      <PageHeader
        meta={demo ? <DemoBadge liveable={liveable} /> : undefined}
        title={<span className="inline-flex items-center gap-3">{title} <Count>{filtered.length}</Count></span>}
        description={description}
        actions={actions}
      />
      {before}
      <section className="panel overflow-hidden">
        {showToolbar && (
          <TableToolbar actions={<>
            {toolbarExtra}
            {refreshable && <IconButton label="Atualizar" variant="outline" size="sm" onClick={async () => { setLoading(true); if (onRefresh) await onRefresh(); setTimeout(() => setLoading(false), onRefresh ? 200 : 600); }}><RefreshCw className={loading ? "animate-spin" : ""} /></IconButton>}
          </>}>
            {searchText && <SearchInput value={q} onValueChange={setQ} placeholder={searchPlaceholder ?? "Buscar"} size="sm" wrapperClassName="w-full sm:w-[300px]" />}
            {filters.map((f) => (
              <MultiSelect key={f.id} label={f.label} size="sm" options={f.options} value={fv[f.id] ?? []} onValueChange={(v) => setFv((s) => ({ ...s, [f.id]: v }))} />
            ))}
          </TableToolbar>
        )}
        <DataTable
          caption={title} rows={filtered} columns={columns} getId={getId} onRowClick={onRowClick} defaultSort={defaultSort} loading={loading}
          selectable={selectable} selected={selected} onSelectedChange={setSelected} className="max-h-[calc(100dvh-300px)]"
          empty={hasFilters
            ? <EmptyState compact icon={empty.icon} title="Nada com esses filtros" description="Ajuste a busca ou os filtros." actions={<Button size="sm" onClick={() => { setQ(""); setFv({}); }}>Limpar filtros</Button>} />
            : <EmptyState icon={empty.icon} title={empty.title} description={empty.description} actions={empty.action} />}
        />
      </section>
      {after}
    </Page>
  );
}
