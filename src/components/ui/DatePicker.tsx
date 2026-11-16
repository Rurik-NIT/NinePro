import { DayPicker, type DateRange as RDPRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatDateLong, formatDateShort } from "@/lib/format";
import { Button } from "./Button";
import { Popover, PopoverContent, PopoverTrigger } from "./Menu";

export interface Range { from: Date; to: Date }
const DAY = 86_400_000;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export const RANGE_PRESETS: { id: string; label: string; get: () => Range }[] = [
  { id: "today", label: "Hoje", get: () => ({ from: today(), to: today() }) },
  { id: "yesterday", label: "Ontem", get: () => { const y = new Date(today().getTime() - DAY); return { from: y, to: y }; } },
  { id: "7d", label: "Últimos 7 dias", get: () => ({ from: new Date(today().getTime() - 6 * DAY), to: today() }) },
  { id: "14d", label: "Últimos 14 dias", get: () => ({ from: new Date(today().getTime() - 13 * DAY), to: today() }) },
  { id: "30d", label: "Últimos 30 dias", get: () => ({ from: new Date(today().getTime() - 29 * DAY), to: today() }) },
  { id: "month", label: "Este mês", get: () => { const t = today(); return { from: new Date(t.getFullYear(), t.getMonth(), 1), to: t }; } },
  { id: "lastmonth", label: "Mês passado", get: () => { const t = today(); return { from: new Date(t.getFullYear(), t.getMonth() - 1, 1), to: new Date(t.getFullYear(), t.getMonth(), 0) }; } },
  { id: "90d", label: "Últimos 90 dias", get: () => ({ from: new Date(today().getTime() - 89 * DAY), to: today() }) },
];

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
export function rangeLabel(r: Range, presetId?: string) {
  const p = RANGE_PRESETS.find((x) => x.id === presetId);
  if (p) return p.label;
  return sameDay(r.from, r.to) ? formatDateLong(r.from) : `${formatDateShort(r.from)} – ${formatDateShort(r.to)}`;
}

/** Classes compartilhadas do calendário — tokens, sem CSS da biblioteca. */
const calClass = {
  root: "relative select-none",
  months: "flex gap-6",
  month_caption: "flex h-8 items-center px-1 text-body font-bold capitalize",
  nav: "absolute right-0 top-0 flex gap-1",
  button_previous: "grid size-8 place-items-center rounded-md text-text-muted hover:bg-soft hover:text-text",
  button_next: "grid size-8 place-items-center rounded-md text-text-muted hover:bg-soft hover:text-text",
  weekdays: "flex",
  weekday: "t-label flex size-9 items-center justify-center !text-[10px]",
  week: "flex",
  day: "num relative size-9 p-0 text-center text-secondary",
  day_button: "size-9 rounded-md font-semibold text-text-soft transition-colors hover:bg-soft hover:text-text",
  today: "[&>button]:text-accent-text [&>button]:underline [&>button]:underline-offset-4",
  outside: "opacity-30",
  disabled: "opacity-25",
  selected: "[&>button]:bg-accent [&>button]:text-accent-ink [&>button:hover]:bg-accent-hover",
  range_middle: "bg-accent-tint [&>button]:!bg-transparent [&>button]:!text-text [&>button]:rounded-none",
  range_start: "rounded-l-md bg-accent-tint",
  range_end: "rounded-r-md bg-accent-tint",
};
const Chevron = ({ orientation }: { orientation?: string }) => (orientation === "left" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />);

export function DateRangePicker({ value, presetId, onChange, align = "start" }: {
  value: Range; presetId?: string; onChange: (r: Range, presetId?: string) => void; align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RDPRange | undefined>({ from: value.from, to: value.to });
  const [draftPreset, setDraftPreset] = useState(presetId);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setDraft({ from: value.from, to: value.to }); setDraftPreset(presetId); } }}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex h-control items-center gap-2 rounded-md border border-line bg-surface px-3 text-body font-semibold text-text transition-colors hover:border-line-strong data-[state=open]:border-line-strong">
          <CalendarDays className="size-4 text-text-dim" />
          <span className="num">{rangeLabel(value, presetId)}</span>
          <ChevronDown className="size-4 text-text-dim" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="flex max-w-[calc(100vw-24px)] flex-col sm:flex-row">
        <div className="flex gap-1 overflow-x-auto border-b border-line p-2 sm:w-44 sm:flex-col sm:border-b-0 sm:border-r">
          {RANGE_PRESETS.map((p) => (
            <button key={p.id} type="button"
              onClick={() => { const r = p.get(); setDraft(r); setDraftPreset(p.id); }}
              className={cn("h-8 shrink-0 rounded-sm px-2.5 text-left text-secondary font-semibold transition-colors", draftPreset === p.id ? "bg-soft text-text" : "text-text-muted hover:bg-soft hover:text-text")}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 p-3">
          <DayPicker mode="range" locale={ptBR} weekStartsOn={1} selected={draft} onSelect={(r) => { setDraft(r); setDraftPreset(undefined); }}
            defaultMonth={value.to} disabled={{ after: today() }} classNames={calClass} components={{ Chevron }} showOutsideDays />
          <div className="flex items-center justify-between gap-4 border-t border-line pt-3">
            <div className="num t-secondary">
              {draft?.from ? formatDateShort(draft.from) : "—"} <span className="text-text-dim">→</span> {draft?.to ? formatDateShort(draft.to) : "—"}
            </div>
            <Button variant="primary" size="sm" disabled={!draft?.from || !draft?.to}
              onClick={() => { if (draft?.from && draft.to) { onChange({ from: draft.from, to: draft.to }, draftPreset); setOpen(false); } }}>
              Aplicar
            </Button>
          </div>
          <p className="t-caption">Datas no fuso da conta de anúncios.</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DatePicker({ value, onChange, placeholder = "Selecionar data" }: { value?: Date; onChange: (d: Date | undefined) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex h-control w-full items-center gap-2 rounded-md border border-line bg-surface px-3 text-left text-body transition-colors hover:border-line-strong">
          <CalendarDays className="size-4 text-text-dim" />
          <span className={cn("num flex-1", !value && "text-text-dim")}>{value ? formatDateLong(value) : placeholder}</span>
          <ChevronDown className="size-4 text-text-dim" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-3">
        <DayPicker mode="single" locale={ptBR} weekStartsOn={1} selected={value} onSelect={(d) => { onChange(d); setOpen(false); }} classNames={calClass} components={{ Chevron }} showOutsideDays />
      </PopoverContent>
    </Popover>
  );
}
