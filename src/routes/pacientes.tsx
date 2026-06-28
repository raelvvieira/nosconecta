import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/pacientes")({
  component: PatientsLayout,
});

function PatientsLayout() {
  return <Outlet />;
}
