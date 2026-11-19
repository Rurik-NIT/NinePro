/** Personalizador de tema: cores da marca e da interface, modo, predefinidos, prévia ao vivo e contraste (WCAG AA). */
import { AlertTriangle, Building2, Check, Monitor, Moon, RotateCcw, Sun, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { contrastReport, DEFAULT_SPEC, isHex, normalizeSpec, PRESETS, sameSpec, type BrandColors, type Mode, type ThemeSpec, type UiColors } from "@/lib/themeEngine";
import { loadThemes, resolveTheme, saveUserTheme, saveWorkspaceTheme, type UserThemeRow, type WorkspaceThemeRow } from "@/lib/themeStore";
import { cn } from "@/lib/cn";
import { Tag } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Controls";
import { SegmentedControl } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { InlineNotice, LoadingState } from "@/components/feedback/States";
import { Group, Row } from "./Sections";

const BRAND: { key: keyof BrandColors; label: string; hint: string }[] = [
  { key: "primary", label: "Primária", hint: "Botão principal, item ativo e foco" },
  { key: "secondary", label: "Secundária", hint: "Gráficos (série 1) e informações" },
  { key: "tertiary", label: "Terciária", hint: "Gráficos (série 2)" },
  { key: "accent", label: "Destaque", hint: "Gráficos (série 3) e indicadores" },
];
const UI: { key: keyof UiColors; label: string; hint: string }[] = [
  { key: "background", label: "Fundo", hint: "Atrás de tudo" },
  { key: "sidebar", label: "Barra lateral", hint: "Menu de navegação" },
  { key: "card", label: "Cards", hint: "Painéis, modais e menus" },
  { key: "table", label: "Tabelas", hint: "Cabeçalho e linha selecionada" },
  { key: "border", label: "Bordas", hint: "Divisórias e contornos" },
  { key: "text", label: "Textos", hint: "Os tons secundários saem desta cor" },
];
const MODES: { value: ThemePreference; label: string; icon: JSX.Element }[] = [
  { value: "light", label: "Claro", icon: <Sun /> }, { value: "dark", label: "Escuro", icon: <Moon /> }, { value: "system", label: "Automático", icon: <Monitor /> },
];

function ColorField({ label, hint, value, onChange, disabled }: { label: string; hint: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className={cn("flex items-center gap-3 rounded-md border border-line p-2.5", disabled && "opacity-60")}>
      <input type="color" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={label} className="size-9 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0.5 disabled:cursor-not-allowed" />
      <span className="flex min-w-0 flex-1 flex-col"><span className="text-secondary font-semibold">{label}</span><span className="t-caption truncate">{hint}</span></span>
      <input value={text} disabled={disabled} maxLength={7} aria-label={`${label} (hexadecimal)`} onChange={(e) => { const v = e.target.value.trim(); setText(v); const h = v.startsWith("#") ? v : `#${v}`; if (isHex(h)) onChange(h.toLowerCase()); }}
        className="h-8 w-[84px] rounded-sm border border-line bg-surface-2 px-2 font-mono text-[12px] text-text uppercase outline-none focus:border-accent-line-strong" />
    </label>
  );
}

function Swatches({ spec, mode }: { spec: ThemeSpec; mode: Mode }) {
  const ui = spec[mode];
  return (
    <span className="flex h-10 w-full overflow-hidden rounded-sm border border-line" style={{ background: ui.background }}>
      <span className="w-1/4" style={{ background: ui.sidebar, borderRight: `1px solid ${ui.border}` }} />
      <span className="flex flex-1 items-center gap-1 px-1.5"><span className="h-5 flex-1 rounded-[3px]" style={{ background: ui.card, border: `1px solid ${ui.border}` }} />{Object.values(spec.brand).map((c, i) => <span key={i} className="size-3 rounded-full" style={{ background: c }} />)}</span>
    </span>
  );
}

/** Amostra fixa: mostra os tokens aplicados (o app inteiro também muda durante a prévia). */
function Sample() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-canvas p-3">
      <div className="flex gap-3">
        <div className="hidden w-28 shrink-0 flex-col gap-1 rounded-md border border-line bg-[var(--sidebar)] p-2 sm:flex">
          <span className="rounded-sm bg-soft px-2 py-1 text-[12px] font-semibold text-text">Início</span>
          <span className="px-2 py-1 text-[12px] text-text-muted">Publicações</span>
          <span className="px-2 py-1 text-[12px] text-text-muted">Análises</span>
        </div>
        <div className="panel flex flex-1 flex-col gap-2 p-3">
          <span className="t-title">Card de exemplo</span>
          <span className="t-secondary">Texto secundário para leitura longa.</span>
          <span className="t-caption">Legenda e detalhes</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary">Ação principal</Button>
            <Button size="sm">Secundária</Button>
            <Tag tone="info">Info</Tag><span className="text-[12px] font-semibold text-accent-text">Link em destaque</span>
          </div>
          <div className="overflow-hidden rounded-md border border-line text-[12px]">
            <div className="flex bg-[var(--table-head)] px-2 py-1 t-label"><span className="flex-1">Coluna</span><span>Valor</span></div>
            <div className="flex border-t border-line-soft px-2 py-1"><span className="flex-1">Linha</span><span className="num">1.234</span></div>
            <div className="flex border-t border-line-soft bg-accent-tint px-2 py-1"><span className="flex-1">Selecionada</span><span className="num">567</span></div>
          </div>
          <div className="flex h-10 items-end gap-1">{["--series-1", "--series-2", "--series-3", "--series-1", "--series-2"].map((v, i) => <span key={i} className="flex-1 rounded-t-[3px]" style={{ height: `${40 + ((i * 23) % 60)}%`, background: `var(${v})` }} />)}</div>
        </div>
      </div>
    </div>
  );
}

export function ThemeCustomizerSection() {
  const toast = useToast();
  const auth = useAuth();
  const { current } = useWorkspace();
  const live = auth.mode === "supabase";
  const admin = !live || current?.role === "owner" || current?.role === "admin";
  const { theme, preference, setPreference, setSpec, setPreview } = useTheme();
  const [rows, setRows] = useState<{ user: UserThemeRow | null; ws: WorkspaceThemeRow | null } | null>(live ? null : { user: null, ws: null });
  const [scope, setScope] = useState<"pessoal" | "empresa">("pessoal");
  const [draft, setDraft] = useState<ThemeSpec>(DEFAULT_SPEC);
  const [follow, setFollow] = useState(true);
  const [mode, setMode] = useState<ThemePreference>(preference);
  const [editMode, setEditMode] = useState<Mode>(theme);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (live && auth.user) void loadThemes(auth.user.id, current?.id ?? null).then(setRows); }, [live, auth.user, current?.id]);
  const wsSpec = useMemo(() => (rows?.ws && Object.keys((rows.ws.theme as object) ?? {}).length ? normalizeSpec(rows.ws.theme) : DEFAULT_SPEC), [rows]);
  const userSpec = useMemo(() => (rows?.user && Object.keys((rows.user.theme as object) ?? {}).length ? normalizeSpec(rows.user.theme) : null), [rows]);
  // ao abrir ou trocar de aba, o rascunho parte do que está salvo
  useEffect(() => {
    if (!rows) return;
    if (scope === "empresa") { setDraft(wsSpec); setMode(rows.ws?.default_mode ?? "dark"); }
    else { setFollow(rows.user ? rows.user.use_workspace : true); setDraft(userSpec ?? wsSpec); setMode(rows.user?.mode ?? preference); }
  }, [rows, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  // prévia ao vivo no app inteiro enquanto esta tela estiver aberta
  const previewSpec = scope === "pessoal" && follow ? wsSpec : draft;
  useEffect(() => { setPreview({ spec: previewSpec, mode: editMode }); }, [previewSpec, editMode, setPreview]);
  useEffect(() => () => setPreview(null), [setPreview]);

  if (!rows) return <LoadingState />;
  const readOnly = scope === "empresa" && !admin;
  const locked = readOnly || (scope === "pessoal" && follow);
  const report = contrastReport(previewSpec, editMode);
  const fails = report.filter((r) => !r.ok);
  const setBrand = (k: keyof BrandColors, v: string) => setDraft((d) => ({ ...d, preset: undefined, brand: { ...d.brand, [k]: v } }));
  const setUi = (k: keyof UiColors, v: string) => setDraft((d) => ({ ...d, preset: undefined, [editMode]: { ...d[editMode], [k]: v } }));
  const savedDraft = scope === "empresa" ? wsSpec : (userSpec ?? wsSpec);
  const dirty = scope === "empresa" ? !sameSpec(draft, wsSpec) || mode !== (rows.ws?.default_mode ?? "dark") : !sameSpec(draft, savedDraft) || follow !== (rows.user ? rows.user.use_workspace : true) || mode !== (rows.user?.mode ?? preference);

  const save = async () => {
    setBusy(true);
    let error: string | null = null;
    if (!live) { setSpec(follow && scope === "pessoal" ? null : draft); setPreference(mode); }
    else if (scope === "empresa") error = (await saveWorkspaceTheme(current!.id, auth.user!.id, { theme: sameSpec(draft, DEFAULT_SPEC) ? {} : draft, default_mode: mode })).error;
    else error = (await saveUserTheme(auth.user!.id, { mode, use_workspace: follow, theme: follow ? (rows.user?.theme ?? {}) : draft })).error;
    if (error) { toast({ tone: "error", title: "Não foi possível salvar", description: error }); setBusy(false); return; }
    if (live) {
      const fresh = await loadThemes(auth.user!.id, current?.id ?? null);
      setRows(fresh);
      const r = resolveTheme(fresh.user, fresh.ws);
      setSpec(r.spec); if (scope === "pessoal" || !fresh.user) setPreference(r.mode ?? mode);
    }
    toast({ tone: "success", title: scope === "empresa" ? "Tema da empresa salvo" : "Seu tema foi salvo", description: scope === "empresa" ? "Vale para todos do espaço que seguem o tema da empresa." : "Vale em qualquer dispositivo em que você entrar." });
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-8">
      {live && (
        <SegmentedControl ariaLabel="De quem é o tema" value={scope} onValueChange={(v) => setScope(v as typeof scope)} options={[{ value: "pessoal", label: "Meu tema", icon: <UserRound /> }, { value: "empresa", label: `Tema da empresa${current ? ` (${current.name})` : ""}`, icon: <Building2 /> }]} />
      )}
      {scope === "pessoal" && live && (
        <Group title="Seguir a empresa" description="O dono ou um admin do espaço define a identidade visual da empresa. Você pode usar a sua própria.">
          <Row label="Usar o tema da empresa" description={follow ? "As cores vêm do tema da empresa. Desligue para personalizar só para você." : "Você está usando as suas cores. Ligue para voltar ao tema da empresa."}>
            <Switch checked={follow} ariaLabel="Usar o tema da empresa" onCheckedChange={(v) => { setFollow(v); if (!v) setDraft(userSpec ?? wsSpec); }} />
          </Row>
        </Group>
      )}
      {readOnly && <InlineNotice tone="info">Só o dono ou um admin do espaço altera o tema da empresa. Você pode personalizar o seu em "Meu tema".</InlineNotice>}

      <Group title="Modo de aparência" description={scope === "empresa" ? "Padrão para quem ainda não escolheu. Cada pessoa pode trocar o seu." : "Claro, escuro ou automático (segue o sistema do aparelho)."}>
        <div role="radiogroup" aria-label="Modo" className="flex flex-wrap gap-2">
          {MODES.map((m) => <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} disabled={readOnly} onClick={() => { setMode(m.value); if (m.value !== "system") setEditMode(m.value); }}
            className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-secondary font-semibold [&_svg]:size-4", mode === m.value ? "border-accent-line-strong bg-accent-tint" : "border-line hover:border-line-strong", readOnly && "opacity-60")}>{m.icon}{m.label}</button>)}
        </div>
      </Group>

      <Group title="Temas prontos" description="Um ponto de partida. Depois ajuste qualquer cor.">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {PRESETS.map((p) => { const on = sameSpec(previewSpec, p.spec); return (
            <button key={p.id} type="button" disabled={locked} onClick={() => setDraft(p.spec)} className={cn("flex flex-col gap-2 rounded-md border p-2 text-left", on ? "border-accent-line-strong bg-accent-tint" : "border-line hover:border-line-strong", locked && "cursor-not-allowed opacity-60")}>
              <Swatches spec={p.spec} mode={editMode} />
              <span className="flex items-center gap-1 text-secondary font-semibold">{on && <Check className="size-3.5" />}{p.name}</span>
            </button>); })}
        </div>
      </Group>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <Group title="Cores principais" description="Valem para o modo claro e para o escuro.">
            <div className="grid gap-2 md:grid-cols-2">{BRAND.map((f) => <ColorField key={f.key} label={f.label} hint={f.hint} value={previewSpec.brand[f.key]} disabled={locked} onChange={(v) => setBrand(f.key, v)} />)}</div>
          </Group>
          <Group title="Cores da interface" description="Cada modo tem as suas. Escolha qual está editando (a prévia acompanha).">
            <SegmentedControl ariaLabel="Modo em edição" value={editMode} onValueChange={(v) => setEditMode(v as Mode)} options={[{ value: "light", label: "Editando o claro", icon: <Sun /> }, { value: "dark", label: "Editando o escuro", icon: <Moon /> }]} />
            <div className="mt-3 grid gap-2 md:grid-cols-2">{UI.map((f) => <ColorField key={f.key} label={f.label} hint={f.hint} value={previewSpec[editMode][f.key]} disabled={locked} onChange={(v) => setUi(f.key, v)} />)}</div>
          </Group>
        </div>
        <div className="flex flex-col gap-3 xl:sticky xl:top-4 xl:self-start">
          <span className="text-secondary font-semibold text-text-soft">Prévia ({editMode === "light" ? "claro" : "escuro"}) — o app inteiro já mostra as cores, sem salvar</span>
          <Sample />
          <div className="panel flex flex-col gap-1.5 p-3">
            <span className="flex items-center gap-2 text-secondary font-semibold">{fails.length ? <AlertTriangle className="size-4 text-warning" /> : <Check className="size-4 text-positive" />}Contraste (WCAG AA): {fails.length ? `${fails.length} ponto(s) para ajustar` : "tudo legível"}</span>
            <ul className="flex flex-col gap-1">{report.map((r) => (
              <li key={r.id} className="flex flex-col text-[12px]">
                <span className="flex items-center gap-2"><span className={cn("num w-12 font-semibold", r.ok ? "text-positive" : "text-warning")}>{r.ratio.toFixed(1)}:1</span><span className="flex-1 text-text-soft">{r.label}</span><span className="t-caption">mín. {r.min}:1</span></span>
                {!r.ok && r.fix && <span className="pl-14 t-caption text-warning">{r.fix}</span>}
              </li>))}</ul>
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-t border-line bg-canvas/95 px-1 py-3 backdrop-blur">
          <Button variant="ghost" icon={<RotateCcw />} disabled={locked} onClick={() => setDraft(DEFAULT_SPEC)}>Restaurar padrão</Button>
          <span className="flex-1 t-caption">{fails.length ? "Há pontos com contraste baixo. Você pode salvar mesmo assim, mas parte do texto fica difícil de ler." : dirty ? "Alterações não salvas: a prévia some se você sair desta tela." : "Sem alterações."}</span>
          <Button disabled={!dirty} onClick={() => setRows((r) => (r ? { ...r } : r))}>Descartar</Button>
          <Button variant="primary" loading={busy} disabled={!dirty} onClick={() => void save()}>Salvar {scope === "empresa" ? "para a empresa" : "meu tema"}</Button>
        </div>
      )}
    </div>
  );
}
