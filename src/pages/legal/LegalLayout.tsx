import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LEGAL } from "@/config/legal";
import { Logo } from "@/components/layout/Logo";

/** Página pública (sem login) para textos legais e exclusão de dados. */
export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-full bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[860px] items-center justify-between px-4 py-4">
          <Link to="/" aria-label="Ir para o NinePro"><Logo /></Link>
          <nav className="flex gap-4 text-secondary font-semibold text-text-muted">
            <Link to="/privacidade" className="hover:text-text">Privacidade</Link>
            <Link to="/termos" className="hover:text-text">Termos</Link>
            <Link to="/exclusao-de-dados" className="hover:text-text">Exclusão de dados</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex max-w-[860px] flex-col gap-6 px-4 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="t-display text-display">{title}</h1>
          <p className="t-secondary">Última atualização: {LEGAL.atualizadoEm}</p>
        </div>
        <article className="legal flex flex-col gap-6 text-body leading-relaxed text-text-soft">{children}</article>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-[860px] px-4 py-6 t-caption">{LEGAL.produto} · {LEGAL.empresa} · CNPJ {LEGAL.cnpj} · {LEGAL.emailContato}</div>
      </footer>
    </div>
  );
}

export function Sec({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="t-headline text-text">{n}. {title}</h2>
      {children}
    </section>
  );
}

export const UL = ({ children }: { children: ReactNode }) => <ul className="ml-5 flex list-disc flex-col gap-1.5">{children}</ul>;
