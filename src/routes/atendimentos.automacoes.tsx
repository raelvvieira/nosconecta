import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout puro, mesmo papel de pacientes.tsx/configuracoes.tsx: a lista mora
// em .index.tsx e o editor em .$automationId.tsx, que é rota FILHA desta.
// Sem este <Outlet /> o editor nunca monta — a URL muda e a lista fica na
// tela, dando a impressão de que o botão "Nova automação" não faz nada.
export const Route = createFileRoute("/atendimentos/automacoes")({
  component: AutomacoesLayout,
});

function AutomacoesLayout() {
  return <Outlet />;
}
