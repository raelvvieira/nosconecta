import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { corDeTag } from "@/lib/tags/cores";

/**
 * A tag como se vê: nome em cima da cor dela.
 *
 * Cor vem por estilo inline e não por classe do Tailwind, porque a paleta é
 * dado (vive no banco) e não build-time — classe montada por interpolação seria
 * removida pelo purge e a etiqueta sairia sem cor nenhuma.
 */
export function Etiqueta({
  nome,
  cor,
  onRemover,
  className,
}: {
  nome: string;
  cor: string | null | undefined;
  /** Presente = mostra o × e vira removível. */
  onRemover?: () => void;
  className?: string;
}) {
  const c = corDeTag(cor);

  return (
    <span
      data-etiqueta={nome}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-semibold leading-4",
        className,
      )}
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      <span className="truncate">{nome}</span>
      {onRemover && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemover();
          }}
          aria-label={`Remover a tag ${nome}`}
          // O alvo cresce para além do desenho: o × precisa ser tocável sem
          // ampliar o chip, que ficaria desproporcional numa lista densa.
          className="press -mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-full transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <X className="h-3 w-3" strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}

/** Bolinha da cor — para a lista de configurações e o seletor de cor. */
export function PontoDeCor({ cor, className }: { cor: string | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: corDeTag(cor).ponto }}
    />
  );
}
