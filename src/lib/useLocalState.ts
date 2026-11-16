import { useCallback, useState, type SetStateAction } from "react";

/**
 * Preferência/estado de demonstração por usuário, salvo no navegador.
 * Grava de forma síncrona no próprio setter: o valor sobrevive mesmo quando o componente
 * desmonta logo em seguida (ex.: salvar e navegar para outra tela).
 * Nunca usar para dados de negócio reais.
 */
export function useLocalState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : initial; } catch { return initial; }
  });
  const set = useCallback((next: SetStateAction<T>) => {
    setV((prev) => {
      const value = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* armazenamento indisponível */ }
      return value;
    });
  }, [key]);
  return [v, set] as const;
}
