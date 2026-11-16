import { Database } from "lucide-react";
import { useData } from "@/data/source";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "./States";
import { Link } from "react-router-dom";

/**
 * Estados da fonte de dados real: carregando, erro e espaço vazio (com seed de demonstração).
 * Retorna null quando há dados (ou no modo demonstração) — a tela segue normal.
 */
export function DataGate({ children }: { children: React.ReactNode }) {
  const { mode, loading, error, isEmpty, refresh, campaigns } = useData();
  if (mode === "demo") return <>{children}</>;
  if (loading && campaigns.length > 0) return <>{children}</>;
  if (loading) return <LoadingState label="Carregando dados do seu espaço…" />;
  if (error) return <div className="panel"><ErrorState title="Não foi possível carregar os dados" description={error} onRetry={() => void refresh()} /></div>;
  if (isEmpty) {
    return (
      <div className="panel">
        <EmptyState icon={<Database />} title="Seu espaço ainda não tem campanhas"
          description="Conecte uma conta de anúncios para importar as campanhas. Os números aparecem aqui assim que a primeira sincronização terminar."
          actions={<Link to="/conexoes" className={buttonClasses("primary")}>Conectar conta de anúncios</Link>} />
      </div>
    );
  }
  return <>{children}</>;
}
