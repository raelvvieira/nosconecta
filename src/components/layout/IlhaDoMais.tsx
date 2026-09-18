import { Link } from "@tanstack/react-router";
import { GRUPOS_DO_MAIS, navegaveis } from "@/components/layout/destinos";
import { PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** A navegação que não coube na barra inferior.
 *
 *  Era uma gaveta de tela cheia subindo do rodapé: para escolher entre 17
 *  destinos, ela tomava a largura inteira e cobria a tela toda, e o menu
 *  aparecia longe do dedo que o abriu — no meio da tela, não onde o toque
 *  aconteceu.
 *
 *  Agora é uma ilha que NASCE do botão "Mais": ancorada nele, no canto
 *  inferior direito, larga só o quanto os nomes precisam. O Radix escreve o
 *  `transform-origin` no canto do gatilho, então ela cresce de onde foi
 *  tocada — se uma coisa surge de um lugar, é para lá que ela volta.
 *
 *  Sem cortina por cima do conteúdo, de propósito: isto não é uma tarefa que
 *  interrompe, é um menu. Tocar fora fecha. */
export function IlhaDoMais({ pathname, aoNavegar }: { pathname: string; aoNavegar: () => void }) {
  return (
    <PopoverContent
      side="top"
      align="end"
      sideOffset={12}
      // A coluna do "Mais" termina 6px antes da borda da barra (é o respiro
      // interno dela). O deslocamento devolve esses 6px, para a ilha e a
      // barra terminarem na mesma linha vertical.
      alignOffset={-6}
      collisionPadding={12}
      aria-label="Navegar"
      className={cn(
        "lg:hidden",
        // Largura pelo CONTEÚDO: o nome mais longo manda, com um teto para a
        // ilha nunca virar a tela inteira de novo.
        "w-max min-w-[12rem] max-w-[min(17rem,calc(100vw-2rem))]",
        "rounded-3xl border border-border bg-card p-0 shadow-3",
        // Nasce do canto do gatilho, com a mesma mola do resto da barra.
        "duration-300 ease-spring",
      )}
    >
      {/* A lista é maior que a tela, então ela rola — e o corte reto de um
          item pela metade na borda arredondada lê como defeito. As pontas
          desbotam: é o que diz "tem mais aqui" sem gastar uma linha. */}
      <div className="custom-scroll max-h-[68dvh] space-y-4 overflow-y-auto overscroll-contain p-2 [mask-image:linear-gradient(to_bottom,transparent,black_10px,black_calc(100%-10px),transparent)]">
        {GRUPOS_DO_MAIS.map((grupo, i) => (
          <div key={grupo.label} className="ilha-entra" style={{ animationDelay: `${i * 45}ms` }}>
            <p className="px-3 pb-1 pt-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
              {grupo.label}
            </p>
            <div className="space-y-0.5">
              {navegaveis(grupo.itens).map((item) => {
                const ativo =
                  item.to === "/atendimentos" || item.to === "/pacientes"
                    ? pathname === item.to
                    : pathname === item.to || pathname.startsWith(`${item.to}/`);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={aoNavegar}
                    className={cn(
                      "press flex h-11 w-full items-center gap-3 rounded-2xl px-3 transition-colors",
                      ativo
                        ? "bg-foreground text-white"
                        : "text-foreground hover:bg-surface-subtle",
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                    <span className="whitespace-nowrap text-sm font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </PopoverContent>
  );
}
