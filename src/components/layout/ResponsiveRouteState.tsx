import { AlertCircle, Home, RotateCcw } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Sidebar } from "@/components/finance/Sidebar";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  description?: string;
  notFound?: boolean;
  onRetry?: () => void;
};

export function ResponsiveRouteState({ title, description, notFound = false, onRetry }: Props) {
  return (
    <div className="min-h-screen app-bg lg:flex">
      <Sidebar />
      <main className="flex min-h-screen flex-1 items-center justify-center px-5 pb-28 pt-20 lg:min-h-0 lg:px-10 lg:pb-10 lg:pt-10">
        <section className="surface-card w-full max-w-[520px] px-6 py-8 text-center sm:px-10 sm:py-10">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] bg-coral-soft text-coral">
            <AlertCircle className="h-6 w-6" />
          </span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-pink">
            {notFound ? "Página não encontrada" : "Não foi possível carregar"}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            {description ??
              (notFound
                ? "O endereço pode ter mudado. Volte ao início para continuar."
                : "Os dados não responderam agora. Recarregue a página para tentar novamente.")}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {!notFound && (
              <Button
                className="gap-2 bg-gradient-primary text-white"
                onClick={onRetry ?? (() => window.location.reload())}
              >
                <RotateCcw className="h-4 w-4" /> Recarregar
              </Button>
            )}
            <Button asChild variant="outline" className="gap-2">
              <Link to="/">
                <Home className="h-4 w-4" /> Ir para o início
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
