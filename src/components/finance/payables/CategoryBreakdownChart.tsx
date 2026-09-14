import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { PayablesOverview } from "@/lib/finance/payables.functions";

/**
 * O donut de gastos por categoria de Pagamentos.
 *
 * Morava dentro de `routes/pagamentos.tsx`, e por isso arrastava `recharts`
 * — 356 KB — para o pedaço da rota inteira. Quem abria Pagamentos para
 * conferir um boleto baixava a biblioteca de gráficos antes de a lista
 * aparecer.
 *
 * Aqui, isolado, ele é carregado sob demanda (ver `SobDemanda`): a lista pinta
 * na hora e o donut chega depois.
 */

const CORES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--info)",
  "var(--warning)",
  "var(--foreground-subtle)",
];

export function CategoryBreakdownChart({
  items,
}: {
  items: PayablesOverview["categoryBreakdown"];
}) {
  const data = items.slice(0, 7);
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          innerRadius={42}
          outerRadius={58}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CORES[i % CORES.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
