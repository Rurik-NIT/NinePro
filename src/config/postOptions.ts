/**
 * Opções de publicação por rede (primeiro comentário, thread, enquete, privacidade…).
 * Arquivo compartilhado: o compositor monta os campos e o servidor valida com as mesmas regras.
 * Sem JSX nem dependências, para poder ser importado no servidor.
 */
export type OptKind = "instagram" | "facebook" | "threads" | "linkedin_social" | "youtube" | "tiktok_social" | "x" | "telegram" | "discord" | "bluesky" | "pinterest" | "google_business" | "slack";
export type OptType = "text" | "textarea" | "url" | "bool" | "select" | "list" | "number" | "datetime";
export interface OptField {
  key: string; label: string; type: OptType; hint?: string;
  options?: { value: string; label: string }[];
  /** text/textarea/list: tamanho máximo de cada item. number: valor máximo. */
  max?: number; min?: number; maxItems?: number;
  /** só aparece quando outra opção tem esse valor */
  when?: { key: string; is: string[] };
}
export type OptValue = string | boolean | number | string[];
export type NetOptions = Record<string, OptValue>;
export type PostOptions = Partial<Record<OptKind, NetOptions>>;

const firstComment: OptField = { key: "primeiro_comentario", label: "Primeiro comentário", type: "textarea", max: 2200, hint: "Publicado logo depois, como comentário da própria conta. Bom para links e hashtags." };
const thread = (max: number): OptField => ({ key: "thread", label: "Continuação em thread", type: "list", max, maxItems: 24, hint: `Cada item vira uma resposta ao post anterior (até ${max} caracteres cada).` });

export const POST_OPTIONS: Record<OptKind, OptField[]> = {
  instagram: [
    { key: "formato", label: "Formato", type: "select", options: [{ value: "auto", label: "Automático (feed ou carrossel; vídeo vira reels)" }, { value: "reels", label: "Reels" }, { value: "stories", label: "Stories" }] },
    firstComment,
    { key: "colaboradores", label: "Colaboradores", type: "list", max: 30, maxItems: 3, hint: "@ de até 3 contas convidadas para dividir a autoria (feed e reels)." },
    { key: "marcar", label: "Marcar pessoas", type: "list", max: 30, maxItems: 20, hint: "@ das contas marcadas na foto ou no reels." },
    { key: "compartilhar_no_feed", label: "Mostrar o reels também no feed", type: "bool", when: { key: "formato", is: ["reels", "auto"] } },
    { key: "capa_url", label: "Capa do reels (link da imagem)", type: "url", when: { key: "formato", is: ["reels", "auto"] } },
    { key: "local_id", label: "ID do local (página do Facebook)", type: "text", max: 40 },
  ],
  facebook: [firstComment],
  threads: [
    firstComment,
    thread(500),
    { key: "topico", label: "Tópico", type: "text", max: 50, hint: "Tag de tópico do Threads, sem #." },
  ],
  linkedin_social: [
    firstComment,
    { key: "documento_url", label: "Documento PDF (link)", type: "url", hint: "Publica um carrossel de documento. Não junta com fotos ou vídeo." },
    { key: "documento_titulo", label: "Título do documento", type: "text", max: 200, when: { key: "documento_url", is: ["*"] } },
    { key: "enquete_pergunta", label: "Enquete: pergunta", type: "text", max: 140 },
    { key: "enquete_opcoes", label: "Enquete: opções", type: "list", max: 30, maxItems: 4, when: { key: "enquete_pergunta", is: ["*"] } },
    { key: "enquete_duracao", label: "Enquete: duração", type: "select", options: [{ value: "ONE_DAY", label: "1 dia" }, { value: "THREE_DAYS", label: "3 dias" }, { value: "SEVEN_DAYS", label: "1 semana" }, { value: "FOURTEEN_DAYS", label: "2 semanas" }], when: { key: "enquete_pergunta", is: ["*"] } },
  ],
  youtube: [
    { key: "visibilidade", label: "Visibilidade", type: "select", options: [{ value: "public", label: "Público" }, { value: "unlisted", label: "Não listado" }, { value: "private", label: "Privado" }] },
    { key: "playlist_id", label: "Adicionar à playlist (ID)", type: "text", max: 64 },
    { key: "categoria", label: "Categoria", type: "select", options: [["22", "Pessoas e blogs"], ["27", "Educação"], ["24", "Entretenimento"], ["28", "Ciência e tecnologia"], ["26", "Guias e estilo"], ["10", "Música"], ["17", "Esportes"], ["20", "Jogos"], ["25", "Notícias e política"], ["19", "Viagens e eventos"], ["15", "Animais"], ["2", "Carros e veículos"], ["23", "Comédia"], ["1", "Filmes e animação"], ["29", "ONGs e ativismo"]].map(([value, label]) => ({ value, label })) },
    { key: "tags", label: "Tags", type: "list", max: 100, maxItems: 30 },
    { key: "para_criancas", label: "Feito para crianças", type: "bool" },
    { key: "notificar_inscritos", label: "Avisar os inscritos", type: "bool" },
    { key: "conteudo_sintetico", label: "Contém conteúdo gerado ou alterado por IA", type: "bool" },
    firstComment,
  ],
  tiktok_social: [
    { key: "privacidade", label: "Quem pode ver", type: "select", options: [{ value: "PUBLIC_TO_EVERYONE", label: "Todos" }, { value: "MUTUAL_FOLLOW_FRIENDS", label: "Amigos" }, { value: "FOLLOWER_OF_CREATOR", label: "Seguidores" }, { value: "SELF_ONLY", label: "Só eu" }], hint: "Se a conta não permitir a opção escolhida, usamos a mais próxima permitida." },
    { key: "sem_comentarios", label: "Desativar comentários", type: "bool" },
    { key: "sem_dueto", label: "Desativar dueto", type: "bool" },
    { key: "sem_stitch", label: "Desativar stitch", type: "bool" },
    { key: "conteudo_de_marca", label: "Parceria paga (conteúdo de marca de terceiros)", type: "bool" },
    { key: "marca_propria", label: "Promove a própria marca", type: "bool" },
    { key: "feito_com_ia", label: "Gerado por IA", type: "bool" },
    { key: "capa_ms", label: "Capa do vídeo (milissegundo)", type: "number", min: 0, max: 600000 },
    { key: "musica_automatica", label: "Adicionar música automaticamente (fotos)", type: "bool" },
  ],
  x: [
    thread(280),
    { key: "enquete_opcoes", label: "Enquete: opções", type: "list", max: 25, maxItems: 4, hint: "2 a 4 opções. Enquete não junta com mídia." },
    { key: "enquete_minutos", label: "Enquete: duração (minutos)", type: "number", min: 5, max: 10080, when: { key: "enquete_opcoes", is: ["*"] } },
    { key: "responder_a", label: "Responder ao post (ID ou link)", type: "text", max: 120 },
    { key: "citar", label: "Citar o post (ID ou link)", type: "text", max: 120 },
    { key: "quem_responde", label: "Quem pode responder", type: "select", options: [{ value: "todos", label: "Todos" }, { value: "seguidos", label: "Contas que você segue" }, { value: "mencionados", label: "Só quem foi mencionado" }] },
  ],
  telegram: [
    { key: "formatacao", label: "Formatação do texto", type: "select", options: [{ value: "nenhuma", label: "Texto simples" }, { value: "HTML", label: "HTML (<b>, <i>, <a>)" }, { value: "MarkdownV2", label: "Markdown" }] },
    { key: "sem_previa_de_link", label: "Não mostrar a prévia do link", type: "bool" },
    { key: "silencioso", label: "Enviar sem notificar", type: "bool" },
    { key: "proteger", label: "Impedir encaminhar e salvar", type: "bool" },
  ],
  discord: [
    { key: "nome", label: "Nome exibido", type: "text", max: 80 },
    { key: "avatar_url", label: "Avatar (link da imagem)", type: "url" },
    { key: "topico_forum", label: "Título do tópico (canal de fórum)", type: "text", max: 100 },
    { key: "enquete_pergunta", label: "Enquete: pergunta", type: "text", max: 300 },
    { key: "enquete_opcoes", label: "Enquete: opções", type: "list", max: 55, maxItems: 10, when: { key: "enquete_pergunta", is: ["*"] } },
    { key: "enquete_horas", label: "Enquete: duração (horas)", type: "number", min: 1, max: 768, when: { key: "enquete_pergunta", is: ["*"] } },
  ],
  bluesky: [
    thread(300),
    { key: "idiomas", label: "Idiomas", type: "list", max: 10, maxItems: 3, hint: "Códigos como pt, en, es. Padrão: pt." },
  ],
  pinterest: [
    { key: "pasta", label: "Pasta", type: "text", max: 64, hint: "ID da pasta (board). Vazio = a primeira pasta da conta." },
    { key: "link", label: "Link de destino", type: "url" },
    { key: "texto_alternativo", label: "Texto alternativo", type: "text", max: 500 },
  ],
  google_business: [
    { key: "tipo", label: "Tipo", type: "select", options: [{ value: "STANDARD", label: "Novidade" }, { value: "EVENT", label: "Evento" }, { value: "OFFER", label: "Oferta" }] },
    { key: "botao", label: "Botão", type: "select", options: [{ value: "nenhum", label: "Sem botão" }, { value: "LEARN_MORE", label: "Saiba mais" }, { value: "BOOK", label: "Reservar" }, { value: "ORDER", label: "Pedir on-line" }, { value: "SHOP", label: "Comprar" }, { value: "SIGN_UP", label: "Inscrever-se" }, { value: "CALL", label: "Ligar" }] },
    { key: "botao_url", label: "Link do botão", type: "url", when: { key: "botao", is: ["LEARN_MORE", "BOOK", "ORDER", "SHOP", "SIGN_UP"] } },
    { key: "evento_titulo", label: "Título do evento ou oferta", type: "text", max: 58, when: { key: "tipo", is: ["EVENT", "OFFER"] } },
    { key: "evento_inicio", label: "Início", type: "datetime", when: { key: "tipo", is: ["EVENT", "OFFER"] } },
    { key: "evento_fim", label: "Fim", type: "datetime", when: { key: "tipo", is: ["EVENT", "OFFER"] } },
    { key: "cupom", label: "Código do cupom", type: "text", max: 58, when: { key: "tipo", is: ["OFFER"] } },
    { key: "link_oferta", label: "Link para resgatar", type: "url", when: { key: "tipo", is: ["OFFER"] } },
    { key: "termos", label: "Termos e condições", type: "textarea", max: 1500, when: { key: "tipo", is: ["OFFER"] } },
  ],
  slack: [
    { ...firstComment, hint: "Enviado como resposta na conversa da mensagem (só em mensagens de texto)." },
    { key: "sem_previa_de_link", label: "Não mostrar a prévia do link", type: "bool" },
    { key: "responder_em", label: "Responder na conversa (ts da mensagem)", type: "text", max: 32 },
  ],
};

const isUrl = (s: string) => /^https:\/\/[^\s]+$/i.test(s);
const shown = (f: OptField, o: NetOptions) => {
  if (!f.when) return true;
  const v = o[f.when.key];
  const has = Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "" && v !== false;
  return f.when.is.includes("*") ? has : f.when.is.includes(String(v ?? ""));
};
export const optionVisible = shown;

/** Limpa as opções recebidas: só chaves conhecidas, tipos certos e tamanhos dentro do limite. */
export function cleanOptions(raw: unknown, kinds?: string[]): PostOptions {
  const out: PostOptions = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, val] of Object.entries(raw as Record<string, unknown>)) {
    const fields = POST_OPTIONS[k as OptKind];
    if (!fields || (kinds && !kinds.includes(k)) || !val || typeof val !== "object") continue;
    const src = val as Record<string, unknown>; const o: NetOptions = {};
    for (const f of fields) {
      const v = src[f.key];
      if (v === undefined || v === null || v === "") continue;
      if (f.type === "bool") { if (typeof v === "boolean") o[f.key] = v; else if (v === "true" || v === "false") o[f.key] = v === "true"; continue; }
      if (f.type === "number") { const n = Number(v); if (Number.isFinite(n)) o[f.key] = Math.round(Math.min(f.max ?? n, Math.max(f.min ?? n, n))); continue; }
      if (f.type === "list") {
        const arr = (Array.isArray(v) ? v : String(v).split(/\n|;/)).map((x) => String(x).trim()).filter(Boolean).map((x) => x.slice(0, f.max ?? 500)).slice(0, f.maxItems ?? 20);
        if (arr.length) o[f.key] = arr;
        continue;
      }
      const s = String(v).trim().slice(0, f.max ?? 2200);
      if (!s) continue;
      if (f.type === "select" && !f.options?.some((x) => x.value === s)) continue;
      if (f.type === "url" && !isUrl(s)) continue;
      if (f.type === "datetime" && Number.isNaN(Date.parse(s))) continue;
      o[f.key] = s;
    }
    if (Object.keys(o).length) out[k as OptKind] = o;
  }
  return out;
}

/** Regras que dependem de mais de um campo (ou da mídia). Devolve problemas legíveis. */
export function checkOptions(kind: string, o: NetOptions | undefined, ctx: { media: number; hasVideo: boolean; label: string }): string[] {
  if (!o) return [];
  const p: string[] = []; const n = ctx.label;
  const list = (k: string) => (Array.isArray(o[k]) ? (o[k] as string[]) : []);
  if (kind === "x") {
    const poll = list("enquete_opcoes");
    if (poll.length === 1) p.push(`${n}: a enquete precisa de 2 a 4 opções.`);
    if (poll.length && ctx.media) p.push(`${n}: enquete não junta com fotos ou vídeo.`);
    if (o.responder_a && o.citar) p.push(`${n}: escolha responder ou citar, não os dois.`);
  }
  if (kind === "linkedin_social") {
    if (o.documento_url && ctx.media) p.push(`${n}: o documento PDF não junta com fotos ou vídeo.`);
    if (o.enquete_pergunta && list("enquete_opcoes").length < 2) p.push(`${n}: a enquete precisa de 2 a 4 opções.`);
    if (o.enquete_pergunta && (ctx.media || o.documento_url)) p.push(`${n}: enquete não junta com mídia ou documento.`);
  }
  if (kind === "discord" && o.enquete_pergunta && list("enquete_opcoes").length < 2) p.push(`${n}: a enquete precisa de ao menos 2 opções.`);
  if (kind === "instagram") {
    if (o.formato === "stories" && ctx.media !== 1) p.push(`${n}: stories leva uma foto ou um vídeo.`);
    if (o.formato === "reels" && !ctx.hasVideo) p.push(`${n}: reels precisa de um vídeo.`);
  }
  if (kind === "google_business") {
    if ((o.tipo === "EVENT" || o.tipo === "OFFER") && (!o.evento_titulo || !o.evento_inicio || !o.evento_fim)) p.push(`${n}: evento e oferta precisam de título, início e fim.`);
    if (o.evento_inicio && o.evento_fim && Date.parse(String(o.evento_fim)) <= Date.parse(String(o.evento_inicio))) p.push(`${n}: o fim precisa ser depois do início.`);
    if (o.botao && o.botao !== "CALL" && o.botao !== "nenhum" && !o.botao_url) p.push(`${n}: informe o link do botão.`);
  }
  return p;
}

/** Texto de ajuda para o agente de IA: as opções de cada rede, numa linha. */
export function describeOptions(kind: OptKind) {
  return POST_OPTIONS[kind].map((f) => `${f.key} (${f.type === "select" ? f.options!.map((x) => x.value || "vazio").join("|") : f.type === "list" ? `lista${f.maxItems ? ` até ${f.maxItems}` : ""}` : f.type})`).join(", ");
}
