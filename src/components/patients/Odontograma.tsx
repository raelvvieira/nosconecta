import { cn } from "@/lib/utils";
import {
  ARCADAS,
  REGIOES_GERAIS,
  arcadaDoDente,
  tipoDoDente,
  type Denticao,
  type TipoDoDente,
} from "@/lib/patients/odontograma";

// O odontograma: a boca desenhada, dente a dente, para tocar e anotar.
//
// ── O que mudou em 31/10 ──────────────────────────────────────────────────
//
// Era uma grade de quadradinhos numerados, só da arcada permanente e só para
// ler. Virou o desenho de cada dente (coroa e raiz, no formato do tipo), com
// decíduos, com as regiões gerais (maxila, mandíbula, face, arcadas) e com o
// toque que abre a anotação — o que a clínica tinha no sistema antigo e pediu
// de volta.
//
// Sem superfícies (vestibular, oclusal…), como antes: cinco alvos por dente
// é detalhe que a clínica não usa, e `treatment_items.tooth` é texto e
// comporta a extensão sem migration no dia em que fizer falta.

export type EstadoDoDente = "livre" | "pendente" | "concluido";

/** Coroa e raízes de cada tipo, desenhados de cabeça para cima (dente
 *  superior: raiz em cima, coroa embaixo), numa caixa de 28 × 46. Os
 *  inferiores são o mesmo desenho espelhado. */
const DESENHO: Record<TipoDoDente, { raizes: string[]; coroa: string; sulcos?: string }> = {
  incisivo: {
    raizes: ["M11 3 Q14 0 17 3 L18.5 21 L9.5 21 Z"],
    coroa: "M8 21 L20 21 Q22 33 19 42 Q14 45.5 9 42 Q6 33 8 21 Z",
  },
  canino: {
    raizes: ["M11.5 2 Q14 -0.5 16.5 2 L19 21 L9 21 Z"],
    coroa: "M7.5 21 L20.5 21 Q23 32 14 45 Q5 32 7.5 21 Z",
  },
  "pre-molar": {
    raizes: ["M10 3 Q14 0 18 3 L20 21 L8 21 Z"],
    coroa: "M6 21 L22 21 Q24.5 32 21 41 Q14 45.5 7 41 Q3.5 32 6 21 Z",
    sulcos: "M11 29 Q14 32 17 29",
  },
  molar: {
    raizes: ["M4 4 Q7 1 10 4 L12 21 L4.5 21 Z", "M18 4 Q21 1 24 4 L23.5 21 L16 21 Z"],
    coroa: "M3 21 L25 21 Q27.5 32 23.5 41 Q14 46 4.5 41 Q0.5 32 3 21 Z",
    sulcos: "M8 29 Q11 32 14 29 Q17 32 20 29",
  },
};

const COR_DA_COROA: Record<EstadoDoDente, string> = {
  livre: "fill-card stroke-border",
  pendente: "fill-warning-soft stroke-warning/70",
  concluido: "fill-success-soft stroke-success/70",
};

function Dente({
  numero,
  estado,
  anotacoes,
  selecionado,
  onClick,
}: {
  numero: string;
  estado: EstadoDoDente;
  anotacoes: number;
  selecionado: boolean;
  onClick?: (n: string) => void;
}) {
  const d = DESENHO[tipoDoDente(numero)];
  const superior = arcadaDoDente(numero) === "superior";
  const desenho = (
    <svg
      viewBox="0 0 28 46"
      className="h-[46px] w-7 overflow-visible"
      aria-hidden
      // O inferior é o superior de ponta-cabeça: coroa em cima, raiz embaixo.
      style={superior ? undefined : { transform: "scaleY(-1)" }}
    >
      {d.raizes.map((r, i) => (
        <path key={i} d={r} className="fill-surface-subtle stroke-border" strokeWidth="1" />
      ))}
      <path
        d={d.coroa}
        className={cn("transition-colors", COR_DA_COROA[estado])}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {d.sulcos && (
        <path
          d={d.sulcos}
          fill="none"
          className="stroke-border"
          strokeWidth="1"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
  const numeroEl = (
    <span
      className={cn(
        "text-2xs font-medium tabular-nums",
        selecionado ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {numero}
    </span>
  );
  const marcador = anotacoes > 0 && (
    <span
      className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-pink px-1 text-[9px] font-bold leading-none text-white"
      aria-label={`${anotacoes} anotação${anotacoes === 1 ? "" : "ões"}`}
    >
      {anotacoes}
    </span>
  );

  const conteudo = (
    <>
      {superior && numeroEl}
      <span className="relative">
        {desenho}
        {marcador}
      </span>
      {!superior && numeroEl}
    </>
  );

  const classe = cn(
    "flex w-9 flex-col items-center gap-1 rounded-xl py-1 transition-colors",
    selecionado && "bg-pink-soft/70 ring-2 ring-pink/40",
  );

  if (!onClick) {
    return (
      <div className={classe} title={`Dente ${numero}`}>
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
      className={cn(
        classe,
        "press hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      )}
    >
      {conteudo}
    </button>
  );
}

export function Odontograma({
  denticao = "permanente",
  estados,
  anotacoes = {},
  selecionado,
  onSelecionar,
}: {
  denticao?: Denticao;
  /** Dente → estado do tratamento. Dente ausente do mapa é "livre". */
  estados: Record<string, EstadoDoDente>;
  /** Região → quantas anotações. Vale para dentes e para as regiões gerais. */
  anotacoes?: Record<string, number>;
  selecionado?: string | null;
  /** Sem isto o odontograma é só leitura. */
  onSelecionar?: (regiao: string) => void;
}) {
  const arcada = (metades: [string[], string[]]) => (
    <div className="flex justify-center gap-5">
      {metades.map((lado, i) => (
        <div key={i} className="flex gap-0.5">
          {lado.map((n) => (
            <Dente
              key={n}
              numero={n}
              estado={estados[n] ?? "livre"}
              anotacoes={anotacoes[n] ?? 0}
              selecionado={selecionado === n}
              onClick={onSelecionar}
            />
          ))}
        </div>
      ))}
    </div>
  );
  const arcadas = ARCADAS[denticao];

  return (
    <div className="space-y-4">
      {/* Rola no eixo próprio em telas estreitas: 16 dentes numa linha não
          cabem em 360px, e deixar a PÁGINA rolar para o lado seria pior. */}
      <div className="custom-scroll overflow-x-auto">
        <div className="mx-auto w-fit min-w-[400px] space-y-1 py-1">
          {arcada(arcadas.superior)}
          <div className="mx-auto h-px w-[90%] bg-border" />
          {arcada(arcadas.inferior)}
        </div>
      </div>

      {/* As regiões que não são um dente só. */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {REGIOES_GERAIS.map((r) => {
          const n = anotacoes[r.id] ?? 0;
          const ativo = selecionado === r.id;
          return (
            <button
              key={r.id}
              type="button"
              disabled={!onSelecionar}
              onClick={() => onSelecionar?.(r.id)}
              aria-pressed={ativo}
              className={cn(
                "press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default",
                ativo
                  ? "border-pink/40 bg-pink-soft text-pink"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {r.rotulo}
              {n > 0 && (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-pink px-1 text-[9px] font-bold text-white">
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LegendaDoOdontograma() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-2xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border border-warning/40 bg-warning-soft" /> A fazer
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border border-success/40 bg-success-soft" /> Concluído
      </span>
      <span className="flex items-center gap-1.5">
        <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-pink text-[8px] font-bold text-white">
          1
        </span>{" "}
        Anotação
      </span>
    </div>
  );
}
