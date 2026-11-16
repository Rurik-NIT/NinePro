import { LogIn, Mail, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/Tabs";
import { InlineNotice } from "@/components/feedback/States";
import { Logo } from "@/components/layout/Logo";
import { Link } from "react-router-dom";

const ALLOW_SIGNUP = import.meta.env.VITE_ALLOW_SIGNUP === "true";

export default function Login() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<"entrar" | "criar" | "recuperar">("entrar");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null); setBusy(true);
    if (mode === "entrar") {
      const err = await signIn(email.trim(), password);
      if (err) setError(err);
    } else if (mode === "criar") {
      const { error: err, needsConfirmation } = await signUp(email.trim(), password, name.trim());
      if (err) setError(err);
      else if (needsConfirmation) setInfo(`Enviamos um link de confirmação para ${email.trim()}. Abra o e-mail e volte para entrar.`);
    } else {
      const err = await resetPassword(email.trim());
      if (err) setError(err); else setInfo("Se existir uma conta com este e-mail, enviamos um link para redefinir a senha.");
    }
    setBusy(false);
  };

  const validEmail = /\S+@\S+\.\S+/.test(email);
  const canSubmit = validEmail && (mode === "recuperar" || password.length >= 6) && (mode !== "criar" || name.trim().length > 1);

  return (
    <div className="grid min-h-full place-items-center bg-canvas p-4">
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <div className="flex justify-center"><Logo /></div>
        <form onSubmit={submit} className="panel flex flex-col gap-5 p-6" noValidate>
          <div className="flex flex-col gap-1">
            <h1 className="t-headline">{mode === "entrar" ? "Entrar no NinePro" : mode === "criar" ? "Criar sua conta" : "Recuperar acesso"}</h1>
            <p className="t-secondary">{mode === "criar" ? "Seu espaço de trabalho é criado automaticamente." : mode === "recuperar" ? "Enviamos um link para você definir uma nova senha." : (ALLOW_SIGNUP ? "Gestão de tráfego pago e operação de campanhas." : "Acesso por convite. Peça sua conta ao administrador.")}</p>
          </div>
          {mode !== "recuperar" && ALLOW_SIGNUP && (
            <SegmentedControl ariaLabel="Acesso" value={mode} onValueChange={(v) => { setMode(v); setError(null); setInfo(null); }}
              options={[{ value: "entrar", label: "Entrar", icon: <LogIn /> }, { value: "criar", label: "Criar conta", icon: <UserPlus /> }]} />
          )}
          {mode === "criar" && <Field label="Seu nome" required>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}</Field>}
          <Field label="E-mail" required>{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" prefix={<Mail />} placeholder="voce@empresa.com" />}</Field>
          {mode !== "recuperar" && (
            <Field label="Senha" required hint={mode === "criar" ? "Pelo menos 6 caracteres." : undefined}>{(p) => <Input {...p} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "criar" ? "new-password" : "current-password"} />}</Field>
          )}
          {error && <InlineNotice tone="negative">{error}</InlineNotice>}
          {info && <InlineNotice tone="positive">{info}</InlineNotice>}
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!canSubmit}>{mode === "entrar" ? "Entrar" : mode === "criar" ? "Criar conta" : "Enviar link"}</Button>
          <button type="button" onClick={() => { setMode(mode === "recuperar" ? "entrar" : "recuperar"); setError(null); setInfo(null); }} className="self-center text-secondary font-semibold text-text-muted hover:text-text">
            {mode === "recuperar" ? "Voltar para o login" : "Esqueci minha senha"}
          </button>
        </form>
        <p className="text-center t-caption">Ao entrar, você concorda com os <Link to="/termos" className="underline hover:text-text">Termos de Uso</Link> e a <Link to="/privacidade" className="underline hover:text-text">Política de Privacidade</Link>.</p>
      </div>
    </div>
  );
}
