import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isSupabaseConfigured, supabase } from "./supabase";

/**
 * Autenticação. Sem Supabase configurado, o app roda em modo demonstração (sem login).
 */
interface AuthCtx {
  mode: "demo" | "supabase";
  loading: boolean;
  session: Session | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  resetPassword: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

const translate = (msg: string) => {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar — enviamos um link para a sua caixa de entrada.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Já existe uma conta com este e-mail.";
  if (m.includes("password should be")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("rate limit")) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  return msg;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    mode: isSupabaseConfigured ? "supabase" : "demo",
    loading,
    session,
    user: session?.user ?? null,
    signIn: async (email, password) => {
      if (!supabase) return "Supabase não configurado.";
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? translate(error.message) : null;
    },
    signUp: async (email, password, fullName) => {
      if (!supabase) return { error: "Supabase não configurado.", needsConfirmation: false };
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin } });
      if (error) return { error: translate(error.message), needsConfirmation: false };
      return { error: null, needsConfirmation: !data.session };
    },
    resetPassword: async (email) => {
      if (!supabase) return "Supabase não configurado.";
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      return error ? translate(error.message) : null;
    },
    signOut: async () => { await supabase?.auth.signOut(); },
  }), [loading, session]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth precisa de <AuthProvider>");
  return c;
}
