import { Link, useLocation } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

/** As telas cuja barra de baixo é um submenu, e não os módulos. */
const COM_SUBMENU = new Set(["/financeiro", "/recebimentos", "/pagamentos", "/planejamento"]);

/**
 * "‹ Início" no topo, só no celular, só nas telas do financeiro.
 *
 * Lá a barra de baixo mostra o submenu do módulo (Visão geral, Recebimentos,
 * Pagamentos, Planejamento), e não havia caminho de volta para o resto do
 * sistema — a clínica ficava presa no financeiro (23/10). Mesma solução do
 * "‹ Configurações": uma linha de volta no topo, que é onde o iPhone a põe.
 */
export function VoltarAoInicio() {
  const { pathname } = useLocation();
  if (!COM_SUBMENU.has(pathname)) return null;
  return (
    <Link
      to="/inicio"
      className="press -ml-1 mb-2 inline-flex items-center gap-0.5 text-sm font-medium text-pink lg:hidden"
    >
      <ChevronLeft className="h-4 w-4" strokeWidth={2} /> Início
    </Link>
  );
}
