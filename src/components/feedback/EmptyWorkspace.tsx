import { Database, Sparkles } from "lucide-react";
import { useState } from "react";
import { useData } from "@/data/source";
import { Button, buttonClasses } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, ErrorState, LoadingState } from "./States";
import { Link } from "react-router-dom";

/**
 * Estados da fonte de dados real: carregando, erro e espaço vazio (com seed de demonstração).
 * Retorna null quando há dados (ou no modo demonstração) — a tela segue normal.
 */
export function DataGate({ children }: { children: React.ReactNode }) {
  const { mode, loading, error, isEmpty, seedDemo, refresh } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (mode === "demo") return <>{children}</>;
  if (loading && isEmpty === false && error === null) return <>{children}</>;
  if (loading) return <LoadingState label="Carregando dados do seu espaço…" />;
  if (error) return <div className="panel"><ErrorState title="Não foi possível carregar os dados" description={error} onRetry={() => void refresh()} /></div>;
  if (isEmpty) {
    return (
      <div className="panel">
        <EmptyState icon={<Database />} title="Seu espaço ainda não tem campanhas"
          description="Conecte uma conta de anúncios para importar campanhas reais, ou popule o espaço com dados de demonstração para explorar o NinePro."
          actions={<>
            <Button variant="primary" icon={<Sparkles />} loading={busy} onClick={async () => {
              setBusy(true);
              const err = await seedDemo();
              setBusy(false);
              toast(err ? { tone: "error", title: "Não foi possível popular", description: err } : { tone: "success", title: "Espaço populado", description: "Contas, campanhas, 90 dias de métricas, leads e eventos de demonstração." });
            }}>Popular com dados de demonstração</Button>
            <Link to="/conexoes" className={buttonClasses("outline")}>Ver conexões</Link>
          </>} />
      </div>
    );
  }
  return <>{children}</>;
}
