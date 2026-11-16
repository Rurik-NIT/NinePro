/** Formatação pt-BR centralizada. Nenhuma tela formata número por conta própria. */
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct1 = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type MetricFormat = "currency" | "currency0" | "integer" | "compact" | "percent" | "ratio" | "decimal";

export function formatValue(value: number | null | undefined, format: MetricFormat): string {
  if (value === null || value === undefined || Number.isNaN(value) || !Number.isFinite(value)) return "—";
  switch (format) {
    case "currency": return brl.format(value);
    case "currency0": return brl0.format(value);
    case "integer": return int.format(value);
    case "compact": return compact.format(value);
    case "percent": return pct.format(value);
    case "ratio": return `${dec2.format(value)}×`;
    case "decimal": return dec2.format(value);
  }
}

export const formatDelta = (ratio: number) => `${ratio > 0 ? "+" : ratio < 0 ? "−" : ""}${pct1.format(Math.abs(ratio))}`;

const dShort = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const dLong = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const dTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const formatDateShort = (d: Date) => dShort.format(d).replace(".", "");
export const formatDateLong = (d: Date) => dLong.format(d).replace(".", "");
export const formatDateTime = (d: Date) => dTime.format(d);
