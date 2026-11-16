import { Cable, Check, Lock, ShoppingCart, Webhook } from "lucide-react";
import { useState } from "react";
import { ConnectionsOnboarding, resetOnboarding } from "./connections/Onboarding";
import { PLATFORMS, PLATFORM_ORDER, type PlatformId } from "@/data/demo";
import { Page, PageHeader, Section } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Menu";
import { InlineNotice } from "@/components/feedback/States";
import { PlatformDot } from "@/components/data/Platform";
import { useAuth } from "@/lib/auth";
import { MetaConnection } from "./connections/MetaConnection";

const SCOPES: Record<PlatformId, string[]> = {
  meta: ["Campanhas", "Conjuntos", "Anúncios", "Leads", "Públicos"],
  google: ["Campanhas", "Palavras-chave", "Termos de pesquisa", "Conversões"],
  tiktok: ["Campanhas", "Anúncios", "Leads"],
  linkedin: ["Campanhas", "Leads", "Públicos"],
};

/**
 * Conexões — honestidade sobre o estado real: nenhuma integração existe nesta versão.
 * Os botões ficam desabilitados com explicação, em vez de simular OAuth.
 */
function ConnectionsList({ onRedo }: { onRedo?: () => void }) {
  const live = useAuth().mode === "supabase";
  return (
    <Page>
      <PageHeader title="Conexões" description="Contas, números e fontes de conversão. Todo dado exibido no NinePro virá daqui." actions={onRedo ? <Button variant="ghost" onClick={onRedo}>Refazer configuração inicial</Button> : undefined} />
      {!live && (
        <InlineNotice tone="info" icon={<Lock />}>
          Modo demonstração: nenhuma integração está ativa e o restante do app usa dados fictícios.
        </InlineNotice>
      )}

      <Section title="Plataformas de anúncio" description="Leitura de métricas e, quando permitido, controle de veiculação.">
        <ul className="grid grid-cols-1 gap-gutter md:grid-cols-2">
          {live && <MetaConnection />}
          {PLATFORM_ORDER.filter((p) => !(live && p === "meta")).map((p) => (
            <li key={p} className="panel flex flex-col gap-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-md border border-line bg-surface-2"><PlatformDot id={p} className="size-3.5" /></span>
                  <div className="flex flex-col"><span className="t-title">{PLATFORMS[p].label}</span><span className="t-caption">Não conectada</span></div>
                </div>
                {live ? <Tag>Em breve</Tag> : (
                  <Tooltip content="Disponível quando a integração for implementada">
                    <span tabIndex={0}><Button size="sm" icon={<Cable />} disabled>Conectar</Button></span>
                  </Tooltip>
                )}
              </div>
              <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
                <span className="t-label !text-[10px]">Dados que serão lidos</span>
                <div className="flex flex-wrap gap-1.5">{SCOPES[p].map((s) => <Tag key={s}>{s}</Tag>)}</div>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Fontes de conversão" description="Para atribuir vendas e leads às campanhas.">
        <div className="panel divide-y divide-line-soft">
          {[
            { icon: <ShoppingCart />, name: "Loja virtual", desc: "Pedidos e receita por campanha" },
            { icon: <Webhook />, name: "API de eventos", desc: "Envio de conversões do seu backend" },
            { icon: <Check />, name: "Tag do site", desc: "Visitas e eventos no navegador" },
          ].map((s) => (
            <div key={s.name} className="flex items-center gap-3 px-4 py-3.5">
              <span className="grid size-8 place-items-center rounded-md bg-surface-2 text-text-muted [&_svg]:size-4">{s.icon}</span>
              <div className="flex flex-1 flex-col"><span className="text-body font-semibold">{s.name}</span><span className="t-caption">{s.desc}</span></div>
              <Tag>Em breve</Tag>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  );
}

export default function Connections() {
  const live = useAuth().mode === "supabase";
  const read = () => { try { return !!JSON.parse(localStorage.getItem("ninepro.onboarding.v2") ?? "{}").done; } catch { return false; } };
  const [done, setDone] = useState(read);
  if (live) return <ConnectionsList />;
  return done ? <ConnectionsList onRedo={() => { resetOnboarding(); setDone(false); }} /> : <ConnectionsOnboarding onFinish={() => setDone(true)} />;
}
