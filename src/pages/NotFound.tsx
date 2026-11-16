import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { Page } from "@/components/layout/AppShell";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/feedback/States";

export default function NotFound() {
  return (
    <Page>
      <div className="panel">
        <EmptyState icon={<Compass />} title="Página não encontrada" description="O endereço não existe ou foi movido."
          actions={<Link to="/" className={buttonClasses("primary")}>Ir para a visão geral</Link>} />
      </div>
    </Page>
  );
}
