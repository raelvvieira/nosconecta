import { createFileRoute, redirect } from "@tanstack/react-router";

// As ofertas agora ficam dentro do Agente de IA, junto do que a assistente sabe
// de cada uma. O endereço antigo continua valendo para quem o guardou.
export const Route = createFileRoute("/configuracoes/ofertas")({
  beforeLoad: () => {
    throw redirect({ to: "/agente-ia", search: { aba: "ofertas" }, replace: true });
  },
});
