import { AlertCircle, Home, RotateCcw } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Sidebar } from "@/components/finance/Sidebar";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  description?: string;
  notFound?: boolean;
  onRetry?: () => void;
  /**
   * O erro que derrubou a tela.
   *
   * Aparece porque "Houve uma falha, tente novamente" não ajuda ninguém: nem
   * quem está usando, que não sabe se é internet, sessão ou defeito, nem quem
   * vai consertar, que precisa pedir print de console num celular. A mensagem
   * técnica fica recolhida, longe de quem só quer recarregar.
   */
  error?: unknown;
  /**
   * Não renderiza o menu lateral.
   *
   * Rotas de topo (/financeiro, /agenda…) desenham o próprio menu, então esta
   * tela precisa do dela. Já as rotas filhas de `atendimentos.tsx` e
   * `configuracoes.tsx` vivem DENTRO de um layout que já tem menu — sem esta
   * saída, qualquer erro ali mostrava dois menus lado a lado.
   */
  semSidebar?: boolean;
};

export function ResponsiveRouteState({
  title,
  description,
  notFound = false,
  onRetry,
  error,
  semSidebar = false,
}: Props) {
  const detalhe =
    error instanceof Error
      ? error.message
      : error
        ? String(error)
        : null;

  return (
    <div className="min-h-dvh app-bg lg:flex">
      {!semSidebar && <Sidebar />}
      <main className="flex min-h-dvh flex-1 items-center justify-center px-5 pb-nav pt-20 lg:min-h-0 lg:px-10 lg:pb-10 lg:pt-10">
        <section className="surface-card w-full max-w-[520px] px-6 py-8 text-center sm:px-10 sm:py-10">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-coral-soft text-coral">
            <AlertCircle className="h-6 w-6" />
          </span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-pink">
            {notFound ? "Página não encontrada" : "Não foi possível carregar"}
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">{title}</h1>
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
              <Link to="/inicio">
                <Home className="h-4 w-4" /> Ir para o início
              </Link>
            </Button>
          </div>

          {detalhe && (
            <details className="mt-6 text-left" data-detalhe-erro="">
              <summary className="cursor-pointer text-2xs text-muted-foreground">
                Detalhes técnicos
              </summary>
              <p className="mt-2 max-h-40 overflow-auto rounded-xl bg-surface px-3 py-2 font-mono text-2xs leading-4 text-foreground-secondary">
                {detalhe}
              </p>
            </details>
          )}
        </section>
      </main>
    </div>
  );
}
