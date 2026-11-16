import { ChevronDown, Eye, ImagePlus, Link2, Megaphone, MousePointerClick, ShoppingBag, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PLATFORMS, PLATFORM_ORDER, type Objective, type PlatformId } from "@/data/demo";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Controls";
import { DatePicker } from "@/components/ui/DatePicker";
import { Modal } from "@/components/ui/Dialog";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Menu";
import { SegmentedControl } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { InlineNotice } from "@/components/feedback/States";
import { PlatformDot } from "@/components/data/Platform";

const OBJ: { value: Objective; label: string; hint: string; icon: ReactNode }[] = [
  { value: "vendas", label: "Vendas", hint: "Compras no site ou catálogo", icon: <ShoppingBag /> },
  { value: "leads", label: "Leads", hint: "Cadastros e formulários", icon: <UserPlus /> },
  { value: "trafego", label: "Tráfego", hint: "Visitas ao destino", icon: <MousePointerClick /> },
  { value: "reconhecimento", label: "Reconhecimento", hint: "Alcance e lembrança", icon: <Eye /> },
];

/**
 * Criação de campanha — estrutura do modal "Create ad" observado na referência
 * (criativo à esquerda, configuração à direita, "criar pausada" marcado por padrão).
 * Sem integração: valida os campos e informa que publicar exige conexão — nada é enviado.
 */
export function CreateCampaignModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const toast = useToast();
  const [platform, setPlatform] = useState<PlatformId | "">("");
  const [objective, setObjective] = useState<Objective>("vendas");
  const [text, setText] = useState("");
  const [headline, setHeadline] = useState("");
  const [url, setUrl] = useState("");
  const [budget, setBudget] = useState("");
  const [budgetType, setBudgetType] = useState<"diario" | "total">("diario");
  const [start, setStart] = useState<Date | undefined>();
  const [paused, setPaused] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [name, setName] = useState("");
  const [tried, setTried] = useState(false);

  const errors = {
    platform: !platform ? "Escolha a conta de anúncios." : undefined,
    headline: !headline.trim() ? "O título é obrigatório." : undefined,
    url: url && !/^https?:\/\/\S+\.\S+/.test(url) ? "Use um endereço completo, com https://" : !url ? "Informe o destino." : undefined,
    budget: !budget || Number(budget.replace(",", ".")) <= 0 ? "Informe um orçamento maior que zero." : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);
  const reset = () => { setPlatform(""); setObjective("vendas"); setText(""); setHeadline(""); setUrl(""); setBudget(""); setStart(undefined); setPaused(true); setName(""); setTried(false); };

  const submit = () => {
    setTried(true);
    if (!valid) return;
    toast({ tone: "success", title: "Campanha validada", description: "Tudo certo com os campos. Para publicar, conecte uma conta de anúncios em Conexões." });
    reset();
    onOpenChange(false);
  };
  const e = (k: keyof typeof errors) => (tried ? errors[k] : undefined);

  return (
    <Modal
      open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }} size="xl" icon={<Megaphone />}
      title="Nova campanha" description="Monte o criativo e configure entrega e orçamento."
      footer={
        <>
          <Checkbox checked={paused} onCheckedChange={setPaused} label="Criar pausada" className="mr-auto" />
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" onClick={submit}>Validar campanha</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Criativo */}
        <div className="flex flex-col gap-4">
          <p className="t-label">Criativo</p>
          <Field label="Texto principal" hint="Aparece acima da mídia.">
            {(p) => <Textarea {...p} value={text} onChange={(ev) => setText(ev.target.value)} maxLength={125} showCount placeholder="Ex.: Frete grátis em toda a coleção até domingo." />}
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-secondary font-semibold text-text-soft">Mídia</span>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-surface-2 px-4 py-8 text-center transition-colors hover:border-accent-line-strong hover:bg-accent-tint">
              <ImagePlus className="size-5 text-text-muted" />
              <span className="text-body font-semibold">Arraste uma imagem ou clique para escolher</span>
              <span className="t-caption">JPG ou PNG · 1200×628 recomendado · até 30 MB</span>
              <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(ev) => ev.target.files?.[0] && toast({ tone: "info", title: "Imagem selecionada", description: ev.target.files[0].name })} />
            </label>
          </div>
          <Field label="Título" required error={e("headline")}>
            {(p) => <div className="relative"><Input {...p} value={headline} maxLength={40} onChange={(ev) => setHeadline(ev.target.value)} placeholder="Seu título" /><span className="num t-caption absolute -bottom-5 right-0">{headline.length}/40</span></div>}
          </Field>
          <Field label="URL de destino" required error={e("url")}>
            {(p) => <Input {...p} value={url} onChange={(ev) => setUrl(ev.target.value)} prefix={<Link2 />} placeholder="https://seusite.com.br/pagina" />}
          </Field>
        </div>

        {/* Configuração */}
        <div className="flex flex-col gap-4 lg:border-l lg:border-line lg:pl-6">
          <p className="t-label">Entrega</p>
          <Field label="Conta de anúncios" required error={e("platform")}>
            {(p) => (
              <Select id={p.id} invalid={p.invalid} value={platform || undefined} onValueChange={(v) => setPlatform(v as PlatformId)} placeholder="Selecione a conta"
                options={PLATFORM_ORDER.map((id) => ({ value: id, label: PLATFORMS[id].label, icon: <PlatformDot id={id} /> }))} />
            )}
          </Field>
          {platform && <InlineNotice tone="warning">Nenhuma conta de {PLATFORMS[platform].label} conectada. Você pode validar a campanha, mas a publicação exige conexão.</InlineNotice>}
          <div className="flex flex-col gap-1.5">
            <span className="text-secondary font-semibold text-text-soft">Objetivo</span>
            <div role="radiogroup" aria-label="Objetivo" className="grid grid-cols-2 gap-2">
              {OBJ.map((o) => (
                <button key={o.value} type="button" role="radio" aria-checked={objective === o.value} onClick={() => setObjective(o.value)}
                  className={cn("flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors [&_svg]:size-4",
                    objective === o.value ? "border-accent-line-strong bg-accent-tint" : "border-line bg-surface hover:border-line-strong")}>
                  <span className={cn("mt-0.5", objective === o.value ? "text-accent-text" : "text-text-dim")}>{o.icon}</span>
                  <span className="flex flex-col"><span className="text-body font-bold">{o.label}</span><span className="t-caption">{o.hint}</span></span>
                </button>
              ))}
            </div>
          </div>
          <Field label="Orçamento" required error={e("budget")}>
            {(p) => (
              <div className="flex gap-2">
                <Input {...p} inputMode="decimal" value={budget} onChange={(ev) => setBudget(ev.target.value.replace(/[^\d,]/g, ""))} prefix={<span className="text-secondary font-bold">R$</span>} placeholder="0,00" className="num" wrapperClassName="flex-1" />
                <SegmentedControl ariaLabel="Tipo de orçamento" value={budgetType} onValueChange={setBudgetType} options={[{ value: "diario", label: "Por dia" }, { value: "total", label: "Total" }]} />
              </div>
            )}
          </Field>
          <Field label="Início da veiculação" hint="Sem data, começa assim que a plataforma aprovar.">
            {() => <DatePicker value={start} onChange={setStart} placeholder="Imediatamente" />}
          </Field>
          <button type="button" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced} className="flex items-center gap-1.5 self-start text-secondary font-semibold text-text-muted hover:text-text">
            Avançado <ChevronDown className={cn("size-3.5 transition-transform", advanced && "rotate-180")} />
          </button>
          {advanced && (
            <Field label="Nome da campanha" hint="Se vazio, usamos a data e a hora de criação.">
              {(p) => <Input {...p} value={name} onChange={(ev) => setName(ev.target.value)} placeholder="Ex.: Verão — Prospecção" />}
            </Field>
          )}
        </div>
      </div>
    </Modal>
  );
}
