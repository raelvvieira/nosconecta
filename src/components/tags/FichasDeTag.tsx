import { cn } from "@/lib/utils";
import { corDeTag } from "@/lib/tags/cores";
import type { Tag } from "@/lib/tags/tags.functions";

/**
 * Fichas de tag para recortar uma lista.
 *
 * Mesma gramática das fichas de DDD que já existem ao lado: ficha ligada é
 * preenchida, desligada é contorno, e a contagem fica junto. A diferença é a
 * cor — aqui ela vem da tag, e é o que permite reconhecer o recorte sem ler.
 *
 * Escolher duas tags SOMA em vez de restringir: "clareamento ou implante" é o
 * recorte que serve a um disparo. Exigir as duas juntas devolveria quase
 * ninguém, e é a leitura que praticamente nenhuma clínica quer.
 */
export function FichasDeTag({
  tags,
  escolhidas,
  onAlternar,
  contar,
  className,
}: {
  tags: Tag[];
  escolhidas: Set<string>;
  onAlternar: (tagId: string) => void;
  /** Quantos da lista atual têm esta tag. Sem isto a ficha promete um recorte
   *  de tamanho desconhecido, e a pessoa descobre que está vazio depois de
   *  clicar. */
  contar: (tagId: string) => number;
  className?: string;
}) {
  // Tag que não está em ninguém da lista atual não vira ficha: ela só ocuparia
  // espaço para oferecer um recorte vazio.
  const comGente = tags.filter((t) => contar(t.id) > 0 || escolhidas.has(t.id));
  if (comGente.length === 0) return null;

  return (
    <div className={cn("scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4", className)}>
      {comGente.map((t) => {
        const ativa = escolhidas.has(t.id);
        const c = corDeTag(t.color);
        return (
          <button
            key={t.id}
            type="button"
            data-ficha-tag={t.name}
            aria-pressed={ativa}
            onClick={() => onAlternar(t.id)}
            className={cn(
              "press h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
              !ativa && "border-border bg-white text-foreground-secondary",
            )}
            style={
              ativa
                ? { backgroundColor: c.bg, color: c.fg, borderColor: c.ponto }
                : undefined
            }
          >
            <span
              aria-hidden
              className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full align-middle"
              style={{ backgroundColor: c.ponto }}
            />
            {t.name} <span className={ativa ? "opacity-70" : "text-muted-foreground"}>({contar(t.id)})</span>
          </button>
        );
      })}
    </div>
  );
}
