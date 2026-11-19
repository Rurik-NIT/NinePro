import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Checkbox } from "@/components/ui/Controls";
import { Skeleton } from "@/components/feedback/States";

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T, depth: number) => ReactNode;
  /** Valor para ordenação; ausente = coluna não ordenável. */
  sortValue?: (row: T) => number | string;
  align?: "left" | "right" | "center";
  width?: number | string;
  /** Primeira coluna fica fixa no scroll horizontal. */
  sticky?: boolean;
  footer?: ReactNode;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  getId: (row: T) => string;
  getChildren?: (row: T) => T[] | undefined;
  defaultSort?: { id: string; dir: "asc" | "desc" };
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (s: Set<string>) => void;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
  density?: "comfortable" | "compact";
  caption: string;
  className?: string;
  footerRow?: boolean;
}

/**
 * DataTable — tabela de dados operacionais.
 * Cabeçalho mono em caixa alta, linhas de 44px (36 compacto), números tabulares alinhados à direita,
 * hierarquia expansível (campanha → conjunto → anúncio), seleção e ordenação acessível.
 */
export function DataTable<T>({
  rows, columns, getId, getChildren, defaultSort, selectable, selected, onSelectedChange, onRowClick, loading, empty, density = "comfortable", caption, className, footerRow,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(defaultSort);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    const sortRec = (list: T[]): T[] =>
      [...list].sort((a, b) => {
        const x = sv(a), y = sv(b);
        const r = typeof x === "number" && typeof y === "number" ? (Number.isNaN(x) ? -Infinity : x) - (Number.isNaN(y) ? -Infinity : y) : String(x).localeCompare(String(y), "pt-BR");
        return sort.dir === "asc" ? r : -r;
      });
    return sortRec(rows);
  }, [rows, columns, sort]);

  const toggleSort = (id: string) =>
    setSort((s) => (s?.id === id ? (s.dir === "desc" ? { id, dir: "asc" } : undefined) : { id, dir: "desc" }));

  const allIds = rows.map(getId);
  const sel = selected ?? new Set<string>();
  const allChecked = allIds.length > 0 && allIds.every((id) => sel.has(id));
  const someChecked = !allChecked && allIds.some((id) => sel.has(id));
  const rowH = density === "compact" ? "h-9" : "h-11";

  const renderRows = (list: T[], depth: number): ReactNode =>
    list.map((row) => {
      const id = getId(row);
      const kids = getChildren?.(row);
      const isOpen = expanded.has(id);
      return (
        <Fragment key={id}>
          <tr
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            aria-selected={sel.has(id) || undefined}
            className={cn(
              "group border-b border-line-soft transition-colors last:border-b-0",
              depth > 0 ? "bg-surface-2" : "bg-surface",
              "hover:bg-[color:var(--surface-2)]",
              sel.has(id) && "!bg-accent-tint",
              onRowClick && "cursor-pointer",
            )}
          >
            {selectable && (
              <td className={cn(rowH, "sticky left-0 z-[1] w-10 bg-inherit pl-4")} onClick={(e) => e.stopPropagation()}>
                {depth === 0 && (
                  <Checkbox
                    ariaLabel="Selecionar linha"
                    checked={sel.has(id)}
                    onCheckedChange={(v) => {
                      const n = new Set(sel);
                      v ? n.add(id) : n.delete(id);
                      onSelectedChange?.(n);
                    }}
                  />
                )}
              </td>
            )}
            {columns.map((c, ci) => (
              <td
                key={c.id}
                style={{ width: c.width }}
                className={cn(
                  rowH,
                  "whitespace-nowrap px-3 text-body",
                  c.align === "right" && "num text-right",
                  c.align === "center" && "text-center",
                  c.sticky && "sticky z-[1] bg-inherit",
                  c.sticky && (selectable ? "left-10" : "left-0"),
                  ci === 0 && !selectable && "pl-4",
                )}
              >
                {ci === 0 && getChildren ? (
                  <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 20 }}>
                    {kids && kids.length > 0 ? (
                      <button
                        type="button"
                        aria-label={isOpen ? "Recolher" : "Expandir"}
                        aria-expanded={isOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          const n = new Set(expanded);
                          isOpen ? n.delete(id) : n.add(id);
                          setExpanded(n);
                        }}
                        className="grid size-6 shrink-0 place-items-center rounded-sm text-text-dim hover:bg-soft hover:text-text"
                      >
                        <ChevronRight className={cn("size-3.5 transition-transform duration-150", isOpen && "rotate-90")} />
                      </button>
                    ) : (
                      <span className="w-6 shrink-0" />
                    )}
                    {c.cell(row, depth)}
                  </div>
                ) : (
                  c.cell(row, depth)
                )}
              </td>
            ))}
          </tr>
          {isOpen && kids && renderRows(kids, depth + 1)}
        </Fragment>
      );
    });

  return (
    <div className={cn("relative overflow-auto", className)}>
      <table className="w-full min-w-max border-separate border-spacing-0">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-[2]">
          <tr>
            {selectable && (
              <th className="sticky left-0 z-[3] h-9 w-10 border-b border-line bg-[var(--table-head)] pl-4">
                <Checkbox ariaLabel="Selecionar todas" checked={allChecked ? true : someChecked ? "indeterminate" : false} onCheckedChange={(v) => onSelectedChange?.(v ? new Set(allIds) : new Set())} />
              </th>
            )}
            {columns.map((c, ci) => {
              const active = sort?.id === c.id;
              return (
                <th
                  key={c.id}
                  scope="col"
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  style={{ width: c.width }}
                  className={cn(
                    "t-label h-9 whitespace-nowrap border-b border-line bg-[var(--table-head)] px-3 text-left",
                    c.align === "right" && "text-right",
                    c.sticky && "sticky z-[3]",
                    c.sticky && (selectable ? "left-10" : "left-0"),
                    ci === 0 && !selectable && "pl-4",
                    ci === 0 && getChildren && "pl-[46px]",
                  )}
                >
                  {c.sortValue ? (
                    <button type="button" onClick={() => toggleSort(c.id)} className={cn("inline-flex items-center gap-1 uppercase transition-colors hover:text-text", active && "text-text", c.align === "right" && "flex-row-reverse")}>
                      {c.header}
                      {active ? sort!.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowDown className="size-3 opacity-0 group-hover:opacity-40" />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="border-b border-line-soft">
                  {selectable && <td className="h-11 pl-4"><Skeleton className="size-4" /></td>}
                  {columns.map((c, ci) => (
                    <td key={c.id} className={cn("h-11 px-3", ci === 0 && "pl-4")}>
                      <Skeleton className={cn("h-3.5", ci === 0 ? "w-48" : "ml-auto w-16")} />
                    </td>
                  ))}
                </tr>
              ))
            : renderRows(sorted, 0)}
        </tbody>
        {footerRow && !loading && rows.length > 0 && (
          <tfoot className="sticky bottom-0 z-[2]">
            <tr>
              {selectable && <td className="h-11 border-t border-line bg-surface-2" />}
              {columns.map((c, ci) => (
                <td key={c.id} className={cn("h-11 whitespace-nowrap border-t border-line bg-surface-2 px-3 text-body font-bold", c.align === "right" && "num text-right", c.sticky && "sticky z-[3]", c.sticky && (selectable ? "left-10" : "left-0"), ci === 0 && "pl-4")}>
                  {c.footer}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {!loading && rows.length === 0 && empty}
    </div>
  );
}

/** TableToolbar — busca à esquerda, filtros e visualização no meio, ações à direita. */
export function TableToolbar({ children, actions, className }: { children?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-b border-line p-3", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
