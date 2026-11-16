import { Link } from "react-router-dom";
import { LEGAL } from "@/config/legal";
import { LegalLayout, Sec, UL } from "./LegalLayout";

export default function Privacy() {
  const L = LEGAL;
  return (
    <LegalLayout title="Política de Privacidade">
      <p>Esta política explica como o {L.produto}, operado por {L.empresa} (CNPJ {L.cnpj}, {L.endereco}), trata dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD) e com as políticas das plataformas às quais o {L.produto} se conecta, como a Meta.</p>

      <Sec n="1" title="Quem somos e o que o NinePro faz">
        <p>O {L.produto} é um software para gestão de tráfego pago e operação de marketing. Empresas e agências (os “clientes”) usam o {L.produto} para acompanhar campanhas, métricas, leads e conversões, criar regras automáticas e conectar agentes e sistemas próprios.</p>
        <p>Em relação aos dados das contas de anúncio e dos leads que cada cliente traz para o {L.produto}, o cliente é o <b>controlador</b> e o {L.produto} atua como <b>operador</b>, tratando os dados apenas para prestar o serviço contratado. Em relação aos dados das pessoas que usam o {L.produto} (cadastro e acesso), o {L.produto} é o controlador.</p>
      </Sec>

      <Sec n="2" title="Dados que tratamos">
        <UL>
          <li><b>Conta de usuário:</b> nome, e-mail, senha (armazenada apenas como hash pelo provedor de autenticação), papel no espaço de trabalho, datas de criação e de último acesso.</li>
          <li><b>Dados das plataformas de anúncio conectadas</b> (por exemplo, Meta Ads), obtidos somente depois que um administrador do espaço autoriza a conexão: identificador e nome do usuário que autorizou, contas de anúncio, campanhas, conjuntos de anúncios, anúncios, miniaturas dos criativos e métricas de desempenho (investimento, impressões, alcance, cliques, conversões, leads, compras e receita). O token de acesso é guardado <b>criptografado</b> e nunca é exibido.</li>
          <li><b>Leads e eventos de conversão</b> que o cliente registra ou recebe no {L.produto} (por exemplo, nome, e-mail e telefone informados pelo lead).</li>
          <li><b>Configurações e conteúdo do cliente:</b> públicos, regras automáticas, webhooks e chaves de API (das chaves guardamos apenas um resumo criptográfico).</li>
          <li><b>Registros técnicos:</b> chamadas à API do {L.produto} (data, rota, status, duração e nome da chave usada), entregas de webhooks e registros de segurança e de auditoria das ações administrativas.</li>
          <li><b>Armazenamento local do navegador:</b> sessão de login e preferências de interface (tema, filtros). Não usamos cookies de publicidade nem ferramentas de rastreamento de terceiros.</li>
        </UL>
      </Sec>

      <Sec n="3" title="Para que usamos os dados (finalidades e bases legais)">
        <UL>
          <li><b>Prestar o serviço</b> — exibir campanhas e métricas, sincronizar dados, executar as ações pedidas pelo cliente (como pausar ou ativar uma campanha), registrar leads e enviar webhooks. Base legal: execução de contrato (art. 7º, V) e, para dados de terceiros, as instruções do cliente controlador.</li>
          <li><b>Segurança, prevenção a fraude e auditoria</b> — controle de acesso, registros técnicos e de auditoria. Base legal: legítimo interesse (art. 7º, IX) e cumprimento de obrigação legal (art. 7º, II).</li>
          <li><b>Comunicação com o usuário</b> — avisos sobre a conta, convites, redefinição de senha e mudanças relevantes no serviço. Base legal: execução de contrato.</li>
        </UL>
        <p><b>Não vendemos dados pessoais</b>, não usamos dados das plataformas conectadas para publicidade própria, para criar perfis de pessoas ou para treinar modelos de inteligência artificial, e não compartilhamos esses dados com terceiros além dos operadores listados abaixo.</p>
      </Sec>

      <Sec n="4" title="Dados da Meta e de outras plataformas">
        <p>Os dados obtidos pelas APIs da Meta (Facebook e Instagram) e de outras plataformas são usados exclusivamente para oferecer ao cliente as funções do {L.produto} que ele solicitou, respeitando os Termos da Plataforma e as políticas de desenvolvedor de cada plataforma. O acesso é limitado às contas que o administrador do espaço autorizou e às permissões concedidas.</p>
        <p>A autorização pode ser revogada a qualquer momento em <b>Conexões › Desconectar</b> no {L.produto} ou nas configurações da própria plataforma (no Facebook: Configurações › Integrações comerciais). Ao revogar, o {L.produto} deixa de sincronizar e apaga o token de acesso. Veja também a página de <Link to="/exclusao-de-dados" className="font-semibold underline">exclusão de dados</Link>.</p>
      </Sec>

      <Sec n="5" title="Com quem compartilhamos (operadores)">
        <UL>
          <li><b>Supabase</b> — banco de dados e autenticação.</li>
          <li><b>Vercel</b> — hospedagem do aplicativo e das funções de servidor.</li>
          <li><b>Plataformas conectadas pelo cliente</b> (como a Meta) — apenas para executar as ações solicitadas (por exemplo, pausar uma campanha).</li>
          <li><b>Destinos configurados pelo cliente</b> — sistemas para os quais o próprio cliente cadastrou webhooks ou criou chaves de API.</li>
        </UL>
        <p>Esses fornecedores podem armazenar dados em servidores fora do Brasil. Nesses casos, a transferência internacional segue o art. 33 da LGPD, com garantias contratuais de proteção.</p>
      </Sec>

      <Sec n="6" title="Por quanto tempo guardamos">
        <UL>
          <li>Dados da conta e do espaço de trabalho: enquanto a conta estiver ativa. Ao excluir a conta, os espaços em que a pessoa era a única integrante são apagados com todos os dados.</li>
          <li>Tokens de acesso das plataformas: até a desconexão, a revogação pela plataforma ou o pedido de exclusão.</li>
          <li>Métricas e campanhas importadas: enquanto o cliente mantiver o espaço de trabalho, ou até ele pedir a exclusão.</li>
          <li>Registros técnicos e de auditoria: pelo tempo necessário para segurança e para cumprir obrigações legais (no mínimo 6 meses, conforme o Marco Civil da Internet).</li>
        </UL>
      </Sec>

      <Sec n="7" title="Seus direitos">
        <p>Você pode pedir, a qualquer momento: confirmação de que tratamos seus dados; acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários; portabilidade; informação sobre compartilhamento; e revogação do consentimento, quando aplicável (art. 18 da LGPD). Se você é um lead de um cliente do {L.produto}, encaminharemos o pedido ao cliente responsável pelos seus dados.</p>
        <p>Para exercer seus direitos, escreva para <b>{L.emailPrivacidade}</b>. Responderemos em até 15 dias. Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).</p>
      </Sec>

      <Sec n="8" title="Segurança">
        <p>Usamos conexões criptografadas (HTTPS), criptografia AES-256 para os tokens das plataformas, isolamento de dados por espaço de trabalho com regras de acesso no banco de dados, chaves de API armazenadas apenas como resumo criptográfico, assinatura dos webhooks e registro de auditoria das ações administrativas. Nenhum sistema é totalmente imune a incidentes; se ocorrer um incidente relevante, comunicaremos os afetados e a ANPD conforme a lei.</p>
      </Sec>

      <Sec n="9" title="Encarregado e contato">
        <p>Encarregado pelo tratamento de dados pessoais: <b>{L.encarregado}</b> — {L.emailPrivacidade}. Contato geral: {L.emailContato}. Endereço: {L.endereco}.</p>
      </Sec>

      <Sec n="10" title="Mudanças nesta política">
        <p>Podemos atualizar esta política. A data da última atualização aparece no topo da página, e mudanças relevantes serão avisadas aos usuários.</p>
      </Sec>
    </LegalLayout>
  );
}
