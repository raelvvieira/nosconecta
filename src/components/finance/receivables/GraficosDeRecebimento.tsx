import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { corCategorica } from "@/lib/finance/chart-theme";
import { formatBRL } from "@/lib/finance/format";
import type { ReceivablesOverview } from "@/lib/finance/receivables.functions";

/**
 * Os dois gráficos de Recebimentos, fora da rota.
 *
 * Moravam dentro de `routes/recebimentos.tsx` e arrastavam `recharts` — 356 KB
 * — para o pedaço da rota. Quem abria Recebimentos para conferir uma cobrança
 * baixava a biblioteca inteira antes de a tabela aparecer.
 *
 * Aqui eles são carregados sob demanda (ver `SobDemanda`), e nada mais muda:
 * é o mesmo desenho, com os mesmos dados.
 */

export function EvolucaoDeRecebimentos({ data }: { data: ReceivablesOverview["evolution"] }) {
  return (
    <ResponsiveContainer>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="period"
          stroke="var(--muted-foreground)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="var(--muted-foreground)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            borderRadius: "var(--radius-control)",
            border: "1px solid var(--border)",
            background: "var(--card)",
          }}
          formatter={(v: number, name) => [formatBRL(v), name]}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: "0.75rem", paddingBottom: 12 }} />
        <Bar dataKey="received" name="Recebido" stackId="a" fill="var(--success-soft)" />
        <Bar dataKey="expected" name="Previsto" stackId="a" fill="var(--warning-soft)" />
        <Bar
          dataKey="overdue"
          name="Atrasado"
          stackId="a"
          fill="var(--danger-soft)"
          radius={[6, 6, 0, 0]}
        />
        <Line
          type="monotone"
          dataKey="goal"
          name="Meta mensal"
          stroke="var(--info)"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function DonutDeProcedimentos({ data }: { data: ReceivablesOverview["topProcedures"] }) {
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie data={data} dataKey="value" innerRadius={40} outerRadius={60} stroke="none">
          {data.map((_, i) => (
            <Cell key={i} fill={corCategorica(i)} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
