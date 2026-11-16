import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase do NinePro.
 * Enquanto VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não estiverem definidos, o app
 * continua no modo demonstração (dados fictícios locais) — nada quebra.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
