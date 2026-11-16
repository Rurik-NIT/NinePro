/**
 * Dados da empresa usados na Política de Privacidade, nos Termos de Uso e na página de exclusão de dados.
 * PREENCHA antes de enviar o app da Meta para revisão (e, de preferência, peça revisão jurídica dos textos).
 */
export const LEGAL = {
  produto: "NinePro",
  empresa: "[RAZÃO SOCIAL DA EMPRESA]",
  cnpj: "[CNPJ]",
  endereco: "[ENDEREÇO COMPLETO]",
  emailContato: "[E-MAIL DE CONTATO]",
  emailPrivacidade: "[E-MAIL DO ENCARREGADO / PRIVACIDADE]",
  encarregado: "[NOME DO ENCARREGADO PELO TRATAMENTO DE DADOS (DPO)]",
  foro: "[CIDADE/UF]",
  atualizadoEm: "16 de novembro de 2026",
};

/** true enquanto algum campo ainda estiver com [marcador]. */
export const LEGAL_PENDING = Object.values(LEGAL).some((v) => /^\[.*\]$/.test(v));
