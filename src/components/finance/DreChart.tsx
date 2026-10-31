import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight } from "lucide-react";
import { formatBRL } from "@/lib/finance/format";
import { CHART_AXIS, CHART_SERIES } from "@/lib/finance/chart-theme";
import { mesDoDia, rotuloDoMes } from "@/lib/finance/mes";
import { localDateStr } from "@/lib/date";
import { getDre } from "@/lib/finance/dre.functions";

// O DRE de relance, ao lado do fluxo de caixa: receita contra gastos, mês a
// mês, e a linha do resultado líquido. O investimento fica fora, como na
// tela do DRE — é lá que se vê o detalhe.

const MESES = 6;

interface Ponto {
  mes: string;
  label: string;
  receita: number;
  gastos: number;
  custoVariavel: number;
  despesaFixa: number;
  financeiro: number;
  resultado: number;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload?: Ponto }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const linhas = [
    { label: "Receita", value: p.receita, color: CHART_SERIES.entrada },
    { label: "Custos variáveis", value: -p.custoVariavel, color: CHART_SERIES.saida },
    { label: "Despesas fixas", value: -p.despesaFixa, color: CHART_SERIES.saida },
    { label: "Financeiro e impostos", value: -p.financeiro, color: CHART_SERIES.saida },
    { label: "Resultado líquido", value: p.resultado, color: CHART_SERIES.saldo },
  ];
  return (
    <div className="min-w-[220px] rounded-xl border border-border/70 bg-popover/95 p-3 shadow-lg backdrop-blur">
      <p className="mb-2 text-xs text-muted-foreground">{p.label}</p>
      <div className="space-y-1.5">
        {linhas.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-6 text-xs">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
              {r.label}
            </span>
            <span className="font-medium tabular-nums">{formatBRL(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DreChart() {
  const hoje = localDateStr();
  const ate = mesDoDia(hoje);
  const buscar = useServerFn(getDre);
  const dre = useQuery({
    queryKey: ["dre", ate, MESES, "caixa"],
    queryFn: () => buscar({ data: { ate, meses: MESES, regime: "caixa" } }),
    staleTime: 60_000,
  });
  const d = dre.data?.dre;
  const pontos: Ponto[] =
    d?.meses.map((mes, i) => {
      const cv = d.linhas.custo_variavel.porMes[i];
      const df = d.linhas.despesa_fixa.porMes[i];
      const fi = d.linhas.financeiro.porMes[i];
      return {
        mes,
        label: rotuloDoMes(mes, hoje),
        receita: d.linhas.receita.porMes[i],
        gastos: Math.round((cv + df + fi) * 100) / 100,
        custoVariavel: cv,
        despesaFixa: df,
        financeiro: fi,
        resultado: d.resultadoLiquido[i],
      };
    }) ?? [];

  return (
    <section className="surface-card flex h-full flex-col p-6">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">DRE</h2>
          <span className="text-xs text-muted-foreground">últimos {MESES} meses, caixa</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: CHART_SERIES.entrada }}
              />
              Receita
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_SERIES.saida }} />
              Gastos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[2px] w-3" style={{ background: CHART_SERIES.saldo }} />
              Resultado
            </span>
          </div>
          <Link
            to="/dre"
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Ver DRE
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="min-h-[320px] flex-1">
        {dre.isLoading ? (
          <div className="h-full w-full animate-pulse rounded-2xl bg-muted/40" aria-hidden />
        ) : dre.error ? (
          <p className="pt-6 text-sm text-danger">{(dre.error as Error).message}</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={pontos} margin={{ top: 20, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={CHART_AXIS.grid} strokeDasharray="3 6" vertical={false} />
              <XAxis
                dataKey="label"
                stroke={CHART_AXIS.tick}
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke={CHART_AXIS.tick}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatBRL(v, { compact: true })}
                width={70}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "var(--surface-muted)", fillOpacity: 0.6 }}
              />
              <ReferenceLine y={0} stroke={CHART_AXIS.zero} />
              <Bar
                dataKey="receita"
                fill={CHART_SERIES.entrada}
                radius={[6, 6, 0, 0]}
                barSize={18}
              />
              <Bar dataKey="gastos" fill={CHART_SERIES.saida} radius={[6, 6, 0, 0]} barSize={18} />
              <Line
                type="monotone"
                dataKey="resultado"
                stroke={CHART_SERIES.saldo}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_SERIES.saldo, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
