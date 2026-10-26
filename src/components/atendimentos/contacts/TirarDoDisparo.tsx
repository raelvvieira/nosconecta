import { Briefcase, MinusCircle, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { corDeTag } from "@/lib/tags/cores";
import type { Tag } from "@/lib/tags/tags.functions";
import type { ListaAutomatica } from "@/lib/atendimentos/listasAutomaticas";

const ICONE_DA_LISTA: Record<ListaAutomatica, typeof Briefcase> = {
  empresas: Briefcase,
  doutores: Stethoscope,
};

/**
 * A linha que TIRA gente do disparo — o par das fichas que escolhem quem entra.
 *
 * "Enviar para o DDD 51, menos os desqualificados" é o recorte de verdade de
 * uma campanha, e só com fichas de incluir ele não existia: escolher a tag
 * "Desqualificado" mostrava SÓ os desqualificados. Uma linha separada, com o
 * verbo no título, deixa claro que aqui o toque remove — a mesma ficha não
 * troca de sentido conforme o estado, que era a alternativa (toque 1 inclui,
 * toque 2 exclui) e que ninguém adivinha.
 *
 * Ficha ligada é vermelha e com o "−": o único lugar da tela onde uma ficha
 * ligada significa MENOS gente. As listas automáticas (empresas, doutores)
 * vêm primeiro: são as que a pessoa não precisou montar.
 */
export function TirarDoDisparo({
  listas,
  tags,
  tagsTiradas,
  onAlternarTag,
  contarTag,
  fora,
  className,
}: {
  listas: {
    id: ListaAutomatica;
    rotulo: string;
    contagem: number;
    ativa: boolean;
    onAlternar: () => void;
  }[];
  tags: Tag[];
  tagsTiradas: Set<string>;
  onAlternarTag: (tagId: string) => void;
  contarTag: (tagId: string) => number;
  /** Quantos saíram do recorte por causa desta linha. */
  fora: number;
  className?: string;
}) {
  // Ficha que não tiraria ninguém do recorte atual só ocupa espaço — mas a
  // ligada fica, senão desligá-la viraria impossível.
  const listasVisiveis = listas.filter((l) => l.contagem > 0 || l.ativa);
  const tagsVisiveis = tags.filter((t) => contarTag(t.id) > 0 || tagsTiradas.has(t.id));
  if (listasVisiveis.length === 0 && tagsVisiveis.length === 0) return null;

  return (
    <section data-tirar-do-disparo="" className={cn("mt-4", className)}>
      <div className="flex items-baseline justify-between gap-3 px-1">
        <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
          Tirar do disparo
        </p>
        {fora > 0 && (
          <p className="text-2xs tabular-nums text-danger" data-fora-do-disparo="">
            {fora} fora
          </p>
        )}
      </div>

      <div className="scrollbar-none -mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
        {listasVisiveis.map((l) => {
          const Icone = ICONE_DA_LISTA[l.id];
          return (
            <FichaDeTirar
              key={l.id}
              data-lista-automatica={l.id}
              ativa={l.ativa}
              onClick={l.onAlternar}
              rotulo={l.rotulo}
              contagem={l.contagem}
              marca={<Icone className="h-3.5 w-3.5" strokeWidth={2} />}
            />
          );
        })}
        {tagsVisiveis.map((t) => (
          <FichaDeTirar
            key={t.id}
            data-tirar-tag={t.name}
            ativa={tagsTiradas.has(t.id)}
            onClick={() => onAlternarTag(t.id)}
            rotulo={t.name}
            contagem={contarTag(t.id)}
            marca={
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: corDeTag(t.color).ponto }}
              />
            }
          />
        ))}
      </div>
    </section>
  );
}

function FichaDeTirar({
  ativa,
  onClick,
  rotulo,
  contagem,
  marca,
  ...rest
}: {
  ativa: boolean;
  onClick: () => void;
  rotulo: string;
  contagem: number;
  marca: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={ativa}
      onClick={onClick}
      className={cn(
        "press inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 focus-visible:ring-offset-1",
        ativa
          ? "border-danger/30 bg-danger-soft text-danger"
          : "border-border bg-white text-foreground-secondary",
      )}
      {...rest}
    >
      {ativa ? (
        <MinusCircle className="h-4 w-4 shrink-0" strokeWidth={2} />
      ) : (
        <span className="grid h-4 w-4 shrink-0 place-items-center text-muted-foreground">
          {marca}
        </span>
      )}
      <span className={cn(ativa && "line-through decoration-danger/40")}>{rotulo}</span>
      <span className={ativa ? "text-danger/70" : "text-muted-foreground"}>({contagem})</span>
    </button>
  );
}
