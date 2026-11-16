import { useEffect, useState } from "react";
/** Preferência por usuário (colapso de sidebar, densidade). Nunca para dados de negócio. */
export function useLocalState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignora */ } }, [key, v]);
  return [v, setV] as const;
}
