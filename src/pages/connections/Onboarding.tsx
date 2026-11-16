import { ArrowRight, Bot, Check, Code2, LayoutDashboard, Newspaper, Rss, SkipForward, Terminal, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useLocalState } from "@/lib/useLocalState";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { LogoMark } from "@/components/layout/Logo";

/** Catálogo de conectores observado na referência (31), agrupado por tipo. Sem logos de marca: blocos com iniciais. */
export const CONNECTORS: { group: string; items: string[] }[] = [
  { group: "Redes sociais", items: ["TikTok", "Instagram", "YouTube", "Facebook", "LinkedIn", "X (Twitter)", "Threads", "Bluesky", "Pinterest", "Google Meu Negócio", "Discord", "Slack"] },
  { group: "Sites e lojas", items: ["Shopify", "WordPress", "Wix", "Webflow"] },
  { group: "Mensageria e voz", items: ["WhatsApp", "Telegram", "LINE", "WeChat", "iMessage", "Número de telefone"] },
  { group: "Anúncios", items: ["Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads", "Pinterest Ads", "X Ads", "OpenAI Ads", "Reddit Ads", "Microsoft Ads"] },
];
export const initials = (n: string) => n.replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

type Use = "eu" | "software";
type Work = "painel" | "api" | "agente";
interface State { step: 1 | 2 | 3 | 4; use?: Use; work?: Work; fromShortcut?: boolean; done?: boolean }
const USE_LABEL: Record<Use, string> = { eu: "Vou usar eu mesmo", software: "Vou integrar ao meu software" };
const WORK_LABEL: Record<Work, string> = { painel: "No painel", api: "Pela API", agente: "Com um agente de IA" };

function Step({ n, title, summary, current, done, children }: { n: number; title: string; summary: string; current: boolean; done: boolean; children?: ReactNode }) {
  return (
    <section className={cn("panel overflow-hidden transition-colors", current && "border-line-strong", !current && !done && "opacity-60")} aria-current={current ? "step" : undefined}>
      <header className="flex items-center gap-3 px-5 py-4">
        <span className={cn("num grid size-7 shrink-0 place-items-center rounded-md font-mono text-[12px] font-bold", done ? "bg-accent text-accent-ink" : current ? "bg-text text-text-inverse" : "bg-soft text-text-muted")}>{done ? <Check className="size-4" /> : n}</span>
        <div className="flex min-w-0 flex-col"><h2 className="t-title">{title}</h2>{!current && <p className="truncate t-secondary">{summary}</p>}</div>
      </header>
      {current && <div className="border-t border-line-soft px-5 py-5">{children}</div>}
    </section>
  );
}

function ChoiceCard({ icon, title, text, preview, onClick }: { icon: ReactNode; title: string; text: string; preview: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface text-left transition-colors hover:border-line-strong">
      <div className="flex h-36 items-center justify-center border-b border-line-soft bg-surface-2 p-4">{preview}</div>
      <div className="flex flex-col gap-1.5 p-4">
        <span className="flex items-center justify-between gap-2 t-title"><span className="flex items-center gap-2 [&_svg]:size-4 [&_svg]:text-text-dim">{icon}{title}</span><ArrowRight className="size-4 text-text-dim transition-transform group-hover:translate-x-0.5" /></span>
        <span className="t-secondary">{text}</span>
      </div>
    </button>
  );
}

/**
 * Onboarding de Conexões — fluxo observado na referência: 4 passos sequenciais
 * (o 1º libera os demais), atalho "conecte uma conta primeiro" e "pular configuração".
 */
export function ConnectionsOnboarding({ onFinish }: { onFinish: () => void }) {
  const toast = useToast();
  const [s, setS] = useLocalState<State>("ninepro.onboarding.v2", { step: 1 });
  const go = (patch: Partial<State>) => setS((p) => ({ ...p, ...patch }));
  const finish = () => { go({ done: true }); onFinish(); };
  const connectStub = (name: string) => toast({ tone: "info", title: `Conectar ${name}`, description: "A conexão usa a autorização oficial da plataforma (OAuth), que não existe nesta versão." });

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-3 px-3 py-8">
      <div className="mb-4 flex flex-col items-center gap-3 text-center">
        <LogoMark size={36} />
        <h1 className="t-display">Boas-vindas! Vamos configurar tudo.</h1>
        <p className="t-secondary !text-body">Alguns passos rápidos e você já pode começar.</p>
      </div>

      <Step n={1} title="Como você quer usar o NinePro?" summary={s.use ? USE_LABEL[s.use] : "Usar você mesmo, ou integrar ao seu software"} current={s.step === 1} done={!!s.use}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ChoiceCard icon={<UserRound />} title={USE_LABEL.eu} text="Para as suas marcas ou as dos seus clientes. Publique, responda, gerencie anúncios e acompanhe resultados pelo painel, pela API ou pelo seu assistente de IA." onClick={() => go({ use: "eu", step: 2, fromShortcut: false })}
            preview={<div className="flex w-full max-w-[260px] flex-col gap-2"><div className="rounded-md border border-line bg-surface p-2.5 text-secondary">Coleção nova chega sexta às 9h.<span className="ml-2 font-mono text-[10px] text-text-dim">qui 09:00</span></div><div className="self-end rounded-md bg-accent px-2.5 py-1.5 text-caption font-bold text-accent-ink">Mesa para 4 às 20h? Feito!</div></div>} />
          <ChoiceCard icon={<Code2 />} title={USE_LABEL.software} text="Para desenvolvedores. Seus usuários conectam as contas no seu app, e seu código publica, envia mensagens e roda anúncios por eles pela nossa API." onClick={() => go({ use: "software", step: 2, fromShortcut: false })}
            preview={<div className="flex w-full max-w-[260px] flex-col overflow-hidden rounded-md border border-line bg-surface"><div className="border-b border-line-soft px-2 py-1 font-mono text-[10px] text-text-dim">app.seuproduto.com</div><div className="flex flex-col gap-1.5 p-2.5"><span className="self-start rounded-xs bg-accent px-1.5 font-mono text-[10px] font-bold text-accent-ink">POST /v1/posts</span><span className="text-secondary">Nova publicação agendada</span></div></div>} />
        </div>
        <button type="button" onClick={() => go({ step: 2, fromShortcut: true })} className="mt-4 text-secondary font-semibold text-accent-text hover:underline">Ainda não sei? Conecte uma conta primeiro</button>
      </Step>

      <Step n={2} title="Conecte sua primeira conta ou número" summary="Contas sociais, WhatsApp, um número de telefone ou uma conta de anúncios" current={s.step === 2} done={s.step > 2}>
        <div className="flex flex-col gap-5">
          {CONNECTORS.map((g) => (
            <div key={g.group} className="flex flex-col gap-2">
              <span className="t-label !text-[10px]">{g.group}</span>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {g.items.map((c) => (
                  <button key={c} type="button" onClick={() => connectStub(c)} className="flex flex-col items-center gap-2 rounded-md border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-surface-2">
                    <span className="grid size-9 place-items-center rounded-md bg-soft font-mono text-[12px] font-bold text-text-soft">{initials(c)}</span>
                    <span className="text-center text-caption font-semibold text-text-soft">{c}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between">
            {s.fromShortcut ? <button type="button" onClick={() => go({ step: 1 })} className="text-secondary font-semibold text-accent-text hover:underline">Voltar à pergunta</button> : <span />}
            <Button variant="primary" iconRight={<ArrowRight />} onClick={() => go({ step: 3 })}>Conectar depois</Button>
          </div>
        </div>
      </Step>

      <Step n={3} title="Onde você vai trabalhar?" summary={s.work ? WORK_LABEL[s.work] : "O painel, a API, ou Claude, ChatGPT e Cursor"} current={s.step === 3} done={!!s.work}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {([["painel", "Tudo pela interface do NinePro.", <LayoutDashboard key="p" />], ["api", "Chaves de API, webhooks e SDK.", <Terminal key="a" />], ["agente", "Claude, ChatGPT ou Cursor, via MCP.", <Bot key="b" />]] as const).map(([k, d, ic]) => (
            <button key={k} type="button" onClick={() => go({ work: k, step: 4 })} className="flex flex-col gap-2 rounded-md border border-line p-4 text-left transition-colors hover:border-line-strong [&_svg]:size-5 [&_svg]:text-text-dim">{ic}<span className="t-title">{WORK_LABEL[k]}</span><span className="t-secondary">{d}</span></button>
          ))}
        </div>
      </Step>

      <Step n={4} title="Fique por dentro" summary="Publicamos novidades toda semana" current={s.step === 4} done={!!s.done}>
        <div className="flex flex-col gap-4">
          <p className="t-secondary">Acompanhe o que sai de novo no NinePro.</p>
          <div className="flex flex-wrap gap-2">
            <Tooltip content="Canal ainda não criado"><span tabIndex={0}><Button icon={<Newspaper />} disabled>Changelog</Button></span></Tooltip>
            <Tooltip content="Canal ainda não criado"><span tabIndex={0}><Button icon={<Rss />} disabled>Canal no Telegram</Button></span></Tooltip>
          </div>
          <Button variant="primary" className="self-start" onClick={finish}>Concluir configuração</Button>
        </div>
      </Step>

      <button type="button" onClick={finish} className="mx-auto mt-3 flex items-center gap-1.5 text-secondary font-semibold text-text-muted hover:text-text"><SkipForward className="size-4" />Pular configuração</button>
    </div>
  );
}

export const resetOnboarding = () => { try { localStorage.removeItem("ninepro.onboarding.v2"); } catch { /* ignora */ } };
