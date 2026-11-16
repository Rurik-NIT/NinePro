import { Monitor, Moon, Sun } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { useLocalState } from "@/lib/useLocalState";
import { SETTINGS_NAV } from "@/config/navigation";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tooltip } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { AiProvidersSection, ConnectedAppsSection, DangerSection, LeaderboardSection, NotificationsSection, RetentionSection, SecuritySection, SlackSection, SsoSection, WhiteLabelSection } from "./settings/Sections";

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
    <button type="button" role="radio" aria-checked={active} onClick={onClick} className={cn("flex w-[148px] flex-col gap-2 rounded-md border p-2 text-left transition-colors", active ? "border-accent-line-strong bg-accent-tint" : "border-line hover:border-line-strong")}>
      {value === "system" ? <div className="grid grid-cols-2 gap-1">{preview("dark")}{preview("light")}</div> : preview(value)}
      <span className="flex items-center gap-1.5 px-0.5 text-secondary font-bold [&_svg]:size-3.5">{icon}{label}</span>
    </button>
  );
}

export default function Settings() {
  const [params] = useSearchParams();
  const sectionKey = params.get("secao") ?? "perfil";
  const section = SETTINGS_NAV.children![0].items.find((l) => l.path.endsWith(`secao=${sectionKey}`));
  const { preference, setPreference } = useTheme();
  const toast = useToast();
  const [name, setName] = useLocalState("ninepro.profile.name", "Gestor Demo");
  const [draftName, setDraftName] = useState(name);

  return (
    <Page>
      <PageHeader title={section?.label ?? "Configurações"} />
      <div className={cn("flex flex-col gap-8", sectionKey === "marca-propria" ? "max-w-[1200px]" : "max-w-[860px]")}>
        {sectionKey === "perfil" && (
          <>
            <SettingsGroup title="Perfil" description="Como você aparece para a equipe.">
              <Row label="Foto" description="JPEG, PNG, WebP ou GIF, até 5 MB."><div className="flex items-center gap-3"><Avatar name={name} size={44} /><Tooltip content="Upload chega com autenticação"><span tabIndex={0}><Button size="sm" disabled>Enviar</Button></span></Tooltip><Button size="sm" variant="danger" disabled>Remover</Button></div></Row>
              <Row label="Nome">
                <div className="flex gap-2"><Input value={draftName} onChange={(e) => setDraftName(e.target.value)} wrapperClassName="w-full sm:w-[240px]" />
                  <Button variant="primary" disabled={!draftName.trim() || draftName === name} onClick={() => { setName(draftName.trim()); toast({ tone: "success", title: "Nome atualizado" }); }}>Salvar</Button></div>
              </Row>
            </SettingsGroup>
            <SettingsGroup title="Acesso" description="O e-mail e a senha com que você entra.">
              <Row label="E-mail" description="Gerenciado pelo provedor de login."><span className="t-secondary">Sem autenticação nesta versão</span></Row>
            </SettingsGroup>
            <SettingsGroup title="Aparência" description="Os dois temas compartilham a mesma hierarquia e os mesmos tokens semânticos.">
              <Row label="Tema" stack>
                <div role="radiogroup" aria-label="Tema" className="flex flex-wrap gap-3">
                  <ThemeCard value="dark" label="Escuro" icon={<Moon />} active={preference === "dark"} onClick={() => setPreference("dark")} />
                  <ThemeCard value="light" label="Claro" icon={<Sun />} active={preference === "light"} onClick={() => setPreference("light")} />
                  <ThemeCard value="system" label="Sistema" icon={<Monitor />} active={preference === "system"} onClick={() => setPreference("system")} />
                </div>
              </Row>
            </SettingsGroup>
          </>
        )}

        {sectionKey === "seguranca" && <SecuritySection />}
        {sectionKey === "retencao" && <RetentionSection />}
        {sectionKey === "notificacoes" && <NotificationsSection />}
        {sectionKey === "apps" && <ConnectedAppsSection />}
        {sectionKey === "slack" && <SlackSection />}
        {sectionKey === "ranking" && <LeaderboardSection />}
        {sectionKey === "ia" && <AiProvidersSection />}
        {sectionKey === "marca-propria" && <WhiteLabelSection />}
        {sectionKey === "sso" && <SsoSection />}
        {sectionKey === "perigo" && <DangerSection />}
      </div>
    </Page>
  );
}
