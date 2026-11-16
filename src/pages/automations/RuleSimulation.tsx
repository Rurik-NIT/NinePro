import { FlaskConical, History, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDateShort, formatValue } from "@/lib/format";
import { RULE_NEEDS_CPA, simulateRule, type SimEffect } from "@/lib/ruleSimulation";
import { useData } from "@/data/source";
import { Input } from "@/components/ui/Input";
import { Tooltip } from "@/components/ui/Menu";
import { SegmentedControl } from "@/components/ui/Tabs";
import { EmptyState, InlineNotice } from "@/components/feedback/States";
import { PlatformDot } from "@/components/data/Platform";

const EFFECT_LABEL: Record<SimEffect, string> = { pause: "Pausaria", scale: "Escalaria", alert: "Avisaria" };

/**
 * RuleSimulation — backtest de uma regra sobre o histórico (dados fictícios).
 * Mostra quantas vezes a regra teria disparado, onde e com que impacto estimado,
 * antes de o gestor ativá-la. O modelo simplificado é declarado na própria tela.
 */
export function RuleSimulation({ templateId, target, capPct }: { templateId: string; target: string; capPct: number }) {
  const [days, setDays] = useState<"14" | "30" | "60">("30");
  const [cpaRaw, setCpaRaw] = useState("60");
  const cpaTarget = Number(cpaRaw.replace(",", ".")) || 0;
  const needsCpa = RULE_NEEDS_CPA.has(templateId);
  const { campaigns } = useData();

  const r = useMemo(
    () => simulateRule(templateId, { target: target || "Todas as campanhas", cpaTarget: cpaTarget || 60, days: Number(days), capPct }, campaigns),
    [templateId, target, cpaTarget, days, capPct, campaigns],
  );
  const maxDaily = Math.max(1, ...r.daily.map((d) => d.events));
  const effect = r.effect ?? "alert";

  return (
    <section aria-label="Simulação da regra" className="flex flex-col gap-4 rounded-lg border border-line bg-surface-2 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-accent-tint text-accent-text"><FlaskConical className="size-4" /></span>
          <div className="flex flex-col">
            <span className="t-title">Simulação</span>
            <span className="t-caption">O que esta regra teria feito no passado</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {needsCpa && (
            <Input aria-label="Meta de custo por resultado" size="sm" inputMode="decimal" value={cpaRaw}
              onChange={(e) => setCpaRaw(e.target.value.replace(/[^\d,]/g, "").slice(0, 7))}
              prefix={<span className="text-caption font-bold">CPA R$</span>} className="num w-[130px] !pl-[60px]" />
          )}
          <SegmentedControl ariaLabel="Janela simulada" size="sm" value={days} onValueChange={setDays}
            options={[{ value: "14", label: "14d" }, { value: "30", label: "30d" }, { value: "60", label: "60d" }]} />
        </div>
      </header>

      {!r.simulable ? (
        <InlineNotice tone="warning" icon={<Info />}>{r.reason}</InlineNotice>
      ) : r.events.length === 0 ? (
        <EmptyState compact icon={<History />} title="A regra não teria disparado"
          description={`Nenhuma campanha atingiu a condição entre ${formatDateShort(r.window.from)} e ${formatDateShort(r.window.to)}.${needsCpa ? " Experimente outra meta de CPA." : ""}`} />
      ) : (
        <>
          <dl className="grid grid-cols-2 overflow-hidden rounded-md border border-line bg-surface sm:grid-cols-4">
            {[
              { k: "Disparos", v: formatValue(r.events.length, "integer"), hint: `${EFFECT_LABEL[effect]} ${r.events.length} vez(es) na janela` },
              { k: "Campanhas", v: formatValue(r.campaignsAffected, "integer"), hint: "Campanhas distintas afetadas" },
              { k: "Investimento", v: effect === "alert" ? "—" : `${r.spendDelta > 0 ? "+" : "−"}${formatValue(Math.abs(r.spendDelta), "currency0")}`, hint: effect === "pause" ? "Gasto evitado nos dias pausados" : effect === "scale" ? "Gasto adicional pelos aumentos" : "Avisos não alteram o gasto", tone: effect === "pause" ? "text-positive" : undefined },
              { k: effect === "pause" ? "Conversões perdidas" : "Conversões", v: effect === "alert" ? "—" : `${r.convDelta > 0 ? "+" : r.convDelta < 0 ? "−" : ""}${formatValue(Math.abs(Math.round(r.convDelta)), "integer")}`, hint: "Estimadas com a taxa observada no dia", tone: effect === "pause" && r.convDelta < 0 ? "text-negative" : effect === "scale" ? "text-positive" : undefined },
            ].map((m) => (
              <div key={m.k} className="flex flex-col gap-1 p-3 [box-shadow:inset_-1px_-1px_0_var(--line)]">
                <Tooltip content={m.hint}><dt tabIndex={0} className="t-label cursor-help !text-[10px]">{m.k}</dt></Tooltip>
                <dd className={cn("num text-headline font-bold", m.tone)}>{m.v}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-col gap-1.5">
            <span className="t-label !text-[10px]">Disparos por dia</span>
            <div role="img" aria-label={`Disparos por dia: ${r.events.length} no total`} className="flex h-14 items-end gap-[2px]">
              {r.daily.map((d) => (
                <Tooltip key={d.date.getTime()} content={`${formatDateShort(d.date)} · ${d.events} disparo(s)`}>
                  <span className={cn("flex-1 rounded-t-[2px]", d.events ? "bg-accent" : "bg-bar-idle")} style={{ height: d.events ? `${Math.max(12, (d.events / maxDaily) * 100)}%` : "4px" }} />
                </Tooltip>
              ))}
            </div>
            <div className="num flex justify-between t-caption"><span>{formatDateShort(r.window.from)}</span><span>{formatDateShort(r.window.to)}</span></div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="t-label !text-[10px]">Disparos mais recentes</span>
            <ul className="flex max-h-[184px] flex-col overflow-y-auto rounded-md border border-line bg-surface">
              {r.events.slice(0, 12).map((e, i) => (
                <li key={i} className="flex items-center gap-3 border-b border-line-soft px-3 py-2 last:border-b-0">
                  <span className="num w-14 shrink-0 whitespace-nowrap font-mono text-[11px] text-text-dim">{formatDateShort(e.date)}</span>
                  <PlatformDot id={e.campaign.platform} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-secondary font-semibold">{e.campaign.name}</span>
                    <span className="num truncate t-caption">{e.detail}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.05em] text-text-muted">{EFFECT_LABEL[e.effect]}</span>
                </li>
              ))}
            </ul>
            {r.events.length > 12 && <span className="t-caption">+{r.events.length - 12} disparos anteriores</span>}
          </div>
        </>
      )}

      <p className="flex items-start gap-1.5 t-caption">
        <Info className="mt-px size-3.5 shrink-0" />
        Estimativa sobre os dados fictícios, no nível de campanha. Uma pausa evita o gasto do dia seguinte; um aumento é aplicado ao dia seguinte com o retorno observado. Resultados reais variam com o leilão.
      </p>
    </section>
  );
}
