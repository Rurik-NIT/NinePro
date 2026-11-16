import { ArrowDown, ArrowUp, Lock, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { METRICS, type MetricId } from "@/config/metrics";
import { Button, IconButton } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Dialog";
import { SearchInput } from "@/components/ui/Input";

/**
 * MetricConfigurator — drawer único para escolher e ordenar métricas
 * (indicadores do painel e colunas de tabela). Mesmo padrão nos dois lugares,
 * como na referência ("Edit cards" ≡ "Customize columns"). Reordenação por teclado (↑↓).
 */
export function MetricConfigurator({ open, onOpenChange, title, description, value, defaults, locked = [], max, onApply, icon }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; value: MetricId[]; defaults: MetricId[];
  locked?: MetricId[]; max?: number; onApply: (v: MetricId[]) => void; icon?: React.ReactNode;
}) {
  const [draft, setDraft] = useState<MetricId[]>(value);
  const [q, setQ] = useState("");
  useEffect(() => { if (open) { setDraft(value); setQ(""); } }, [open, value]);

  const available = (Object.keys(METRICS) as MetricId[]).filter((m) => !draft.includes(m) && METRICS[m].label.toLowerCase().includes(q.toLowerCase()));
  const move = (i: number, d: -1 | 1) => setDraft((s) => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const full = max !== undefined && draft.length >= max;

  return (
    <Drawer
      open={open} onOpenChange={onOpenChange} title={title} description={description} icon={icon}
      footer={
        <>
          <Button variant="ghost" onClick={() => setDraft(defaults)}>Restaurar padrão</Button>
          <span className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" onClick={() => { onApply(draft); onOpenChange(false); }}>Aplicar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between"><span className="t-label">Exibidas</span><span className="num t-caption">{draft.length}{max ? ` de ${max}` : ""}</span></div>
          <ul className="flex flex-col gap-1.5">
            {draft.map((m, i) => {
              const isLocked = locked.includes(m);
              return (
                <li key={m} className="flex h-10 items-center gap-2 rounded-md border border-line bg-surface-2 pl-3 pr-1">
                  <span className="num w-5 font-mono text-[11px] text-text-dim">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex-1 text-body font-semibold">{METRICS[m].label}</span>
                  <IconButton label={`Mover ${METRICS[m].label} para cima`} size="sm" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></IconButton>
                  <IconButton label={`Mover ${METRICS[m].label} para baixo`} size="sm" disabled={i === draft.length - 1} onClick={() => move(i, 1)}><ArrowDown /></IconButton>
                  {isLocked ? (
                    <span className="grid size-control-sm place-items-center text-text-dim" title="Coluna fixa"><Lock className="size-3.5" /></span>
                  ) : (
                    <IconButton label={`Remover ${METRICS[m].label}`} size="sm" onClick={() => setDraft((s) => s.filter((x) => x !== m))}><X /></IconButton>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <span className="t-label">Adicionar</span>
          <SearchInput value={q} onValueChange={setQ} placeholder="Buscar métrica" size="sm" />
          <ul className="flex flex-col">
            {available.map((m) => (
              <li key={m}>
                <button type="button" disabled={full} onClick={() => setDraft((s) => [...s, m])}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-soft disabled:opacity-40">
                  <Plus className="size-4 text-text-dim" />
                  <span className="flex flex-1 flex-col">
                    <span className="text-body font-semibold">{METRICS[m].label}</span>
                    <span className="t-caption">{METRICS[m].description}</span>
                  </span>
                </button>
              </li>
            ))}
            {available.length === 0 && <li className="py-4 text-center t-secondary">Nenhuma métrica disponível.</li>}
          </ul>
          {full && <p className="t-caption">Limite de {max} itens atingido. Remova um para adicionar outro.</p>}
        </div>
      </div>
    </Drawer>
  );
}
