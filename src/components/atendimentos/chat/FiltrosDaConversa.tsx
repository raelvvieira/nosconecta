import { ArrowUpDown, Check, SlidersHorizontal, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { corDeTag } from "@/lib/tags/cores";
import {
  FILTROS_VAZIOS,
  ORDENACOES,
  ROTULO_DA_ORDENACAO,
  SEM_ETAPA,
  contarFiltrosAtivos,
  type Filtros,
  type Ordenacao,
} from "@/lib/atendimentos/filtrosDeConversa";
import type { DealStatus } from "@/lib/atendimentos/deals.functions";
import { cn } from "@/lib/utils";

/**
 * Os recortes da caixa de entrada.
 *
 * ── Dois níveis, de propósito ────────────────────────────────────────────
 *
 * "Sem resposta" e "Abertas" ficam como chips fixos: são os dois recortes do
 * dia a dia, e enterrá-los num menu custaria dois cliques toda vez. O resto —
 * etiqueta, etapa, desfecho, paciente/lead — mora num popover atrás do ícone de
 * funil, com o número de recortes ligados na bolinha.
 *
 * A alternativa era uma fila de nove chips. Numa coluna de 340px ela rolaria de
 * lado, e um filtro ligado ficaria fora de vista — que é exatamente como se
 * esquece um filtro ligado e se acha que a caixa está vazia.
 *
 * ── Por que só a ordenação é lembrada ────────────────────────────────────
 *
 * Filtro esquecido ligado esconde conversas: no dia seguinte a caixa parece
 * vazia, e alguém deixa de responder um paciente por causa disso. A ordem, não:
 * ela muda a sequência, nunca o conjunto.
 */
export function FiltrosDaConversa({
  filtros,
  onFiltros,
  ordem,
  onOrdem,
  tags,
  etapas,
  quantidade,
  total,
}: {
  filtros: Filtros;
  onFiltros: (f: Filtros) => void;
  ordem: Ordenacao;
  onOrdem: (o: Ordenacao) => void;
  tags: { id: string; name: string; color: string | null }[];
  etapas: { id: string; name: string }[];
  /** Quantas conversas sobraram, e quantas existem. */
  quantidade: number;
  total: number;
}) {
  const ativos = contarFiltrosAtivos(filtros);
  const alternar = <T,>(lista: T[], valor: T): T[] =>
    lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1.5">
        <Chip
          ativo={filtros.semResposta}
          onClick={() => onFiltros({ ...filtros, semResposta: !filtros.semResposta })}
        >
          Sem resposta
        </Chip>
        <Chip
          ativo={filtros.status === "abertas"}
          onClick={() =>
            onFiltros({ ...filtros, status: filtros.status === "abertas" ? "todas" : "abertas" })
          }
        >
          Abertas
        </Chip>

        <div className="ml-auto flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Mais filtros"
                className={cn(
                  "press relative grid h-8 w-8 place-items-center rounded-xl transition-colors",
                  ativos > 0 ? "bg-foreground text-white" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {ativos > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-gradient-primary px-1 text-3xs font-bold text-white">
                    {ativos}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-0">
              <div className="custom-scroll max-h-[60vh] overflow-y-auto p-3">
                <Grupo titulo="Situação">
                  <Opcao
                    marcada={filtros.status === "encerradas"}
                    onClick={() =>
                      onFiltros({
                        ...filtros,
                        status: filtros.status === "encerradas" ? "todas" : "encerradas",
                      })
                    }
                  >
                    Encerradas
                  </Opcao>
                </Grupo>

                <Grupo titulo="Cadastro">
                  {(["paciente", "lead"] as const).map((v) => (
                    <Opcao
                      key={v}
                      marcada={filtros.vinculo === v}
                      onClick={() =>
                        onFiltros({ ...filtros, vinculo: filtros.vinculo === v ? "todos" : v })
                      }
                    >
                      {v === "paciente" ? "É paciente" : "Ainda é lead"}
                    </Opcao>
                  ))}
                </Grupo>

                <Grupo titulo="Desfecho">
                  {(
                    [
                      ["negotiating", "Em negociação"],
                      ["won", "Ganho"],
                      ["lost", "Perdido"],
                    ] as [DealStatus, string][]
                  ).map(([valor, rotulo]) => (
                    <Opcao
                      key={valor}
                      marcada={filtros.desfechos.includes(valor)}
                      onClick={() =>
                        onFiltros({ ...filtros, desfechos: alternar(filtros.desfechos, valor) })
                      }
                    >
                      {rotulo}
                    </Opcao>
                  ))}
                </Grupo>

                {/* Etapa e etiqueta só aparecem se a clínica tiver alguma —
                    um título com lista vazia embaixo é ruído em toda abertura. */}
                {etapas.length > 0 && (
                  <Grupo titulo="Etapa do funil">
                    {etapas.map((e) => (
                      <Opcao
                        key={e.id}
                        marcada={filtros.etapaIds.includes(e.id)}
                        onClick={() =>
                          onFiltros({ ...filtros, etapaIds: alternar(filtros.etapaIds, e.id) })
                        }
                      >
                        {e.name}
                      </Opcao>
                    ))}
                    <Opcao
                      marcada={filtros.etapaIds.includes(SEM_ETAPA)}
                      onClick={() =>
                        onFiltros({ ...filtros, etapaIds: alternar(filtros.etapaIds, SEM_ETAPA) })
                      }
                    >
                      Sem etapa
                    </Opcao>
                  </Grupo>
                )}

                {tags.length > 0 && (
                  <Grupo titulo="Etiqueta">
                    {tags.map((t) => (
                      <Opcao
                        key={t.id}
                        marcada={filtros.tagIds.includes(t.id)}
                        onClick={() =>
                          onFiltros({ ...filtros, tagIds: alternar(filtros.tagIds, t.id) })
                        }
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: corDeTag(t.color).ponto }}
                          />
                          <span className="min-w-0 truncate">{t.name}</span>
                        </span>
                      </Opcao>
                    ))}
                  </Grupo>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Ordenar: ${ROTULO_DA_ORDENACAO[ordem]}`}
                className="press grid h-8 w-8 place-items-center rounded-xl text-muted-foreground hover:bg-muted"
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ORDENACOES.map((o) => (
                <DropdownMenuItem key={o} onClick={() => onOrdem(o)}>
                  <Check className={cn("h-3.5 w-3.5", o !== ordem && "opacity-0")} />
                  {ROTULO_DA_ORDENACAO[o]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Com filtro ligado, dizer QUANTAS sobraram e oferecer a saída. Sem esta
          linha, uma lista curta parece uma caixa vazia — e o filtro esquecido
          vira "sumiram as conversas". */}
      {ativos > 0 && (
        <div className="flex items-center justify-between gap-2 px-1 text-2xs text-muted-foreground">
          <span>
            {quantidade} de {total} conversas
          </span>
          <button
            type="button"
            onClick={() => onFiltros({ ...FILTROS_VAZIOS, busca: filtros.busca })}
            className="press flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-medium text-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" />
            Limpar
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "press shrink-0 rounded-full border px-3 py-1.5 text-2xs font-medium transition-colors",
        ativo
          ? "border-transparent bg-foreground text-white"
          : "border-border bg-white text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-1 last:mb-0">
      <p className="px-2 pb-1 pt-2 text-3xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
        {titulo}
      </p>
      {children}
    </div>
  );
}

function Opcao({
  marcada,
  onClick,
  children,
}: {
  marcada: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="checkbox"
      aria-checked={marcada}
      className="press flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-muted"
    >
      <span
        className={cn(
          "grid h-4 w-4 shrink-0 place-items-center rounded-md border",
          marcada ? "border-transparent bg-foreground text-white" : "border-border",
        )}
      >
        {marcada && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}
