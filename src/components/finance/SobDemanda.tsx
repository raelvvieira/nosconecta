import { Suspense, type ComponentType, type ReactNode } from "react";

/**
 * A fronteira de carregamento sob demanda dos gráficos.
 *
 * ── O problema ───────────────────────────────────────────────────────────
 *
 * `recharts` pesa 356 KB — sozinho, um sexto de tudo que o navegador baixa. E
 * como nenhum gráfico era carregado sob demanda (o projeto não tinha `lazy()`
 * em lugar nenhum), essa biblioteca entrava no pedaço de cada rota que mostra
 * gráfico e era baixada antes da tela pintar.
 *
 * Quem abre Pagamentos para conferir um boleto esperava 356 KB de biblioteca
 * de gráfico para ver uma lista.
 *
 * ── O que muda ───────────────────────────────────────────────────────────
 *
 * O gráfico passa a chegar depois, e no lugar dele aparece a MOLDURA com a
 * altura final. Isso não é só cosmético: sem altura reservada, o conteúdo
 * abaixo salta quando o gráfico chega, e a pessoa clica no lugar errado.
 *
 * ── Por que uma moldura, e não um "carregando…" ─────────────────────────
 *
 * O texto anuncia a espera; a moldura a esconde. Como o gráfico chega em
 * milissegundos numa conexão decente, anunciar seria pior — um piscar de
 * palavra que some antes de ser lida.
 */
export function MolduraDeGrafico({ altura = 260 }: { altura?: number | string }) {
  return (
    <div
      className="w-full animate-pulse rounded-2xl bg-muted/40"
      style={{ height: typeof altura === "number" ? `${altura}px` : altura }}
      aria-hidden
    />
  );
}

/**
 * Embrulha um componente carregado por `lazy()` com a moldura certa.
 *
 * Uso:
 *   const Grafico = lazy(() => import("./CashFlowChart").then(m => ({ default: m.CashFlowChart })));
 *   <SobDemanda altura={300}><Grafico data={...} /></SobDemanda>
 */
export function SobDemanda({
  children,
  altura,
}: {
  children: ReactNode;
  altura?: number | string;
}) {
  return <Suspense fallback={<MolduraDeGrafico altura={altura} />}>{children}</Suspense>;
}

/**
 * Atalho para o caso mais comum: pegar a exportação NOMEADA de um módulo.
 *
 * `lazy()` exige um módulo com `default`, e este projeto exporta tudo por
 * nome. Sem este ajudante, cada ponto de uso repetiria o mesmo
 * `.then(m => ({ default: m.X }))` — e um deles acabaria escrito errado.
 */
export function nomeado<P>(
  carregar: () => Promise<Record<string, unknown>>,
  nome: string,
): () => Promise<{ default: ComponentType<P> }> {
  return () => carregar().then((m) => ({ default: m[nome] as ComponentType<P> }));
}
