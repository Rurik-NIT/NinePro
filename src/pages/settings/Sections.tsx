import { Bot, Check, Eye, KeyRound, LogOut, Monitor, ShieldCheck, Smartphone, Trophy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useLocalState } from "@/lib/useLocalState";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Badge";
import { Checkbox, RadioGroup, Switch } from "@/components/ui/Controls";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Input, Textarea } from "@/components/ui/Input";
import { MultiSelect, Select, Tooltip } from "@/components/ui/Menu";
import { SegmentedControl } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, InlineNotice } from "@/components/feedback/States";
import { Progress } from "@/components/data/Metrics";

export function Group({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div><h2 className="t-title">{title}</h2>{description && <p className="t-secondary">{description}</p>}</div>
      <div className="panel divide-y divide-line-soft">{children}</div>
    </section>
  );
}
export function Row({ label, description, children, stack }: { label: ReactNode; description?: ReactNode; children?: ReactNode; stack?: boolean }) {
  return (
    <div className={cn("flex gap-4 px-4 py-4", stack ? "flex-col" : "flex-col sm:flex-row sm:items-center sm:justify-between")}>
      <div className="flex max-w-[460px] flex-col gap-0.5"><span className="text-body font-semibold">{label}</span>{description && <span className="t-secondary">{description}</span>}</div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}
const off = (label: string, hint = "Requer autenticação e backend") => <Tooltip content={hint}><span tabIndex={0}><Button size="sm" disabled>{label}</Button></span></Tooltip>;

/* ------------------------------------------------------------------ Segurança */
const SESSIONS = [
  { id: "s1", device: "Chrome no Windows", ip: "177.12.•••.40", at: "16 nov, 10:24", current: false, icon: Monitor },
  { id: "s2", device: "Edge no Windows", ip: "177.12.•••.40", at: "16 nov, 12:06", current: true, icon: Monitor },
  { id: "s3", device: "Safari no iPhone", ip: "189.40.•••.7", at: "14 nov, 21:10", current: false, icon: Smartphone },
];
export function SecuritySection() {
  const toast = useToast();
  const [sessions, setSessions] = useState(SESSIONS);
  const [all, setAll] = useState(false);
  return (
    <>
      <Group title="Verificação em duas etapas">
        <Row label={<span className="flex items-center gap-2">Código do app autenticador <Tag>Inativa</Tag></span>} description="Pede um código do app autenticador ao entrar com senha. Você recebe códigos de recuperação na configuração, caso perca o app.">{off("Ativar")}</Row>
        <div className="px-4 pb-4"><InlineNotice tone="info" icon={<KeyRound />}>Você entra pelo Google, então ainda não há senha para confirmar. Defina uma senha primeiro para ativar.</InlineNotice></div>
      </Group>
      <Group title="Sessões ativas" description="Dispositivos conectados à sua conta. Encerre os que você não reconhecer.">
        {sessions.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3.5">
            <span className="grid size-9 place-items-center rounded-md bg-surface-2 text-text-muted"><s.icon className="size-4" /></span>
            <div className="flex flex-1 flex-col"><span className="flex items-center gap-2 text-body font-semibold">{s.device}{s.current && <Tag tone="accent">Este dispositivo</Tag>}</span><span className="num t-caption">{s.ip} · entrou em {s.at}</span></div>
            {!s.current && <Button size="sm" variant="ghost" icon={<LogOut />} onClick={() => { setSessions((x) => x.filter((y) => y.id !== s.id)); toast({ tone: "success", title: "Sessão encerrada (demonstração)" }); }}>Sair</Button>}
          </div>
        ))}
      </Group>
      <Group title="Todos os dispositivos">
        <Row label="Sair de todos os lugares" description="Encerra todas as sessões em todos os dispositivos, inclusive este. Use se achar que alguém tem acesso à sua conta."><Button size="sm" variant="danger" onClick={() => setAll(true)}>Sair de todos</Button></Row>
      </Group>
      <ConfirmDialog open={all} onOpenChange={setAll} title="Sair de todos os dispositivos?" confirmLabel="Sair de todos" description="Você também sai deste dispositivo. (Demonstração: nenhuma sessão real é encerrada.)" onConfirm={() => setSessions((x) => x.filter((y) => y.current))} />
    </>
  );
}

/* ------------------------------------------------------------------ Retenção de conteúdo */
export function RetentionSection() {
  const [team, setTeam] = useLocalState("ninepro.set.zeroRetention", false);
  const [profiles, setProfiles] = useLocalState<string[]>("ninepro.set.zeroRetentionProfiles", []);
  return (
    <Group title="Retenção de conteúdo" description="Escolha se o NinePro guarda o conteúdo dos seus dados, para a equipe inteira ou para perfis específicos.">
      <div className="px-4 py-4"><Switch checked={team} onCheckedChange={setTeam} label="Retenção zero para a equipe inteira" description={team ? "Ligada: o conteúdo não é guardado — você deixa de ler mensagens e publicações antigas no painel e na API." : "Desligada: o conteúdo é guardado para você ler no painel e pela API."} /></div>
      <Row label="Perfis específicos" description="Ligue só para os perfis escolhidos. Os demais continuam guardando conteúdo.">
        <MultiSelect label="Perfis" size="sm" value={profiles} onValueChange={setProfiles} options={[{ value: "aurora", label: "Loja Aurora" }, { value: "outlet", label: "Aurora Outlet" }]} />
      </Row>
    </Group>
  );
}

/* ------------------------------------------------------------------ Notificações */
export function NotificationsSection() {
  const toast = useToast();
  const [n, setN] = useLocalState("ninepro.set.notif2", { failures: true, disconnects: true, payments: true, usage: true, creators: true, marketing: false, spike: true, rules: true });
  const [channel, setChannel] = useLocalState("ninepro.set.notifChannel", "nenhum");
  const [email, setEmail] = useState("");
  const [hook, setHook] = useState("");
  const sw = (k: keyof typeof n, l: string, d: string) => <div className="px-4 py-4"><Switch checked={n[k]} onCheckedChange={(v) => setN({ ...n, [k]: v })} label={l} description={d} /></div>;
  return (
    <>
      <Group title="Alertas" description="E-mails quando algo precisa de você. E-mails críticos de conta e segurança não podem ser desligados.">
        {sw("failures", "Falhas de publicação", "Quando uma publicação agendada não for publicada.")}
        {sw("disconnects", "Contas desconectadas", "Quando uma conta social for desconectada.")}
        {sw("payments", "Pagamentos", "Falhas de pagamento e avisos de cobrança.")}
        {sw("usage", "Uso", "Avisos ao se aproximar ou atingir os limites do plano.")}
        {sw("spike", "Picos de gasto em anúncios", "Quando uma campanha passa do ritmo esperado.")}
        {sw("rules", "Ações de regras", "Toda vez que uma regra pausar ou escalar algo.")}
      </Group>
      <Group title="Atualizações" description="E-mails sobre suas campanhas e o produto.">
        {sw("creators", "Campanhas com criadores", "Posts aguardando revisão, orçamento esgotado, pagamentos que falharam.")}
        {sw("marketing", "E-mails de marketing", "Novidades, dicas e promoções ocasionais.")}
      </Group>
      <Group title="Canal de notificação" description="Falhas de publicação e desconexões também vão para o seu canal, seguindo as opções acima.">
        <Row label="Canal" description="Uma conta do Slack ou do Telegram conectada."><Select size="sm" className="w-[180px]" value={channel} onValueChange={setChannel} options={[{ value: "nenhum", label: "Nenhum" }, { value: "slack", label: "Slack (não conectado)", disabled: true }, { value: "telegram", label: "Telegram (não conectado)", disabled: true }]} /></Row>
        <Row label="Enviar e-mails de alerta para" description="Alertas vão para este endereço em vez do seu e-mail de login. E-mails de segurança continuam indo para o login." stack>
          <div className="flex gap-2"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alertas@empresa.com" wrapperClassName="w-full sm:w-[320px]" /><Button disabled={!/\S+@\S+\.\S+/.test(email)} onClick={() => toast({ tone: "success", title: "E-mail de alertas salvo (local)" })}>Salvar</Button></div>
        </Row>
        <Row label="Webhook de notificação" description="Recebe o evento notification.sent em JSON, para agentes e automações. Não é uma URL de webhook do Slack. Adicione um segredo de assinatura na página Webhooks." stack>
          <div className="flex flex-wrap gap-2"><Input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="https://" wrapperClassName="w-full sm:w-[320px]" /><Button disabled={!/^https:\/\//.test(hook)} onClick={() => toast({ tone: "success", title: "Webhook salvo (local)" })}>Salvar</Button><Button variant="ghost" disabled={!/^https:\/\//.test(hook)} onClick={() => toast({ tone: "info", title: "Teste não enviado", description: "Envio real exige backend." })}>Enviar teste</Button></div>
        </Row>
        <Row label="Conectar só para notificações" description="Contas apenas de notificação são gratuitas e não podem publicar."><div className="flex gap-2">{off("Conectar Slack", "Requer integração")}{off("Conectar Telegram", "Requer integração")}</div></Row>
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------ Apps conectados */
export function ConnectedAppsSection() {
  return (
    <Group title="Apps conectados" description="Assistentes de IA e conectores que você autorizou a usar sua conta. Revogar vale na hora: o assistente perde o acesso na próxima requisição.">
      <EmptyState compact icon={<Bot />} title="Nenhum assistente de IA conectado" description="Quando você conectar um assistente por OAuth, ele aparece aqui com o acesso concedido." />
    </Group>
  );
}

/* ------------------------------------------------------------------ Slack */
export function SlackSection() {
  const connected = 0, need = 2000;
  return (
    <Group title="Slack Connect" description="Um canal dedicado no Slack com a equipe do NinePro, para suporte prioritário.">
      <div className="flex flex-col gap-3 px-4 py-4">
        <Tag className="self-start">Liberado a partir de {need.toLocaleString("pt-BR")} contas conectadas</Tag>
        <Progress value={connected / need} label="Contas conectadas" showValue />
        <p className="t-secondary">Você tem {connected} contas conectadas — faltam {(need - connected).toLocaleString("pt-BR")} para liberar o Slack Connect.</p>
      </div>
    </Group>
  );
}

/* ------------------------------------------------------------------ Ranking */
export function LeaderboardSection() {
  const toast = useToast();
  const [name, setName] = useState(""), [tag, setTag] = useState(""), [site, setSite] = useState("");
  const [band, setBand] = useState(true);
  const checks = [["Ativo no NinePro", "Nenhuma atividade nos últimos 30 dias", false], ["Site ainda não listado", site ? "Disponível" : "Informe o site para verificar", !!site], ["Você é dono do site", "Comparamos com o domínio do seu e-mail ou uma conta conectada", false], ["O site descreve um produto real", "Lemos a página inicial no envio", false]] as const;
  return (
    <>
      <Group title="O que a revisão verifica">
        {checks.map(([t, d, ok]) => <div key={t} className="flex items-center gap-3 px-4 py-3"><span className={cn("grid size-5 place-items-center rounded-full", ok ? "bg-positive-tint text-positive" : "bg-soft text-text-dim")}><Check className="size-3" /></span><div className="flex flex-col"><span className="text-body font-semibold">{t}</span><span className="t-caption">{d}</span></div></div>)}
      </Group>
      <Group title="Ranking" description="Coloque seu produto no ranking público. A posição vem do uso verificado da API nos últimos 30 dias, não de votos.">
        <Row label="Nome do produto"><Input value={name} onChange={(e) => setName(e.target.value)} wrapperClassName="w-full sm:w-[320px]" /></Row>
        <Row label="Slogan" stack><Textarea value={tag} onChange={(e) => setTag(e.target.value)} maxLength={80} showCount className="!min-h-[60px]" /></Row>
        <Row label="Site"><Input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://" wrapperClassName="w-full sm:w-[320px]" /></Row>
        <Row label="Logo" description="PNG, JPEG ou WebP, quadrado funciona melhor.">{off("Enviar logo")}</Row>
        <Row label="Clipe de demonstração" description="Opcional, até 60 s e 50 MB. Toca no card quando alguém passa o mouse.">{off("Enviar clipe")}</Row>
        <div className="px-4 py-4"><Switch checked={band} onCheckedChange={setBand} label="Mostrar faixa de uso" description="Exibe um número arredondado, como “10 mil+ publicações”, nunca o exato. Desligar mantém a listagem e a posição." /></div>
      </Group>
      <div className="flex justify-end"><Button variant="primary" icon={<Trophy />} disabled={!name || !site} onClick={() => toast({ tone: "info", title: "Envio indisponível", description: "A revisão exige atividade verificada na API." })}>Enviar para revisão</Button></div>
    </>
  );
}

/* ------------------------------------------------------------------ Provedores de IA */
const AI = [
  { id: "anthropic", name: "Anthropic", models: "Claude Opus / Sonnet / Haiku", hint: "Começa com sk-ant-…", re: /^sk-ant-\S{10,}$/ },
  { id: "openai", name: "OpenAI", models: "Modelos GPT", hint: "Começa com sk-…", re: /^sk-\S{10,}$/ },
  { id: "gemini", name: "Google Gemini", models: "Gemini Pro / Flash", hint: "Começa com AIza…", re: /^AIza\S{10,}$/ },
  { id: "mistral", name: "Mistral", models: "Mistral Large / Small", hint: "32+ caracteres alfanuméricos", re: /^[A-Za-z0-9]{32,}$/ },
  { id: "groq", name: "Groq", models: "Llama na Groq Cloud", hint: "Começa com gsk_…", re: /^gsk_\S{10,}$/ },
  { id: "openrouter", name: "OpenRouter", models: "Uma chave, vários modelos", hint: "Começa com sk-or-v1-…", re: /^sk-or-v1-\S{10,}$/ },
];
export function AiProvidersSection() {
  const toast = useToast();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saved, setSaved] = useLocalState<string[]>("ninepro.set.aiSaved", []);
  return (
    <Group title="Provedores de IA" description="Cole suas próprias chaves para usar nos passos de IA dos fluxos. As chaves são criptografadas, nunca exibidas de novo depois de salvas e cobradas direto pelo provedor.">
      {AI.map((p) => {
        const v = vals[p.id] ?? "";
        const bad = v && !p.re.test(v);
        return (
          <Row key={p.id} label={<span className="flex items-center gap-2">{p.name}{saved.includes(p.id) && <Tag tone="accent">Configurada</Tag>}</span>} description={p.models} stack>
            <div className="flex flex-wrap items-start gap-2">
              <div className="flex w-full flex-col gap-1 sm:w-[360px]"><Input type="password" value={v} invalid={!!bad} onChange={(e) => setVals((s) => ({ ...s, [p.id]: e.target.value }))} placeholder={saved.includes(p.id) ? "•••••••• (salva)" : p.hint} autoComplete="off" /><span className={cn("text-caption", bad ? "text-negative" : "text-text-dim")}>{bad ? "Formato não reconhecido." : p.hint}</span></div>
              <Button disabled={!v || !!bad} onClick={() => { setSaved((s) => [...new Set([...s, p.id])]); setVals((s) => ({ ...s, [p.id]: "" })); toast({ tone: "success", title: `Chave ${p.name} validada`, description: "Demonstração: o valor não foi armazenado." }); }}>Salvar</Button>
            </div>
          </Row>
        );
      })}
    </Group>
  );
}

/* ------------------------------------------------------------------ Marca própria */
export function WhiteLabelSection() {
  const [always, setAlways] = useLocalState("ninepro.wl.always", false);
  const [title, setTitle] = useLocalState("ninepro.wl.title", "");
  const [accent, setAccent] = useLocalState("ninepro.wl.accent", "#C8F04B");
  const [radius, setRadius] = useLocalState("ninepro.wl.radius", "16");
  const [screen, setScreen] = useState<"boas-vindas" | "formulario" | "sucesso" | "erro">("boas-vindas");
  const [heading, setHeading] = useLocalState("ninepro.wl.heading", "{brand} quer se conectar ao seu {platform}");
  const brand = title || "NinePro";
  const text = (t: string) => t.replace("{brand}", brand).replace("{platform}", "LinkedIn");
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-8">
        <Group title="Tela de boas-vindas">
          <div className="px-4 py-4"><Switch checked={always} onCheckedChange={setAlways} label="Mostrar em todo link de conexão" description="Vale para todos os links que sua API criar, sem precisar de welcome=true. Conexões feitas por este painel sempre mostram." /></div>
        </Group>
        <Group title="Marca">
          <Row label="Título do app" description="Substitui NinePro no título. Até 60 caracteres."><Input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} wrapperClassName="w-full sm:w-[280px]" /></Row>
          <Row label="Logo" description="Imagem quadrada. Sem logo, o quadro mostra a primeira letra.">{off("Enviar logo")}</Row>
          <Row label="Cor de destaque" description="Tinge o banner atrás dos logos e colore os ícones."><div className="flex items-center gap-2"><input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} aria-label="Cor de destaque" className="h-8 w-10 cursor-pointer rounded-sm border border-line bg-transparent" /><code className="font-mono text-[12px] text-text-muted">{accent}</code></div></Row>
          <Row label="Raio dos cantos"><SegmentedControl ariaLabel="Raio" size="sm" value={radius} onValueChange={setRadius} options={["0", "8", "16", "24"].map((r) => ({ value: r, label: `${r}px` }))} /></Row>
        </Group>
        <Group title="Textos" description="Use {brand} e {platform} onde os nomes devem aparecer. Deixe vazio para manter o padrão.">
          <Row label="Título de boas-vindas" stack><Input value={heading} onChange={(e) => setHeading(e.target.value)} /></Row>
        </Group>
        <Group title="No seu próprio app">
          <div className="px-4 py-4"><code className="block whitespace-pre rounded-md border border-line bg-surface-2 p-3 font-mono text-[12px] text-text-soft">{"GET /api/v1/conectar/{plataforma}?perfilId=PERFIL_ID\n  &welcome=true"}</code></div>
        </Group>
      </div>
      <aside className="flex flex-col gap-3 xl:sticky xl:top-4 xl:self-start">
        <div className="flex items-center justify-between"><span className="t-label">Prévia</span><Eye className="size-4 text-text-dim" /></div>
        <SegmentedControl ariaLabel="Tela" size="sm" value={screen} onValueChange={setScreen} options={[{ value: "boas-vindas", label: "Boas-vindas" }, { value: "formulario", label: "Form." }, { value: "sucesso", label: "Sucesso" }, { value: "erro", label: "Erro" }]} />
        <div data-theme="light" className="flex flex-col items-center gap-4 border border-line bg-canvas p-5 text-center" style={{ borderRadius: Number(radius) }}>
          <div className="flex w-full items-center justify-center gap-3 rounded-md py-4" style={{ background: `${accent}33` }}>
            <span className="grid size-10 place-items-center rounded-md bg-surface text-headline font-extrabold shadow-sm">{brand[0]}</span><span className="text-text-dim">⇄</span><span className="grid size-10 place-items-center rounded-md bg-surface font-bold text-series-1 shadow-sm">in</span>
          </div>
          {screen === "boas-vindas" && <><p className="t-title text-text">{text(heading)}</p><p className="t-secondary">Conecte só apps em que você confia.</p><span className="w-full py-2 text-body font-bold text-accent-ink" style={{ background: accent, borderRadius: Number(radius) / 2 }}>Continuar</span></>}
          {screen === "formulario" && <><p className="t-label">Levando você ao LinkedIn</p><p className="t-secondary">Autentique para continuar.</p></>}
          {screen === "sucesso" && <><ShieldCheck className="size-6 text-positive" /><p className="t-title text-text">Conta conectada</p></>}
          {screen === "erro" && <><p className="t-title text-negative">Não foi possível conectar</p><p className="t-secondary">Tente novamente.</p></>}
          <span className="t-caption">Protegido por NinePro</span>
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ SSO */
export function SsoSection() {
  const [domain, setDomain] = useState("");
  const [proto, setProto] = useState<"saml" | "oidc">("saml");
  const [meta, setMeta] = useState("");
  return (
    <Group title="Login único (SSO)" description="Sua equipe entra pelo provedor de identidade da empresa, e o acesso segue as contas que o TI já gerencia.">
      <Row label="Domínio de e-mail da empresa" description="Precisa ser o mesmo do seu e-mail. Você comprova o controle com um registro DNS no próximo passo."><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="empresa.com.br" wrapperClassName="w-full sm:w-[260px]" /></Row>
      <Row label="Protocolo"><RadioGroup label="Protocolo" value={proto} onValueChange={setProto} className="flex-row gap-5" options={[{ value: "saml", label: "SAML" }, { value: "oidc", label: "OIDC" }]} /></Row>
      <Row label="Metadados do provedor de identidade" description="No Okta, Entra ou OneLogin, baixe os metadados de federação e cole o arquivo inteiro. Lemos a URL de login e o certificado." stack><Textarea value={meta} onChange={(e) => setMeta(e.target.value)} placeholder="<EntityDescriptor …>" className="font-mono !text-[12px]" /></Row>
      <div className="flex flex-col gap-3 px-4 py-4">
        <InlineNotice tone="info">Qualquer pessoa desse domínio que entrar pelo provedor passa a fazer parte do espaço como membro. Controle quem recebe o app no seu provedor.</InlineNotice>
        <div className="flex items-center justify-between"><span className="t-secondary">{domain ? "Pronto para conectar." : "Informe o domínio da empresa para conectar."}</span>{off("Conectar provedor")}</div>
      </div>
    </Group>
  );
}

/* ------------------------------------------------------------------ Zona de perigo */
export function DangerSection() {
  const toast = useToast();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [ack, setAck] = useState(false);
  return (
    <Group title="Zona de perigo" description="Ações irreversíveis que afetam sua conta.">
      <Row label="Excluir conta" description="Exclui permanentemente a conta e todos os dados associados. Não pode ser desfeito." stack>
        <div className="flex flex-col gap-3">
          <Button variant="danger" className="self-start" onClick={() => { setSent(true); toast({ tone: "info", title: "Código não enviado", description: "Demonstração: sem envio de e-mail." }); }}>Enviar código de confirmação por e-mail</Button>
          {sent && <div className="flex flex-col gap-2"><span className="text-secondary font-semibold text-text-soft">Código de confirmação</span><Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="num w-[140px] font-mono tracking-[0.3em]" /><span className="t-caption">O código expira em 1 hora.</span></div>}
          <Checkbox checked={ack} onCheckedChange={setAck} label="Entendo que esta ação é permanente" />
          <Button variant="danger" className="self-start" disabled title="Exclusão desabilitada nesta versão">Confirmar exclusão</Button>
        </div>
      </Row>
    </Group>
  );
}

