import { Bell, Monitor, Moon, Palette, Sun, UserRound, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { useLocalState } from "@/lib/useLocalState";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Avatar, StatusBadge, Tag } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Controls";
import { Input } from "@/components/ui/Input";
import { Select, Tooltip } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";

const SECTIONS = [
  { id: "perfil", label: "Perfil", icon: UserRound },
  { id: "preferencias", label: "Preferências", icon: Palette },
  { id: "equipe", label: "Equipe", icon: Users },
  { id: "notificacoes", label: "Notificações", icon: Bell },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

/** Grupo de configurações: linhas com rótulo/descrição à esquerda e controle à direita (padrão da referência). */
function SettingsGroup({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div><h2 className="t-title">{title}</h2>{description && <p className="t-secondary">{description}</p>}</div>
      <div className="panel divide-y divide-line-soft">{children}</div>
    </section>
  );
}
function Row({ label, description, children, stack }: { label: string; description?: string; children: ReactNode; stack?: boolean }) {
  return (
    <div className={cn("flex gap-4 px-4 py-4", stack ? "flex-col" : "flex-col sm:flex-row sm:items-center sm:justify-between")}>
      <div className="flex max-w-[420px] flex-col gap-0.5"><span className="text-body font-semibold">{label}</span>{description && <span className="t-secondary">{description}</span>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ThemeCard({ value, label, icon, active, onClick }: { value: ThemePreference; label: string; icon: ReactNode; active: boolean; onClick: () => void }) {
  const preview = (t: "dark" | "light") => (
    <div data-theme={t} className="flex h-16 gap-1 overflow-hidden rounded-sm bg-canvas p-1.5">
      <div className="w-5 rounded-[3px] bg-surface" />
      <div className="flex flex-1 flex-col gap-1"><div className="h-2 w-2/3 rounded-[2px] bg-surface" /><div className="flex-1 rounded-[3px] bg-surface" /><div className="h-2 w-6 self-end rounded-[2px] bg-accent" /></div>
    </div>
  );
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick}
      className={cn("flex w-[148px] flex-col gap-2 rounded-md border p-2 text-left transition-colors", active ? "border-accent-line-strong bg-accent-tint" : "border-line hover:border-line-strong")}>
      {value === "system" ? <div className="grid grid-cols-2 gap-1">{preview("dark")}{preview("light")}</div> : preview(value)}
      <span className="flex items-center gap-1.5 px-0.5 text-secondary font-bold [&_svg]:size-3.5">{icon}{label}</span>
    </button>
  );
}

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const section = (SECTIONS.find((s) => s.id === params.get("secao"))?.id ?? "perfil") as SectionId;
  const { preference, setPreference } = useTheme();
  const toast = useToast();
  const [name, setName] = useLocalState("ninepro.profile.name", "Gestor Demo");
  const [draftName, setDraftName] = useState(name);
  const [tz, setTz] = useLocalState("ninepro.pref.tz", "America/Sao_Paulo");
  const [currency, setCurrency] = useLocalState("ninepro.pref.currency", "BRL");
  const [notif, setNotif] = useLocalState("ninepro.pref.notif", { spike: true, rules: true, leads: false, weekly: true });

  return (
    <Page>
      <PageHeader title="Configurações" description="Preferências pessoais e da equipe. Tudo nesta versão fica salvo apenas neste navegador." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Seções de configurações" className="flex gap-1 overflow-x-auto lg:flex-col">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" onClick={() => setParams({ secao: s.id })} aria-current={section === s.id ? "page" : undefined}
              className={cn("flex h-9 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-body font-semibold transition-colors", section === s.id ? "bg-soft text-text" : "text-text-muted hover:bg-surface-2 hover:text-text")}>
              <s.icon className="size-4" />{s.label}
            </button>
          ))}
        </nav>

        <div className="flex max-w-[860px] flex-col gap-8">
          {section === "perfil" && (
            <SettingsGroup title="Perfil" description="Como você aparece para a equipe.">
              <Row label="Foto" description="JPG ou PNG, até 5 MB."><div className="flex items-center gap-3"><Avatar name={name} size={44} /><Tooltip content="Upload chega com autenticação"><span tabIndex={0}><Button size="sm" disabled>Enviar foto</Button></span></Tooltip></div></Row>
              <Row label="Nome" description="Exibido no menu e nos registros de alteração.">
                <div className="flex gap-2"><Input value={draftName} onChange={(e) => setDraftName(e.target.value)} wrapperClassName="w-full sm:w-[240px]" />
                  <Button variant="primary" disabled={!draftName.trim() || draftName === name} onClick={() => { setName(draftName.trim()); toast({ tone: "success", title: "Nome atualizado" }); }}>Salvar</Button></div>
              </Row>
              <Row label="E-mail de acesso" description="Gerenciado pelo provedor de login."><span className="t-secondary">Sem autenticação nesta versão</span></Row>
            </SettingsGroup>
          )}

          {section === "preferencias" && (
            <>
              <SettingsGroup title="Aparência" description="Os dois temas compartilham a mesma hierarquia e os mesmos tokens semânticos.">
                <Row label="Tema" stack>
                  <div role="radiogroup" aria-label="Tema" className="flex flex-wrap gap-3">
                    <ThemeCard value="dark" label="Escuro" icon={<Moon />} active={preference === "dark"} onClick={() => setPreference("dark")} />
                    <ThemeCard value="light" label="Claro" icon={<Sun />} active={preference === "light"} onClick={() => setPreference("light")} />
                    <ThemeCard value="system" label="Sistema" icon={<Monitor />} active={preference === "system"} onClick={() => setPreference("system")} />
                  </div>
                </Row>
              </SettingsGroup>
              <SettingsGroup title="Região">
                <Row label="Fuso horário" description="Usado em relatórios e regras com horário."><Select className="w-[240px]" value={tz} onValueChange={setTz} options={[{ value: "America/Sao_Paulo", label: "Brasília (GMT−3)" }, { value: "America/Manaus", label: "Manaus (GMT−4)" }, { value: "America/Noronha", label: "Fernando de Noronha (GMT−2)" }]} /></Row>
                <Row label="Moeda" description="Moeda de exibição. Valores não são convertidos."><Select className="w-[240px]" value={currency} onValueChange={setCurrency} options={[{ value: "BRL", label: "Real (R$)" }, { value: "USD", label: "Dólar (US$) — em breve", disabled: true }]} /></Row>
              </SettingsGroup>
            </>
          )}

          {section === "equipe" && (
            <SettingsGroup title="Equipe" description="Quem acessa este espaço de trabalho. Dados fictícios.">
              {[["Gestor Demo", "Administrador", "Ativo"], ["Ana Lima", "Analista de mídia", "Ativo"], ["Pedro Rocha", "Visualizador", "Convite pendente"]].map(([n, r, s]) => (
                <div key={n} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={n} size={32} />
                  <div className="flex flex-1 flex-col"><span className="text-body font-semibold">{n}</span><span className="t-caption">{r}</span></div>
                  <StatusBadge tone={s === "Ativo" ? "positive" : "warning"}>{s}</StatusBadge>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3"><Tag>Convites exigem autenticação</Tag><Button size="sm" disabled>Convidar</Button></div>
            </SettingsGroup>
          )}

          {section === "notificacoes" && (
            <SettingsGroup title="Notificações" description="O que merece interromper o seu dia.">
              {([["spike", "Picos de gasto", "Quando uma campanha passa do ritmo esperado."], ["rules", "Ações de regras", "Toda vez que uma regra pausar ou escalar algo."], ["leads", "Cada novo lead", "Pode ser muito volume em campanhas de captação."], ["weekly", "Resumo semanal", "Segunda-feira, 8h, por e-mail."]] as const).map(([k, l, d]) => (
                <div key={k} className="px-4 py-4"><Switch checked={notif[k]} onCheckedChange={(v) => setNotif({ ...notif, [k]: v })} label={l} description={d} /></div>
              ))}
            </SettingsGroup>
          )}
        </div>
      </div>
    </Page>
  );
}
