import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { cn } from "@/lib/utils";
import {
  assinarPlano,
  cancelarAssinatura,
  comprarConversas,
  getMeuPlano,
  type Ciclo,
  type MeuPlano,
  type Plano,
} from "@/lib/plataforma/pagamento.functions";

/**
 * O plano do consultório e o pagamento pelo Asaas.
 *
 * Assinar e comprar abrem a página de pagamento do Asaas (cartão; no pacote,
 * também Pix). A confirmação chega pelo webhook, não pela volta da página:
 * por isso, voltando com `?pago=1`, a tela avisa que está confirmando e
 * pergunta de novo em alguns segundos.
 *
 * Esta é a única tela que abre com o consultório parado (teste vencido,
 * pagamento em aberto), para quem administra: é pagando que ele volta.
 */
export const Route = createFileRoute("/configuracoes/plano")({
  ssr: false,
  validateSearch: z.object({ pago: z.coerce.number().optional() }),
  head: () => ({ meta: [{ title: "Plano e pagamento · NÓS Conecta" }] }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error} title="Não foi possível abrir o plano" semSidebar />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: PaginaDoPlano,
});

const NOME_DO_PLANO: Record<Plano, string> = { basico: "Básico", ia: "Com IA" };
const RESUMO_DO_PLANO: Record<Plano, string> = {
  basico: "Agenda, pacientes, WhatsApp, financeiro e automações.",
  ia: "Tudo do Básico, mais a assistente que atende, agenda e volta em quem sumiu.",
};

function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dia(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function situacaoEmTexto(p: MeuPlano): string {
  if (p.situacao === "suspensa") return "Pausado pela NÓS Conecta";
  if (p.situacao === "teste") return p.testeAte ? `Em teste até ${dia(p.testeAte)}` : "Em teste";
  const ciclo = p.ciclo === "anual" ? "anual" : "mensal";
  return p.pagoAte
    ? `${NOME_DO_PLANO[p.plano]} ${ciclo} · pago até ${dia(p.pagoAte)}`
    : `${NOME_DO_PLANO[p.plano]} · ativo`;
}

function PaginaDoPlano() {
  const { pago } = Route.useSearch();
  const buscar = useServerFn(getMeuPlano);
  const assinar = useServerFn(assinarPlano);
  const comprar = useServerFn(comprarConversas);
  const cancelar = useServerFn(cancelarAssinatura);
  const qc = useQueryClient();
  const plano = useQuery({ queryKey: ["meu-plano"], queryFn: () => buscar() });
  const [ciclo, setCiclo] = useState<Ciclo>("mensal");
  const [abrindo, setAbrindo] = useState<string | null>(null);

  // Voltou do Asaas: o webhook pode levar alguns segundos. Pergunta de novo
  // três vezes, e a ficha atualiza sozinha quando o pagamento entrar.
  useEffect(() => {
    if (!pago) return;
    toast.success("Pagamento enviado. Estamos confirmando com o Asaas.");
    const vezes = [4000, 10000, 25000].map((ms) =>
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["meu-plano"] });
        void qc.invalidateQueries({ queryKey: ["membership-status"] });
        void qc.invalidateQueries({ queryKey: ["minha-franquia"] });
      }, ms),
    );
    return () => vezes.forEach(clearTimeout);
  }, [pago, qc]);

  async function irPara(chave: string, abrir: () => Promise<{ link: string }>) {
    setAbrindo(chave);
    try {
      const { link } = await abrir();
      window.location.href = link;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir o pagamento.");
      setAbrindo(null);
    }
  }

  if (plano.isPending) {
    return (
      <div className="mt-10 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const p = plano.data;
  if (!p) {
    return (
      <p className="surface-card mt-6 p-6 text-sm text-muted-foreground">
        Este consultório não tem plano para gerenciar por aqui.
      </p>
    );
  }

  const precoDe = (pl: Plano) => p.precos.find((x) => x.chave === `${pl}_${ciclo}`);
  const pacote = p.precos.find((x) => x.chave === "pacote_conversas");
  const assinando = p.situacao === "ativa" && p.temAssinatura;

  return (
    <div className="mt-6 max-w-3xl space-y-6">
      <section className="surface-card p-5">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Seu plano
        </p>
        <p className="mt-1 text-lg font-semibold">{situacaoEmTexto(p)}</p>
        {assinando && (
          <p className="mt-1 text-sm text-muted-foreground">
            A renovação é automática no cartão cadastrado no Asaas.
          </p>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">
            {assinando ? "Trocar de plano" : "Escolha o plano"}
          </h2>
          <div className="flex rounded-full bg-surface-muted p-1 text-sm">
            {(["mensal", "anual"] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={ciclo === c}
                onClick={() => setCiclo(c)}
                className={cn(
                  "press rounded-full px-3 py-1.5",
                  ciclo === c ? "bg-white font-medium shadow-sm" : "text-muted-foreground",
                )}
              >
                {c === "mensal" ? "Mensal" : "Anual · 2 meses grátis"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(["basico", "ia"] as const).map((pl) => {
            const preco = precoDe(pl);
            const atual = assinando && p.plano === pl && p.ciclo === ciclo;
            return (
              <article key={pl} className="surface-card flex flex-col p-5">
                <h3 className="text-base font-semibold">{NOME_DO_PLANO[pl]}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{RESUMO_DO_PLANO[pl]}</p>
                <p className="mt-4 text-2xl font-semibold tabular-nums">
                  {preco ? reais(preco.valorCentavos) : "—"}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    {ciclo === "anual" ? "/ano" : "/mês"}
                  </span>
                </p>
                <Button
                  className="mt-4"
                  variant={atual ? "outline" : "premium"}
                  disabled={!preco || atual || abrindo !== null}
                  onClick={() => void irPara(pl, () => assinar({ data: { plano: pl, ciclo } }))}
                >
                  {abrindo === pl && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {atual ? "Plano atual" : "Assinar"}
                </Button>
              </article>
            );
          })}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CreditCard className="h-3.5 w-3.5" /> Pagamento seguro pelo Asaas, no cartão. Sem
          fidelidade: dá para cancelar quando quiser.
        </p>
      </section>

      {pacote && p.plano === "ia" && (
        <section className="surface-card flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-start gap-3">
            <MessagesSquare className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{pacote.nome}</p>
              <p className="text-xs text-muted-foreground">
                Para quando o mês apertar. O saldo não vence no fim do mês.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            disabled={abrindo !== null}
            onClick={() => void irPara("pacote", () => comprar())}
          >
            {abrindo === "pacote" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Comprar por {reais(pacote.valorCentavos)}
          </Button>
        </section>
      )}

      {!!p.ultimos.length && (
        <section>
          <h2 className="text-base font-semibold">Últimos pagamentos</h2>
          <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-white/60">
            {p.ultimos.map((u, i) => (
              <li key={i} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                <span>
                  {u.tipo === "pacote" ? "Pacote de conversas" : "Assinatura"} · {dia(u.criadoEm)}
                </span>
                <span className="text-muted-foreground">
                  {u.valorCentavos !== null ? reais(u.valorCentavos) : ""} · {u.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.temAssinatura && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-danger hover:underline"
          onClick={async () => {
            if (
              !window.confirm("Cancelar a renovação? O que já foi pago vale até o fim do período.")
            ) {
              return;
            }
            try {
              await cancelar();
              await qc.invalidateQueries({ queryKey: ["meu-plano"] });
              toast.success("Renovação cancelada.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Não foi possível cancelar.");
            }
          }}
        >
          Cancelar a renovação
        </button>
      )}
    </div>
  );
}
