import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Início · NÓS Conecta" },
      { name: "description", content: "Resumo do dia da clínica odontológica." },
    ],
  }),
  component: Raiz,
});

/** No endereço do cartão (`club.…`), a raiz é a área do paciente; no resto, o início da equipe. */
function Raiz() {
  const doClube = window.location.hostname.toLowerCase().split(".")[0] === "club";
  return <Navigate to={doClube ? "/club" : "/inicio"} replace />;
}
