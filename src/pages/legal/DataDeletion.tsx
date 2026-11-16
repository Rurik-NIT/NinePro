import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LEGAL } from "@/config/legal";
import { StatusBadge } from "@/components/ui/Badge";
import { InlineNotice } from "@/components/feedback/States";
import { formatDateTime } from "@/lib/format";
import { LegalLayout, Sec, UL } from "./LegalLayout";

interface Req { code: string; kind: string; status: string; requested_at: string; completed_at: string | null }

export default function DataDeletion() {
  const L = LEGAL;
  const [params] = useSearchParams();
  const code = params.get("codigo");
  const [req, setReq] = useState<Req | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!code) return;
    fetch(`/api/meta-exclusao?codigo=${encodeURIComponent(code)}`).then(async (r) => { const b = await r.json(); if (r.ok) setReq(b as Req); else setErr((b as { error?: string }).error ?? "Pedido não encontrado."); }).catch(() => setErr("Não foi possível consultar o pedido agora."));
  }, [code]);

  return (
    <LegalLayout title="Exclusão de dados">
      {code && (
        <div className="panel flex flex-col gap-2 p-4">
          <span className="t-label">Pedido {code}</span>
          {err ? <InlineNotice tone="negative">{err}</InlineNotice> : !req ? <span className="t-secondary">Consultando…</span> : (
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge tone={req.status === "concluido" ? "positive" : "info"}>{req.status === "concluido" ? "Concluído" : "Recebido"}</StatusBadge>
              <span className="t-secondary">Recebido em {formatDateTime(new Date(req.requested_at))}{req.completed_at ? ` · concluído em ${formatDateTime(new Date(req.completed_at))}` : ""}</span>
            </div>
          )}
        </div>
      )}

      <p>Você pode pedir a exclusão dos seus dados no {L.produto} a qualquer momento. Veja abaixo o caminho para cada situação.</p>

      <Sec n="1" title="Se você conectou o Facebook / Meta Ads ao NinePro">
        <UL>
          <li><b>Pelo NinePro:</b> entre em <b>Conexões</b> e clique em <b>Desconectar</b> no cartão da Meta Ads. O token de acesso é apagado na hora e a sincronização para.</li>
          <li><b>Pelo Facebook:</b> em Configurações e privacidade › Configurações › <b>Integrações comerciais</b>, remova o {L.produto}. A Meta nos avisa automaticamente; apagamos a conexão e o token de acesso e geramos um código de confirmação que pode ser consultado nesta página.</li>
          <li>Para apagar também as campanhas e métricas já importadas, peça pelo e-mail abaixo informando o espaço de trabalho.</li>
        </UL>
      </Sec>

      <Sec n="2" title="Se você tem uma conta no NinePro">
        <p>Peça a exclusão da conta pelo e-mail <b>{L.emailPrivacidade}</b>, a partir do e-mail cadastrado. A conta é apagada e os espaços de trabalho em que você era a única pessoa são excluídos com todos os dados.</p>
      </Sec>

      <Sec n="3" title="Se você é um lead de um cliente do NinePro">
        <p>Seus dados pertencem à empresa que coletou o cadastro. Escreva para <b>{L.emailPrivacidade}</b> informando o e-mail ou o telefone cadastrado; encaminharemos o pedido à empresa responsável e acompanharemos a exclusão.</p>
      </Sec>

      <Sec n="4" title="Prazo">
        <p>Respondemos em até 15 dias. Registros técnicos mínimos podem ser mantidos pelo prazo exigido por lei (Marco Civil da Internet), sem uso para outra finalidade. Mais detalhes na <Link to="/privacidade" className="font-semibold underline">Política de Privacidade</Link>.</p>
      </Sec>
    </LegalLayout>
  );
}
