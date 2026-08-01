import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Início · NÓS Conecta" },
      { name: "description", content: "Resumo do dia da clínica odontológica." },
    ],
  }),
  component: () => <Navigate to="/inicio" replace />,
});
