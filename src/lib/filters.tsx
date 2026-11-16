import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { PLATFORMS, PLATFORM_ORDER, previousRange, type PlatformId } from "@/data/demo";
import { RANGE_PRESETS, type Range } from "@/components/ui/DatePicker";
import { PlatformDot } from "@/components/data/Platform";
import { MultiSelect } from "@/components/ui/Menu";
import { DateRangePicker } from "@/components/ui/DatePicker";

/**
 * Filtros globais (período + plataformas) — persistem entre telas,
 * resolvendo a fricção "contexto perdido ao voltar" apontada na auditoria do CoachIQ.
 */
interface FiltersCtx {
  range: Range;
  presetId?: string;
  previous: Range;
  platforms: PlatformId[];
  setRange: (r: Range, presetId?: string) => void;
  setPlatforms: (p: PlatformId[]) => void;
}
const Ctx = createContext<FiltersCtx | null>(null);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const initial = RANGE_PRESETS.find((p) => p.id === "30d")!;
  const [range, setR] = useState<Range>(initial.get());
  const [presetId, setPreset] = useState<string | undefined>("30d");
  const [platforms, setPlatforms] = useState<PlatformId[]>([]);
  const value = useMemo<FiltersCtx>(
    () => ({
      range, presetId, previous: previousRange(range), platforms,
      setRange: (r, p) => { setR(r); setPreset(p); },
      setPlatforms,
    }),
    [range, presetId, platforms],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFilters() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFilters precisa de <FiltersProvider>");
  /** Lista vazia = todas as plataformas. */
  const activePlatforms = c.platforms.length ? c.platforms : PLATFORM_ORDER;
  return { ...c, activePlatforms };
}

/** Barra de filtros padrão: período + plataformas. Sempre na mesma ordem em todas as telas. */
export function GlobalFilters() {
  const f = useFilters();
  return (
    <>
      <DateRangePicker value={f.range} presetId={f.presetId} onChange={f.setRange} />
      <MultiSelect
        label="Plataformas"
        value={f.platforms}
        onValueChange={(v) => f.setPlatforms(v as PlatformId[])}
        options={PLATFORM_ORDER.map((p) => ({ value: p, label: PLATFORMS[p].label, icon: <PlatformDot id={p} /> }))}
      />
    </>
  );
}
