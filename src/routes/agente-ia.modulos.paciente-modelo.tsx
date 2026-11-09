import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { listarOfertasDoAgente } from "@/lib/agente-ia/ofertas.functions";

// A gestão do Paciente Modelo agora mora na ficha da oferta (Agente de IA >
// Ofertas > Paciente Modelo > Edições e vagas). O endereço antigo continua
// valendo para quem o tinha guardado e leva para lá, na mesma sub-aba.

const SUB_DA_ABA_ANTIGA = {
  edicoes: "edicoes",
  ofertas: "procedimentos",
  reservas: "reservas",
  regras: "regras",
} as const;

export const Route = createFileRoute("/agente-ia/modulos/paciente-modelo")({
  validateSearch: z.object({
    aba: z.enum(["edicoes", "ofertas", "reservas", "regras"]).optional(),
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error} title="Não foi possível abrir a oferta" semSidebar />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: IrParaAOferta,
});

function IrParaAOferta() {
  const { aba } = Route.useSearch();
  const navigate = useNavigate();
  const buscar = useServerFn(listarOfertasDoAgente);
  const query = useQuery({ queryKey: ["agente-ofertas"], queryFn: () => buscar() });

  useEffect(() => {
    if (!query.data) return;
    const oferta = query.data.find((o) => o.modulo === "paciente_modelo");
    if (oferta) {
      navigate({
        to: "/agente-ia/ofertas/$id",
        params: { id: oferta.id },
        search: { aba: "edicoes", sub: SUB_DA_ABA_ANTIGA[aba ?? "edicoes"] },
        replace: true,
      });
    } else {
      navigate({ to: "/agente-ia", search: { aba: "ofertas" }, replace: true });
    }
  }, [query.data, aba, navigate]);

  return (
    <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10">
      <p className="text-sm text-muted-foreground">Abrindo a oferta…</p>
    </main>
  );
}
