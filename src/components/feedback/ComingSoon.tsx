import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Page, PageHeader } from "@/components/layout/AppShell";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "./States";

/**
 * Módulos que ainda dependem de integração externa. Em produção (banco conectado) mostram
 * "Em breve" em vez de conteúdo fictício; no modo demonstração seguem exibindo o exemplo.
 */
export function DemoOnly({ title, area, children }: { title: string; area: string; children: JSX.Element }) {
  const { mode } = useAuth();
  if (mode === "demo") return children;
  return (
    <Page>
      <PageHeader title={title} />
      <div className="panel">
        <EmptyState icon={<Sparkles />} title="Em breve"
          description={`Este módulo é liberado quando a integração com ${area} estiver ativa. Até lá, nenhum dado de exemplo é exibido aqui.`}
          actions={<Link to="/conexoes" className={buttonClasses("outline")}>Ver conexões</Link>} />
      </div>
    </Page>
  );
}
