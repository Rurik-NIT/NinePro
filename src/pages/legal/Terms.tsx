import { Link } from "react-router-dom";
import { LEGAL } from "@/config/legal";
import { LegalLayout, Sec, UL } from "./LegalLayout";

export default function Terms() {
  const L = LEGAL;
  return (
    <LegalLayout title="Termos de Uso">
      <p>Estes termos regem o uso do {L.produto}, operado por {L.empresa} (CNPJ {L.cnpj}). Ao acessar o {L.produto}, você concorda com eles e com a <Link to="/privacidade" className="font-semibold underline">Política de Privacidade</Link>.</p>

      <Sec n="1" title="O serviço">
        <p>O {L.produto} é um software, oferecido pela internet, para gestão de tráfego pago e operação de marketing: acompanhamento de campanhas e métricas, gestão de leads e conversões, regras automáticas, webhooks e uma API para integrar agentes e sistemas. Algumas funções dependem de integrações com plataformas de terceiros e só ficam disponíveis quando essas integrações estiverem ativas.</p>
      </Sec>

      <Sec n="2" title="Contas e acesso">
        <UL>
          <li>O acesso é feito por convite do administrador. Cada conta é pessoal; não compartilhe sua senha.</li>
          <li>Os administradores de cada espaço de trabalho respondem pelas pessoas que convidam e pelas permissões que concedem.</li>
          <li>Você é responsável pelas ações feitas com a sua conta e com as chaves de API criadas no seu espaço. Trate as chaves como senhas e revogue as que não usar mais.</li>
        </UL>
      </Sec>

      <Sec n="3" title="Plataformas conectadas">
        <UL>
          <li>Ao conectar uma conta de anúncios (por exemplo, Meta Ads), você declara ter autorização para administrar essa conta e autoriza o {L.produto} a ler os dados e a executar as ações que você ou seus agentes solicitarem, como pausar ou ativar campanhas.</li>
          <li>O uso das plataformas continua sujeito aos termos e às políticas de cada uma. O {L.produto} não se responsabiliza por mudanças, indisponibilidades ou limitações impostas por elas.</li>
          <li>Ações executadas pelo {L.produto} a seu pedido (manualmente, por regra automática ou por agente conectado pela API) são de sua responsabilidade. Revise regras e permissões antes de ativá-las.</li>
        </UL>
      </Sec>

      <Sec n="4" title="Uso aceitável">
        <p>É proibido usar o {L.produto} para violar leis ou direitos de terceiros, tratar dados pessoais sem base legal, enviar comunicações não solicitadas em massa, tentar acessar dados de outros espaços de trabalho, contornar limites técnicos ou de segurança, ou sobrecarregar a API de forma abusiva. Podemos suspender o acesso em caso de violação.</p>
      </Sec>

      <Sec n="5" title="Dados do cliente">
        <p>Os dados que você traz para o {L.produto} (campanhas, métricas, leads, configurações) continuam sendo seus. Nós os tratamos apenas para prestar o serviço, conforme a Política de Privacidade. Você pode exportar e pedir a exclusão desses dados a qualquer momento.</p>
      </Sec>

      <Sec n="6" title="Disponibilidade e mudanças">
        <p>Trabalhamos para manter o {L.produto} disponível e seguro, mas não garantimos funcionamento ininterrupto ou livre de erros. Podemos alterar, incluir ou remover funções, avisando com antecedência quando a mudança afetar o uso de forma relevante.</p>
      </Sec>

      <Sec n="7" title="Responsabilidade">
        <p>Na máxima extensão permitida pela lei, o {L.produto} não responde por lucros cessantes, perda de receita ou resultados de campanhas, nem por danos causados por plataformas de terceiros ou por ações solicitadas pelo cliente. Nada nestes termos limita direitos garantidos pelo Código de Defesa do Consumidor quando ele se aplicar.</p>
      </Sec>

      <Sec n="8" title="Encerramento">
        <p>Você pode deixar de usar o {L.produto} a qualquer momento. Podemos encerrar ou suspender contas que violem estes termos. Após o encerramento, os dados são excluídos conforme a Política de Privacidade.</p>
      </Sec>

      <Sec n="9" title="Lei e foro">
        <p>Estes termos seguem as leis brasileiras. Fica eleito o foro da comarca de {L.foro} para resolver eventuais conflitos, salvo disposição legal em contrário. Contato: {L.emailContato}.</p>
      </Sec>
    </LegalLayout>
  );
}
