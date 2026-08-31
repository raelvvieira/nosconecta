import { Loader2 } from "lucide-react";
import type { PainelDoFunil as Dados } from "@/lib/agente-ia/agente.functions";
import { cn } from "@/lib/utils";

const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * O retrato do funil, sem IA nenhuma.
 *
 * Contagem e aritmética sobre negociações que já são locais. Fica aqui, e não
 * numa aba própria, porque responde à pergunta que a pessoa já tem na cabeça
 * ao abrir esta tela: "tem material para o agente aprender?".
 *
 * Números que não existem aparecem como travessão, nunca como zero: taxa de
 * conversão 0% e "ainda não há desfecho" contam histórias opostas, e trocar uma
 * pela outra faria a clínica achar que não fecha nada.
 */
export function PainelDoFunil({
  painel,
  carregando,
}: {
  painel: Dados | undefined;
  carregando: boolean;
}) {
  if (carregando) {
    return (
      <section className="rounded-3xl border border-border bg-white/70 p-6">
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }
  if (!painel) return null;

  const semNada = painel.ganhos + painel.perdidos + painel.emNegociacao === 0;

  return (
    <section className="rounded-3xl border border-border bg-white/70 p-6">
      <h2 className="text-base font-semibold">Seu funil hoje</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {semNada
          ? "Nenhuma negociação registrada ainda."
          : "O material que o agente tem para aprender."}
      </p>

      {!semNada && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Numero rotulo="Ganhos" valor={painel.ganhos} destaque />
            <Numero rotulo="Perdidos" valor={painel.perdidos} />
            <Numero rotulo="Em negociação" valor={painel.emNegociacao} />
            <Numero
              rotulo="Conversão"
              texto={painel.conversao === null ? "—" : `${Math.round(painel.conversao * 100)}%`}
            />
          </div>

          {painel.valorGanho > 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{reais(painel.valorGanho)}</span> em
              tratamentos fechados.
            </p>
          )}

          {painel.motivosDePerda.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Por que se perde
              </p>
              <ul className="mt-2.5 grid gap-1.5">
                {painel.motivosDePerda.map((m) => (
                  <li key={m.motivo} className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="min-w-0 truncate">{m.motivo}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{m.quantos}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Numero({
  rotulo,
  valor,
  texto,
  destaque,
}: {
  rotulo: string;
  valor?: number;
  texto?: string;
  destaque?: boolean;
}) {
  return (
    <div className={cn("rounded-2xl px-4 py-3.5", destaque ? "bg-coral-soft" : "bg-muted/60")}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={cn("mt-0.5 text-2xl font-semibold tabular-nums", destaque && "text-coral")}>
        {texto ?? valor ?? 0}
      </p>
    </div>
  );
}
