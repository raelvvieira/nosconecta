import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { ContasECartoes } from "@/components/finance/GerenciarContasSheet";

/**
 * Contas e cartões, em Configurações.
 *
 * ── Por que esta página existe além do atalho ────────────────────────────
 *
 * O painel já existia atrás do link "Gerenciar contas", num card da Visão
 * Geral. Ninguém achou. E faz sentido não achar: cadastro não se procura no
 * painel de números, se procura em Configurações, junto de profissionais,
 * cadeiras e procedimentos.
 *
 * O atalho continua lá — é útil para quem já está olhando o financeiro e
 * percebe que falta uma conta. Mas o endereço de verdade é este.
 *
 * O conteúdo é o MESMO componente nos dois lugares. Duas implementações
 * divergiriam no dia em que alguém acrescentasse um campo numa delas.
 */

const searchSchema = z.object({});

export const Route = createFileRoute("/configuracoes/contas")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Contas e cartões · Configurações · NÓS Conecta" },
      {
        name: "description",
        content:
          "Contas da clínica e cartões de crédito, com o dia de fechamento e o de vencimento de cada fatura.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar as contas"
      description="Houve uma falha ao buscar contas e cartões. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: ContasPage,
});

function ContasPage() {
  return (
    <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
      <header className="mb-7">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold md:text-3xl">
          <Wallet className="h-[1.1em] w-[1.1em] shrink-0 text-coral" strokeWidth={1.75} />
          Contas e cartões
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          De onde o dinheiro sai e para onde entra. Uma conta pode ter cartões de crédito — e é o
          dia de fechamento e o de vencimento de cada um que decidem quando a compra vira saída de
          caixa.
        </p>
      </header>

      <div className="max-w-2xl">
        <ContasECartoes />
      </div>
    </main>
  );
}
