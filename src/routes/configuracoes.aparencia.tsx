import { createFileRoute } from "@tanstack/react-router";
import { Palette } from "lucide-react";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { EscolhaDeTema } from "@/components/tema/EscolhaDeTema";

export const Route = createFileRoute("/configuracoes/aparencia")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Aparência · Configurações · NÓS Conecta" },
      { name: "description", content: "A cor do seu NÓS Conecta." },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível abrir a aparência"
      description="Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: AparenciaPage,
});

function AparenciaPage() {
  return (
    <div className="surface-card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Palette className="h-[1.1em] w-[1.1em] text-pink" strokeWidth={1.75} />
        Aparência
      </h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        A cor do seu sistema. Muda na hora e vale só para você, em qualquer aparelho.
      </p>
      <div className="mt-5">
        <EscolhaDeTema />
      </div>
    </div>
  );
}
