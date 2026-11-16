import { FileText, Target, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { buttonClasses } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Badge";
import { EmptyState } from "@/components/feedback/States";

/**
 * Módulos identificados na engenharia reversa que dependem de integração para ter conteúdo.
 * Em vez de inventar telas, mostramos o que foi mapeado e o que falta — com a estrutura já pronta.
 */
const MODULES: Record<string, { title: string; description: string; icon: ReactNode; columns: string[]; scope: string[] }> = {
  conversions: {
    title: "Conversões", icon: <Target />, description: "Onde as vendas acontecem, a tag no site e as plataformas que recebem os eventos.",
    columns: ["Fonte", "Instalada via", "Status", "Eventos hoje", "Último evento"],
    scope: ["Visão geral do funil", "Eventos", "Destinos", "Fontes"],
  },
  audiences: {
    title: "Públicos", icon: <Users />, description: "Listas de clientes, semelhantes, retargeting do site e receitas de segmentação reutilizáveis.",
    columns: ["Público", "Tipo", "Tamanho", "Status", "Conta"],
    scope: ["Lista de clientes", "Semelhante (lookalike)", "Retargeting", "Receita salva"],
  },
  forms: {
    title: "Formulários", icon: <FileText />, description: "Formulários instantâneos das plataformas que alimentam a tela de Leads.",
    columns: ["Formulário", "Plataforma", "Leads", "Taxa de envio", "Atualizado"],
    scope: ["Formulários por conta", "Perguntas e campos", "Leads recebidos"],
  },
};

export default function MappedModule({ module }: { module: string }) {
  const m = MODULES[module];
  return (
    <Page>
      <PageHeader title={m.title} description={m.description} meta={<Tag>Mapeado · aguardando integração</Tag>} />
      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead><tr>{m.columns.map((c, i) => <th key={c} className={`t-label h-9 border-b border-line bg-surface-2 px-3 text-left ${i === 0 ? "pl-4" : ""}`}>{c}</th>)}</tr></thead>
          </table>
        </div>
        <EmptyState icon={m.icon} title={`${m.title} chega com a primeira integração`}
          description="A estrutura desta tela já segue o Design System. Os dados aparecem assim que uma conta de anúncios for conectada."
          actions={<Link to="/conexoes" className={buttonClasses("outline", "md")}>Ver conexões</Link>} />
        <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3">
          <span className="t-label !text-[10px]">Escopo mapeado</span>
          {m.scope.map((s) => <Tag key={s}>{s}</Tag>)}
        </div>
      </section>
    </Page>
  );
}
