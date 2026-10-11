import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { localDateStr } from "@/lib/date";
import { DateRangePicker } from "./DateRangePicker";
import { intervaloDoMes, mesCheioDe, mesesEmVolta, somarMeses } from "@/lib/finance/mes";

/**
 * O período das telas financeiras, em meses.
 *
 * ── O que ele substitui ─────────────────────────────────────────────────
 *
 * "Hoje · 7 dias · 30 dias · 90 dias", e o padrão de últimos 30 dias corridos.
 * Nenhuma dessas janelas fecha uma conta da clínica: o aluguel vence no dia 31,
 * o condomínio no 10, a fatura do cartão em dia fixo, o DAS e o pró-labore são
 * mensais. "Os últimos 30 dias" respondia uma pergunta que ninguém faz.
 *
 * ── Por que o mesmo componente nas quatro telas ─────────────────────────
 *
 * Porque antes o controle de período existia em duas (Financeiro e
 * Planejamento) e estava escondido dentro de "Filtros" nas outras duas — que
 * são justamente as telas em que se trabalha. Um controle que muda de lugar e
 * de forma conforme a tela é um controle que a pessoa reaprende toda vez.
 *
 * A janela desliza com as setas, então nenhum mês fica inalcançável; a barra
 * mostra quatro de cada vez para caber no celular sem rolagem lateral.
 */
export function SeletorDeMes({
  from,
  to,
  onChange,
  className,
}: {
  from?: string;
  to?: string;
  onChange: (r: { from?: string; to?: string }) => void;
  className?: string;
}) {
  const hoje = localDateStr();

  // Qual mês está aceso. `null` quando o intervalo da URL não é um mês cheio —
  // aí nenhuma pílula acende e o botão de período exato é que fica marcado,
  // que é a verdade do que está sendo mostrado.
  const mesAceso = mesCheioDe(from, to);

  // De onde a barra parte. Começa no mês de hoje e anda com as setas; se a URL
  // trouxer um mês fora da janela (um link salvo, por exemplo), a barra abre
  // nele para a pílula acesa estar visível.
  const [ancora, setAncora] = useState<string>(() => mesAceso ?? hoje.slice(0, 7));

  const meses = mesesEmVolta(`${ancora}-01`, 2, 1);
  const deslizar = (quantos: number) => setAncora((a) => somarMeses(a, quantos) || a);

  const escolher = (chave: string) => {
    const i = intervaloDoMes(chave);
    if (i) onChange({ from: i.de, to: i.ate });
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex items-center gap-1 p-1 rounded-xl bg-card/70 backdrop-blur border border-border/70 shadow-sm">
        <button
          type="button"
          onClick={() => deslizar(-1)}
          aria-label="Meses anteriores"
          className="h-9 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        </button>

        {meses.map((m) => (
          <button
            key={m.chave}
            type="button"
            onClick={() => escolher(m.chave)}
            aria-current={mesAceso === m.chave ? "true" : undefined}
            className={cn(
              "px-3 sm:px-4 h-9 text-sm rounded-lg whitespace-nowrap transition-[background-color,color,box-shadow]",
              mesAceso === m.chave
                ? "bg-primary text-primary-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m.rotulo}
            {/* Um ponto sob o mês corrente: depois de deslizar a barra três
                meses para trás, nada mais diria onde é "agora". */}
            {m.atual && mesAceso !== m.chave && (
              <span className="ml-1.5 inline-block h-1 w-1 rounded-full bg-primary align-middle" />
            )}
          </button>
        ))}

        <button
          type="button"
          onClick={() => deslizar(1)}
          aria-label="Meses seguintes"
          className="h-9 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      {/* O calendário continua existindo para quem precisa de um intervalo
          solto — uma quinzena, o período de uma campanha. Fica ao lado e
          apagado, porque é a exceção. */}
      <DateRangePicker
        from={mesAceso ? undefined : from}
        to={mesAceso ? undefined : to}
        onChange={onChange}
        className={cn("h-11", mesAceso && "text-muted-foreground")}
      />
    </div>
  );
}
