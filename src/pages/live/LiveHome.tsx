/** Início para contas reais: primeiros passos com o andamento da própria conta e um resumo do que precisa de atenção. */
import { ArrowRight, Bot, CalendarClock, Check, Code2, Megaphone, MessageCircle, Send, Share2, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/cn";
import { formatValue } from "@/lib/format";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { buttonClasses } from "@/components/ui/Button";
import { LoadingState } from "@/components/feedback/States";

interface Counts { channels: number; posts: number; scheduled: number; pending: number; agents: number; ads: number; sites: number; members: number; unread: number; followers: number }


export function LiveHome() {
  const { user } = useAuth();
  const { current } = useWorkspace();
  const ws = current?.id;
  const [c, setC] = useState<Counts | null>(null);
  useEffect(() => {
    if (!supabase || !ws) return;
    const sb = supabase;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Q = any;
    const n = async (t: string, f?: (q: Q) => Q) => { let q: Q = sb.from(t).select("*", { count: "exact", head: true }).eq("workspace_id", ws); if (f) q = f(q); const { count } = await q; return (count as number | null) ?? 0; };
    void Promise.all([
      n("channel_accounts", (q) => q.not("connection_id", "is", null)),
      n("posts"),
      n("posts", (q) => q.eq("status", "agendada")),
      n("posts", (q) => q.eq("status", "aguardando_aprovacao")),
      Promise.all([n("oauth_tokens"), n("api_keys")]).then(([a, b]) => a + b),
      n("ad_accounts"),
      n("tracked_sites"),
      n("workspace_members"),
      sb.from("conversations").select("unread").eq("workspace_id", ws).gt("unread", 0).limit(500).then(({ data }) => (data ?? []).reduce((s, r) => s + Number((r as { unread: number }).unread || 0), 0)),
      sb.from("channel_accounts").select("detail").eq("workspace_id", ws).not("connection_id", "is", null).then(({ data }) => (data ?? []).reduce((s, r) => s + (Number((r.detail as { seguidores?: number } | null)?.seguidores) || 0), 0)),
    ]).then(([channels, posts, scheduled, pending, agents, ads, sites, members, unread, followers]) => setC({ channels, posts, scheduled, pending, agents, ads, sites, members, unread, followers }));
  }, [ws]);
  if (!c) return <Page><PageHeader title="Início" /><LoadingState /></Page>;
  const first = (user?.user_metadata as { full_name?: string } | undefined)?.full_name?.split(" ")[0];
  const steps = [
    { done: c.channels > 0, icon: <Share2 />, t: "Conecte suas redes", d: "Instagram, WhatsApp, Facebook, LinkedIn, TikTok, YouTube, X e mais. Com o app ou token da sua própria conta, guiado passo a passo.", to: "/conexoes", cta: "Conectar redes" },
    { done: c.posts > 0, icon: <Send />, t: "Publique em todas de uma vez", d: "Agende, monte a fila da semana, adapte o texto por rede e acompanhe tudo num lugar só.", to: "/publicacoes", cta: "Criar publicação" },
    { done: c.agents > 0, icon: <Bot />, t: "Conecte seu agente de IA", d: "Claude, ChatGPT e outros assistentes publicam, respondem e analisam por você, com a sua aprovação.", to: "/integracao", cta: "Conectar agente" },
    { done: c.ads > 0, icon: <Megaphone />, t: "Traga seus anúncios", d: "Meta, Google, TikTok e LinkedIn Ads num painel só, com regras automáticas de pausa e orçamento.", to: "/conexoes", cta: "Conectar anúncios" },
    { done: c.sites > 0, icon: <Code2 />, t: "Meça as vendas do site", d: "Instale a tag para atribuir vendas e leads às campanhas e enviar as conversões para Meta e TikTok.", to: "/anuncios/conversoes/fontes", cta: "Instalar a tag" },
    { done: c.members > 1, icon: <Users />, t: "Chame a equipe", d: "Convide quem atende e quem publica, com aprovação antes de sair.", to: "/usuarios", cta: "Convidar" },
  ];
  const doneN = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const attention = [
    c.pending > 0 && { icon: <ShieldCheck />, t: `${c.pending} publicação(ões) aguardando aprovação`, to: "/publicacoes" },
    c.unread > 0 && { icon: <MessageCircle />, t: `${formatValue(c.unread, "integer")} mensagem(ns) não lida(s)`, to: "/caixa-de-entrada/mensagens" },
    c.scheduled > 0 && { icon: <CalendarClock />, t: `${c.scheduled} publicação(ões) agendada(s)`, to: "/publicacoes" },
  ].filter(Boolean) as { icon: JSX.Element; t: string; to: string }[];
  return (
    <Page>
      <PageHeader title={first ? `Olá, ${first}` : "Início"} description={doneN === steps.length ? "Tudo configurado. Aqui está o que pede atenção hoje." : `Primeiros passos: ${doneN} de ${steps.length} concluídos.`} />
      {attention.length > 0 && (
        <div className="grid grid-cols-1 gap-gutter md:grid-cols-3">
          {attention.map((a) => <Link key={a.t} to={a.to} className="panel flex items-center gap-3 p-4 hover:border-line-strong"><span className="grid size-9 place-items-center rounded-md bg-accent-tint text-accent-text [&_svg]:size-4">{a.icon}</span><span className="flex-1 font-semibold">{a.t}</span><ArrowRight className="size-4 text-text-muted" /></Link>)}
        </div>
      )}
      {c.followers > 0 && <div className="t-secondary">Somando todas as contas conectadas: <span className="num font-semibold text-text">{formatValue(c.followers, "integer")}</span> seguidores.</div>}
      <section className="panel overflow-hidden">
        <header className="flex flex-wrap items-center gap-3 px-4 pb-3 pt-4">
          <h2 className="t-title flex-1">Primeiros passos</h2>
          <span className="h-2 w-40 overflow-hidden rounded-full bg-bar-idle"><span className="block h-full rounded-full bg-accent" style={{ width: `${(doneN / steps.length) * 100}%` }} /></span>
          <span className="num t-caption">{doneN}/{steps.length}</span>
        </header>
        <ol className="divide-y divide-line-soft">
          {steps.map((s, i) => (
            <li key={s.t} className={cn("flex flex-wrap items-center gap-4 px-4 py-3.5", s === next && "bg-accent-tint/40")}>
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-md font-mono text-[12px] font-bold", s.done ? "bg-accent text-accent-ink" : "bg-soft text-text-muted")}>{s.done ? <Check className="size-4" /> : i + 1}</span>
              <span className="grid size-8 shrink-0 place-items-center text-text-muted [&_svg]:size-4">{s.icon}</span>
              <div className="flex min-w-[220px] flex-1 flex-col"><span className={cn("font-semibold", s.done && "text-text-soft line-through decoration-1")}>{s.t}</span><span className="t-caption">{s.d}</span></div>
              {!s.done && <Link to={s.to} className={buttonClasses(s === next ? "primary" : "outline", "sm")}>{s.cta}</Link>}
            </li>
          ))}
        </ol>
      </section>
    </Page>
  );
}
