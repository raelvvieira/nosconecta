import { createFileRoute, redirect } from "@tanstack/react-router";

// As promoções de preço agora são ofertas. O endereço antigo continua valendo
// para quem tinha o link guardado.
export const Route = createFileRoute("/configuracoes/campanhas")({
  beforeLoad: () => {
    throw redirect({ to: "/configuracoes/ofertas", replace: true });
  },
});
