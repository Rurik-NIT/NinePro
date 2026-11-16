import { PLATFORMS, type PlatformId } from "@/data/demo";
import { cn } from "@/lib/cn";

/** Identidade de plataforma: quadrado na cor da série (cor segue a entidade, nunca o ranking). */
export function PlatformDot({ id, className }: { id: PlatformId; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-[3px]", className)} style={{ background: PLATFORMS[id].series }} />;
}

export function PlatformLabel({ id, muted }: { id: PlatformId; muted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap", muted ? "text-secondary text-text-muted" : "text-body")}>
      <PlatformDot id={id} />
      {PLATFORMS[id].label}
    </span>
  );
}
