import { cn } from "@/lib/utils";

// Odontograma: a arcada permanente em notação FDI.
//
// Leitura e marcação por dente, sem superfícies (vestibular, oclusal, mesial…).
// Superfície por dente multiplica por cinco o número de alvos de toque e o
// tamanho do dado guardado, e é detalhe que a clínica não usa no dia a dia —
// o orçamento fala "restauração no 26", não "restauração na oclusal do 26".
// Quando fizer falta, `treatment_items.tooth` é texto e comporta a extensão
// sem migration.

/** Ordem FDI, como se olha para a boca do paciente: da direita dele (18) para
 *  a esquerda (28) em cima, e o espelho embaixo. */
const SUPERIOR = [
  ["18", "17", "16", "15", "14", "13", "12", "11"],
  ["21", "22", "23", "24", "25", "26", "27", "28"],
];
const INFERIOR = [
  ["48", "47", "46", "45", "44", "43", "42", "41"],
  ["31", "32", "33", "34", "35", "36", "37", "38"],
];

export type EstadoDoDente = "livre" | "pendente" | "concluido";

function Dente({
  numero,
  estado,
  selecionado,
  onClick,
}: {
  numero: string;
  estado: EstadoDoDente;
  selecionado: boolean;
  onClick?: (n: string) => void;
}) {
  const interativo = !!onClick;
  const conteudo = (
    <>
      <span
        className={cn(
          "grid h-7 w-7 place-items-center rounded-md border text-2xs font-semibold transition-colors",
          estado === "concluido" && "border-success/30 bg-success-soft text-success",
          estado === "pendente" && "border-warning/30 bg-warning-soft text-warning",
          estado === "livre" && "border-border bg-card text-muted-foreground",
          selecionado && "ring-2 ring-ring ring-offset-1",
        )}
      >
        {numero}
      </span>
    </>
  );

  if (!interativo) {
    return (
      <div className="flex flex-col items-center" title={`Dente ${numero}`}>
        {conteudo}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onClick(numero)}
      aria-pressed={selecionado}
      aria-label={`Dente ${numero}`}
      className="press flex flex-col items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {conteudo}
    </button>
  );
}

export function Odontograma({
  estados,
  selecionado,
  onSelecionar,
}: {
  /** Dente → estado. Dente ausente do mapa é "livre". */
  estados: Record<string, EstadoDoDente>;
  selecionado?: string | null;
  onSelecionar?: (numero: string) => void;
}) {
  const arcada = (linhas: string[][]) => (
    <div className="flex justify-center gap-4">
      {linhas.map((lado, i) => (
        <div key={i} className="flex gap-1">
          {lado.map((n) => (
            <Dente
              key={n}
              numero={n}
              estado={estados[n] ?? "livre"}
              selecionado={selecionado === n}
              onClick={onSelecionar}
            />
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Rola no eixo próprio em telas estreitas: 16 dentes numa linha não
          cabem em 360px, e deixar a PÁGINA rolar para o lado seria pior. */}
      <div className="custom-scroll overflow-x-auto">
        <div className="min-w-[420px] space-y-2 py-1">
          {arcada(SUPERIOR)}
          <div className="mx-auto h-px w-[92%] bg-border" />
          {arcada(INFERIOR)}
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-4 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-warning/30 bg-warning-soft" /> A fazer
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-success/30 bg-success-soft" /> Concluído
        </span>
      </div>
    </div>
  );
}
