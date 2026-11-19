/** Página pública de venda (quem chega sem login). Preços vêm de src/config/plans.ts. */
import { BarChart3, Bot, CalendarClock, Check, MessageCircle, Megaphone, Radar, Send, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { brl, PAID_PLANS, TRIAL_DAYS } from "@/config/plans";
import { LEGAL } from "@/config/legal";
import { Logo } from "@/components/layout/Logo";
import { buttonClasses } from "@/components/ui/Button";

const NETWORKS = ["Instagram", "Facebook", "WhatsApp", "TikTok", "YouTube", "LinkedIn", "X", "Threads", "Pinterest", "Google Meu Negócio", "Telegram", "Discord", "Slack", "Bluesky"];
const FEATURES = [
  { icon: <Send />, t: "Publique em 13 redes de uma vez", d: "Agende, monte a fila da semana, adapte o texto por rede, primeiro comentário, threads, enquetes e reciclagem de conteúdo." },
  { icon: <MessageCircle />, t: "Atendimento num lugar só", d: "WhatsApp e Instagram na mesma caixa de entrada, com respostas automáticas, comentário → DM, sequências e disparos." },
  { icon: <BarChart3 />, t: "Análises de todas as redes", d: "Engajamento, alcance, seguidores e o melhor horário para postar, calculado pelo desempenho da sua própria conta." },
  { icon: <Megaphone />, t: "Anúncios sob controle", d: "Meta, Google, TikTok e LinkedIn Ads num painel, com regras que pausam o que gasta sem retorno e escalam o que vende." },
  { icon: <Radar />, t: "Conversões que voltam para os anúncios", d: "Tag do site e API de eventos com envio para a API de Conversões da Meta e do TikTok: menos perda de atribuição." },
  { icon: <Bot />, t: "Seu agente de IA trabalhando", d: "Conecte Claude ou ChatGPT em um clique: eles publicam, respondem, analisam e criam automações, com a sua aprovação." },
];
const FAQ = [
  { q: "Preciso de cartão para testar?", a: `Não. São ${TRIAL_DAYS} dias com tudo liberado. No fim, você escolhe um plano ou o espaço fica pausado (seus dados continuam guardados).` },
  { q: "Como conecto as minhas redes?", a: "Pelo próprio NinePro, com o app ou o token da sua conta, guiado passo a passo. O NinePro nunca vê a sua senha das redes." },
  { q: "Posso cancelar quando quiser?", a: "Sim. Sem fidelidade: cancele pela tela de Faturamento e o acesso segue até o fim do período pago." },
  { q: "Funciona para agências?", a: "Sim. Cada cliente é um espaço de trabalho separado, com equipe, aprovação de publicações e tema com a identidade visual do cliente." },
  { q: "O que o agente de IA consegue fazer?", a: "Ler resultados, sugerir e publicar conteúdo, responder conversas, registrar conversões e criar automações. Você define as permissões e pode exigir aprovação antes de publicar." },
  { q: "Meus dados estão seguros?", a: "Tokens guardados criptografados, cada empresa isolada no banco e controle de acesso por papel (dono, admin, membro), conforme a LGPD." },
];

export default function Landing() {
  const contact = /^\[/.test(LEGAL.emailContato) ? null : LEGAL.emailContato;
  return (
    <div className="min-h-full bg-canvas text-text">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 py-3">
          <Logo />
          <nav className="ml-6 hidden gap-5 text-secondary text-text-soft md:flex"><a href="#recursos" className="hover:text-text">Recursos</a><a href="#precos" className="hover:text-text">Preços</a><a href="#perguntas" className="hover:text-text">Perguntas</a></nav>
          <span className="flex-1" />
          <Link to="/entrar" className={buttonClasses("ghost")}>Entrar</Link>
          <Link to="/entrar?criar" className={buttonClasses("primary")}>Começar grátis</Link>
        </div>
      </header>

      <section className="mx-auto flex max-w-[1180px] flex-col items-center gap-6 px-4 pb-14 pt-16 text-center md:pt-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[12px] font-semibold text-text-soft"><Sparkles className="size-3.5 text-accent-text" />Feito para o Brasil, com agentes de IA</span>
        <h1 className="max-w-[880px] text-[34px] font-extrabold leading-[1.1] tracking-tight md:text-[54px]">Redes sociais, anúncios e atendimento num lugar só.</h1>
        <p className="max-w-[680px] text-[17px] text-text-soft">Publique em 13 redes, responda WhatsApp e Instagram, acompanhe os resultados e deixe um agente de IA fazer o trabalho repetitivo, com a sua aprovação.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/entrar?criar" className={buttonClasses("primary", "lg")}><Zap className="size-4" />Testar {TRIAL_DAYS} dias grátis</Link>
          <a href="#precos" className={buttonClasses("outline", "lg")}>Ver preços</a>
        </div>
        <span className="t-caption">Sem cartão de crédito · cancele quando quiser</span>
        <div className="mt-6 flex max-w-[900px] flex-wrap justify-center gap-2">{NETWORKS.map((n) => <span key={n} className="rounded-full border border-line bg-surface px-3 py-1 text-[12px] text-text-soft">{n}</span>)}</div>
      </section>

      <section id="recursos" className="mx-auto max-w-[1180px] px-4 py-14">
        <h2 className="mb-2 text-center text-[28px] font-extrabold">Tudo o que o time de marketing faz todo dia</h2>
        <p className="mx-auto mb-10 max-w-[620px] text-center text-text-soft">Em vez de abrir dez abas, abra o NinePro.</p>
        <div className="grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => <div key={f.t} className="panel flex flex-col gap-2 p-5"><span className="grid size-10 place-items-center rounded-md bg-accent-tint text-accent-text [&_svg]:size-5">{f.icon}</span><span className="t-title">{f.t}</span><span className="t-secondary">{f.d}</span></div>)}
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-4 py-14">
        <h2 className="mb-10 text-center text-[28px] font-extrabold">Comece em 10 minutos</h2>
        <ol className="grid grid-cols-1 gap-gutter md:grid-cols-3">
          {[
            { icon: <ShieldCheck />, t: "Crie a conta", d: "Seu espaço de trabalho fica pronto na hora, com teste grátis." },
            { icon: <CalendarClock />, t: "Conecte as redes", d: "Instagram, WhatsApp, Facebook e as outras, com o passo a passo dentro do app." },
            { icon: <Bot />, t: "Publique e automatize", d: "Agende a semana, ligue as respostas automáticas e conecte o seu agente de IA." },
          ].map((s, i) => <li key={s.t} className="panel flex gap-3 p-5"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent font-mono text-[13px] font-bold text-accent-ink">{i + 1}</span><span className="flex flex-col gap-1"><span className="t-title">{s.t}</span><span className="t-secondary">{s.d}</span></span></li>)}
        </ol>
      </section>

      <section id="precos" className="mx-auto max-w-[1180px] px-4 py-14">
        <h2 className="mb-2 text-center text-[28px] font-extrabold">Preços simples</h2>
        <p className="mx-auto mb-10 max-w-[620px] text-center text-text-soft">Todos os recursos em todos os planos. Muda só quantas redes e quantas pessoas. {TRIAL_DAYS} dias grátis para começar.</p>
        <div className="grid grid-cols-1 gap-gutter md:grid-cols-3">
          {PAID_PLANS.map((p) => (
            <div key={p.id} className={cn("panel flex flex-col gap-3 p-6", p.highlight && "border-accent-line-strong")}>
              <div className="flex items-center justify-between"><span className="t-title">{p.name}</span>{p.highlight && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-ink">Mais escolhido</span>}</div>
              <span className="t-secondary">{p.tagline}</span>
              <span className="flex items-baseline gap-1"><span className="text-[34px] font-extrabold">{brl(p.price!)}</span><span className="t-caption">/mês</span></span>
              <ul className="flex flex-1 flex-col gap-2">{p.features.map((f) => <li key={f} className="flex items-start gap-2 text-[14px]"><Check className="mt-0.5 size-4 shrink-0 text-positive" />{f}</li>)}</ul>
              <Link to="/entrar?criar" className={buttonClasses(p.highlight ? "primary" : "outline")}>Começar grátis</Link>
            </div>
          ))}
        </div>
      </section>

      <section id="perguntas" className="mx-auto max-w-[860px] px-4 py-14">
        <h2 className="mb-8 text-center text-[28px] font-extrabold">Perguntas frequentes</h2>
        <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {FAQ.map((f) => <details key={f.q} className="group px-5 py-4"><summary className="cursor-pointer list-none font-semibold marker:hidden">{f.q}</summary><p className="mt-2 t-secondary">{f.a}</p></details>)}
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-4 pb-16 pt-6">
        <div className="panel flex flex-col items-center gap-4 p-10 text-center">
          <h2 className="text-[26px] font-extrabold">Pronto para organizar o marketing?</h2>
          <Link to="/entrar?criar" className={buttonClasses("primary", "lg")}>Criar conta grátis</Link>
          {contact && <span className="t-caption">Prefere conversar? <a href={`mailto:${contact}`} className="underline">{contact}</a></span>}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-4 px-4 py-6 t-caption">
          <span>© {new Date().getFullYear()} {LEGAL.produto}{/^\[/.test(LEGAL.empresa) ? "" : ` · ${LEGAL.empresa}`}</span>
          <span className="flex-1" />
          <Link to="/termos" className="hover:underline">Termos de uso</Link><Link to="/privacidade" className="hover:underline">Privacidade</Link><Link to="/exclusao-de-dados" className="hover:underline">Exclusão de dados</Link>
        </div>
      </footer>
    </div>
  );
}
