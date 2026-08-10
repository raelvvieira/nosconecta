import { Link } from "@tanstack/react-router";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Workflow } from "lucide-react";
import type { PipelineItem, PipelineStage } from "@/lib/atendimentos/pipeline.functions";

// Mesmo padrão donut+legenda de RevenueByProcedure.tsx (finance), adaptado
// pra contagem de itens por etapa em vez de faturamento em BRL.
const FALLBACK_COLOR = "var(--foreground-subtle)";

export function PipelineFunnelCard({
  configured,
  stages,
  items,
}: {
  configured: boolean;
  stages: PipelineStage[];
  items: PipelineItem[];
}) {
  const data = stages
    .map((s) => ({ id: s.id, name: s.name, value: items.filter((i) => i.stageId === s.id).length, color: s.color }))
    .sort((a, b) => b.value - a.value);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <section className="surface-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Workflow className="h-4 w-4 text-pink" />
          Funil por etapa
        </h2>
        <Link to="/atendimentos/pipeline" className="text-xs font-medium text-primary hover:underline">
          Ver pipeline
        </Link>
      </div>

      {!configured ? (
        <p className="text-sm text-muted-foreground">Configure um pipeline em Atendimentos → Pipeline pra ver o funil aqui.</p>
      ) : total === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum contato no funil ainda.</p>
      ) : (
        <div className="flex items-center gap-6">
          <div className="h-[150px] w-[150px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2} stroke="none">
                  {data.map((d) => (
                    <Cell key={d.id} fill={d.color ?? FALLBACK_COLOR} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ul className="flex-1 space-y-2.5">
            {data.map((d) => (
              <li key={d.id} className="grid grid-cols-[1fr_auto_36px] items-center gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color ?? FALLBACK_COLOR }} />
                  <span className="truncate text-muted-foreground">{d.name}</span>
                </span>
                <span className="font-medium tabular-nums">{d.value}</span>
                <span className="text-right text-xs tabular-nums text-muted-foreground">
                  {total > 0 ? Math.round((d.value / total) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
