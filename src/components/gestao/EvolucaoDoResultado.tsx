import { useState } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { PontoDaEvolucao } from "@/lib/gestao/visao";
import { mesCurto, nomeDoMes, pct, reais } from "@/lib/gestao/formato";
import { CHART_AXIS, CHART_SERIES, CHART_TICK_FONT_SIZE } from "@/lib/finance/chart-theme";

// Seis meses, em dois gráficos pequenos de uma série só: Receita e Resultado.
//
// Separados de propósito, e não num gráfico só com duas linhas ou dois eixos:
// o resultado pode ser negativo e é bem menor que a receita, e no mesmo eixo
// ele vira uma risca. Cada um tem a sua escala, e a leitura é "subiu ou
// desceu em relação aos outros meses" — que é a pergunta de quem olha.
//
// O mês escolhido na tela fica na cor cheia, os outros esmaecem (ênfase, não
// categoria): uma só série, uma só cor. O valor do mês aparece em cima da
// barra; os demais, ao passar o mouse.

function Dica({
  active,
  payload,
  rotulo,
}: {
  active?: boolean;
  payload?: { payload: PontoDaEvolucao }[];
  rotulo: "Receita" | "Resultado";
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as PontoDaEvolucao;
  return (
    <div className="rounded-xl border border-border/70 bg-popover/95 p-2.5 text-xs shadow-lg backdrop-blur">
      <p className="mb-1 font-medium">{nomeDoMes(p.mes)}</p>
      <p className="tabular-nums">
        {rotulo}:{" "}
        <span className="font-semibold">
          {reais(rotulo === "Receita" ? p.receita : p.resultado)}
        </span>
      </p>
      {rotulo === "Resultado" && p.margem !== null && (
        <p className="text-muted-foreground">Margem {pct(p.margem)}</p>
      )}
    </div>
  );
}

function Mini({
  titulo,
  pontos,
  mesAtual,
  valor,
  cor,
}: {
  titulo: "Receita" | "Resultado";
  pontos: PontoDaEvolucao[];
  mesAtual: string;
  valor: (p: PontoDaEvolucao) => number;
  cor: (p: PontoDaEvolucao) => string;
}) {
  const [sobre, setSobre] = useState<string | null>(null);
  const dados = pontos.map((p) => ({ ...p, v: valor(p) }));
  const destaque = sobre ?? mesAtual;
  const marcado = dados.find((d) => d.mes === destaque);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-sm tabular-nums text-muted-foreground">
          {marcado ? `${mesCurto(marcado.mes)} · ${reais(marcado.v)}` : ""}
        </p>
      </div>
      <div className="mt-3 h-40" role="img" aria-label={`${titulo} dos últimos seis meses`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={dados}
            margin={{ top: 6, right: 0, bottom: 0, left: 0 }}
            barCategoryGap="22%"
            onMouseMove={(e) =>
              setSobre(
                (e as unknown as { activePayload?: { payload: PontoDaEvolucao }[] })
                  .activePayload?.[0]?.payload.mes ?? null,
              )
            }
            onMouseLeave={() => setSobre(null)}
          >
            <XAxis
              dataKey="mes"
              tickFormatter={mesCurto}
              axisLine={false}
              tickLine={false}
              tick={{ fill: CHART_AXIS.tick, fontSize: CHART_TICK_FONT_SIZE }}
              interval={0}
            />
            <ReferenceLine y={0} stroke={CHART_AXIS.zero} />
            <Tooltip cursor={false} content={<Dica rotulo={titulo} />} />
            {/* Barra fina, com a ponta arredondada: a marca recua para o dado
                aparecer. */}
            <Bar dataKey="v" radius={[4, 4, 4, 4]} isAnimationActive={false}>
              {dados.map((d) => (
                <Cell key={d.mes} fill={cor(d)} fillOpacity={d.mes === destaque ? 1 : 0.38} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function EvolucaoDoResultado({
  pontos,
  mesAtual,
}: {
  pontos: PontoDaEvolucao[];
  mesAtual: string;
}) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Mini
        titulo="Receita"
        pontos={pontos}
        mesAtual={mesAtual}
        valor={(p) => p.receita}
        cor={() => CHART_SERIES.entrada}
      />
      <Mini
        titulo="Resultado"
        pontos={pontos}
        mesAtual={mesAtual}
        valor={(p) => p.resultado}
        // Acima do zero, verde; abaixo, vermelho — e a posição já diz o mesmo,
        // então a cor nunca é a única pista.
        cor={(p) => (p.resultado >= 0 ? "var(--success)" : CHART_SERIES.saida)}
      />
    </div>
  );
}
