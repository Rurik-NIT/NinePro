import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { ThemeCustomizerSection } from "./settings/ThemeCustomizer";
import { useLocalState } from "@/lib/useLocalState";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { supabase } from "@/lib/supabase";
import { LIVE_HIDDEN, SETTINGS_NAV } from "@/config/navigation";
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
  const rawKey = params.get("secao") ?? "perfil";
  const rawSection = SETTINGS_NAV.children![0].items.find((l) => l.path.endsWith(`secao=${rawKey}`));
  // Com banco conectado, seções que ainda não funcionam de verdade caem no Perfil
  const hiddenLive = useAuth().mode === "supabase" && !!rawSection && LIVE_HIDDEN.has(rawSection.id);
  const sectionKey = hiddenLive ? "perfil" : rawKey;
  const section = hiddenLive ? SETTINGS_NAV.children![0].items[0] : rawSection;
  const { preference, setPreference } = useTheme();
  const toast = useToast();
  const auth = useAuth();
  const ws = useWorkspace();
  const live = auth.mode === "supabase";
  const [localName, setLocalName] = useLocalState("ninepro.profile.name", "Gestor Demo");
  const name = live ? ws.profileName : localName;
  const [draftName, setDraftName] = useState(name);
  useEffect(() => { setDraftName(name); }, [name]);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState<"nome" | "senha" | null>(null);
  const saveName = async () => {
    const n = draftName.trim();
    if (!live) { setLocalName(n); toast({ tone: "success", title: "Nome atualizado" }); return; }
    setBusy("nome");
    const { error } = await supabase!.from("profiles").update({ full_name: n }).eq("id", auth.user!.id);
    setBusy(null);
    if (error) { toast({ tone: "error", title: "Não foi possível salvar", description: error.message }); return; }
    await ws.reload();
    toast({ tone: "success", title: "Nome atualizado" });
  };
  const savePassword = async () => {
    setBusy("senha");
    const { error } = await supabase!.auth.updateUser({ password: pw });
    setBusy(null);
    if (error) { toast({ tone: "error", title: "Não foi possível trocar a senha", description: /same|different/i.test(error.message) ? "A nova senha precisa ser diferente da atual." : error.message }); return; }
    setPw(""); setPw2("");
    toast({ tone: "success", title: "Senha alterada", description: "Use a nova senha no próximo acesso." });
  };

  return (
    <Page>
      <PageHeader title={section?.label ?? "Configurações"} />
      <div className={cn("flex flex-col gap-8", sectionKey === "marca-propria" || sectionKey === "tema" ? "max-w-[1200px]" : "max-w-[860px]")}>
        {sectionKey === "perfil" && (
          <>
            <SettingsGroup title="Perfil" description="Como você aparece para a equipe.">
              <Row label="Foto" description="JPEG, PNG, WebP ou GIF, até 5 MB."><div className="flex items-center gap-3"><Avatar name={name} size={44} /><Tooltip content="Envio de foto chega em breve"><span tabIndex={0}><Button size="sm" disabled>Enviar</Button></span></Tooltip><Button size="sm" variant="danger" disabled>Remover</Button></div></Row>
              <Row label="Nome">
                <div className="flex gap-2"><Input value={draftName} onChange={(e) => setDraftName(e.target.value)} wrapperClassName="w-full sm:w-[240px]" />
                  <Button variant="primary" loading={busy === "nome"} disabled={draftName.trim().length < 2 || draftName.trim() === name} onClick={() => void saveName()}>Salvar</Button></div>
              </Row>
            </SettingsGroup>
            <SettingsGroup title="Acesso" description="O e-mail e a senha com que você entra.">
              <Row label="E-mail" description="Para trocar o e-mail, fale com o administrador."><span className="t-secondary">{live ? auth.user?.email : "Modo demonstração"}</span></Row>
              {live && (
                <Row label="Nova senha" description="Pelo menos 8 caracteres." stack>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Nova senha" autoComplete="new-password" aria-label="Nova senha" wrapperClassName="w-full sm:w-[220px]" />
                    <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repita a nova senha" autoComplete="new-password" aria-label="Repita a nova senha" invalid={!!pw2 && pw2 !== pw} wrapperClassName="w-full sm:w-[220px]" />
                    <Button variant="primary" loading={busy === "senha"} disabled={pw.length < 8 || pw !== pw2} onClick={() => void savePassword()}>Trocar senha</Button>
                  </div>
                </Row>
              )}
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

        {sectionKey === "tema" && <ThemeCustomizerSection />}
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
