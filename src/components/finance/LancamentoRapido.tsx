import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { NewPaymentSheet } from "@/components/finance/payables/NewPaymentSheet";
import { NewReceivableSheet } from "@/components/finance/receivables/NewReceivableSheet";
import { getPayablesOverview } from "@/lib/finance/payables.functions";
import { getReceivablesOverview } from "@/lib/finance/receivables.functions";
import { useUnitSelection } from "@/lib/settings/unit-context";
import { cn } from "@/lib/utils";

/**
 * Lançar entrada e saída sem sair da Visão Geral.
 *
 * ── Por que aqui ─────────────────────────────────────────────────────────
 *
 * A Visão Geral é onde se olha o dinheiro, e era a única tela do módulo sem
 * como registrar nada: para lançar uma despesa era preciso ir em Pagamentos,
 * para lançar uma receita, em Recebimentos. Quem acabou de ver que o caixa
 * está apertado tinha que trocar de página para agir.
 *
 * ── É o MESMO formulário, não uma cópia ──────────────────────────────────
 *
 * Reusa `NewPaymentSheet` e `NewReceivableSheet` inteiros. Uma segunda tela de
 * lançamento seria a origem garantida de divergência: um dia alguém acrescenta
 * um campo em Pagamentos e esquece do atalho, e os dois caminhos passam a
 * gravar coisas diferentes.
 *
 * ── As listas são buscadas só quando o painel abre ───────────────────────
 *
 * Os dois formulários precisam de categorias, contas, fornecedores, pacientes
 * e profissionais. Essas listas já vêm prontas dentro de
 * `getPayablesOverview` e `getReceivablesOverview` — as mesmas consultas que
 * as telas de destino usam, então as opções são idênticas por construção.
 * Carregar isso junto do dashboard custaria duas consultas pesadas em toda
 * visita; com `enabled`, custa só para quem clica.
 */
export function LancamentoRapido({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const { selectedUnitId } = useUnitSelection();

  const [entradaAberta, setEntradaAberta] = useState(false);
  const [saidaAberta, setSaidaAberta] = useState(false);

  const buscarPagamentos = useServerFn(getPayablesOverview);
  const buscarRecebimentos = useServerFn(getReceivablesOverview);

  const pagamentos = useQuery({
    queryKey: ["payables-overview", "atalho", selectedUnitId],
    queryFn: () => buscarPagamentos({ data: { unitId: selectedUnitId ?? undefined } } as any),
    enabled: saidaAberta,
    staleTime: 30_000,
  });
  const recebimentos = useQuery({
    queryKey: ["receivables-overview", "atalho", selectedUnitId],
    queryFn: () => buscarRecebimentos({ data: { unitId: selectedUnitId ?? undefined } } as any),
    enabled: entradaAberta,
    staleTime: 30_000,
  });

  // Um lançamento novo muda o dashboard, a lista de destino e a projeção.
  // Invalidar as três é o que faz o número na tela mexer no mesmo instante.
  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ["finance-overview"] });
    queryClient.invalidateQueries({ queryKey: ["payables-overview"] });
    queryClient.invalidateQueries({ queryKey: ["receivables-overview"] });
    queryClient.invalidateQueries({ queryKey: ["planning-overview"] });
  };

  const p = pagamentos.data as any;
  const r = recebimentos.data as any;

  return (
    <>
      <div className={cn("flex items-center gap-2", className)}>
        <Atalho
          icone={<ArrowDownCircle className="h-4 w-4" />}
          rotulo="Entrada"
          tom="success"
          onClick={() => setEntradaAberta(true)}
        />
        <Atalho
          icone={<ArrowUpCircle className="h-4 w-4" />}
          rotulo="Saída"
          tom="danger"
          onClick={() => setSaidaAberta(true)}
        />
      </div>

      {/* As listas chegam depois do clique. Montar o Sheet com listas vazias
          por um instante é melhor do que segurar a abertura: o formulário já
          aparece e os seletores preenchem sozinhos. */}
      <NewReceivableSheet
        open={entradaAberta}
        onOpenChange={setEntradaAberta}
        patients={r?.patients ?? []}
        professionals={r?.professionals ?? []}
        categories={r?.categories ?? []}
        accounts={r?.accounts ?? []}
        onCreated={recarregar}
        onCategoriesChanged={recarregar}
        onAccountsChanged={recarregar}
      />

      <NewPaymentSheet
        open={saidaAberta}
        onOpenChange={setSaidaAberta}
        categories={p?.categories ?? []}
        accounts={p?.accounts ?? []}
        suppliers={p?.suppliers ?? []}
        onCreated={recarregar}
        onCategoriesChanged={recarregar}
        onAccountsChanged={recarregar}
      />
    </>
  );
}

/**
 * Dois botões, não um com menu.
 *
 * Entrada e saída são ações opostas e igualmente frequentes; escondê-las atrás
 * de um "Novo lançamento" custaria um clique em toda vez e faria a pessoa
 * escolher duas vezes a mesma coisa. A cor carrega o significado — verde
 * entra, vermelho sai —, e o ícone repete para quem não distingue as duas.
 */
function Atalho({
  icone,
  rotulo,
  tom,
  onClick,
}: {
  icone: React.ReactNode;
  rotulo: string;
  tom: "success" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "press flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium",
        "bg-card/70 backdrop-blur border-border/70 shadow-sm transition-colors",
        tom === "success"
          ? "text-success hover:bg-success-soft"
          : "text-danger hover:bg-danger-soft",
      )}
    >
      {icone}
      {rotulo}
    </button>
  );
}
