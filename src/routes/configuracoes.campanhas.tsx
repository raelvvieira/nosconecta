import { createFileRoute, redirect } from "@tanstack/react-router";

// As promoções de preço agora são ofertas, dentro do Agente de IA. O endereço
// antigo continua valendo para quem o tinha guardado.
export const Route = createFileRoute("/configuracoes/campanhas")({
  beforeLoad: () => {
    throw redirect({ to: "/agente-ia", search: { aba: "ofertas" }, replace: true });
  },
});
