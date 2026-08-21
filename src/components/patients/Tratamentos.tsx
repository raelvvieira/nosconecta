import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ClipboardCheck, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  concluirItem,
  definirStatusDoPlano,
  excluirPlano,
  getTratamentos,
  reabrirItem,
  salvarPlano,
  type PlanoDeTratamento,
  type StatusDoPlano,
} from "@/lib/patients/treatments.functions";
import { Odontograma, type EstadoDoDente } from "@/components/patients/Odontograma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/finance/format";
import { cn } from "@/lib/utils";

// Orçamentos e tratamentos, dentro da aba Clínico.
//
// Um orçamento aprovado É o tratamento — mesma lista de itens, outro momento.
// Por isso não há duas telas: o cartão muda de tom conforme o status, e os
// itens ganham a ação de concluir quando o plano é aprovado.

const ROTULO: Record<StatusDoPlano, { texto: string; classe: string }> = {
  draft: { texto: "Orçamento", classe: "bg-surface-muted text-muted-foreground" },
  approved: { texto: "Aprovado", classe: "bg-success-soft text-success" },
  rejected: { texto: "Recusado", classe: "bg-danger-soft text-danger" },
};

function AindaNaoLigado() {
  return (
    <section className="surface-card p-5">
      <div className="flex items-start gap-3">
        <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div>
          <p className="text-sm font-medium text-foreground">Orçamentos ainda não ativados</p>
          <p className="mt-1 text-sm text-muted-foreground">
            As tabelas de orçamento e tratamento ainda não existem no banco. Rode{" "}
            <span className="font-medium text-foreground">Apply pending Supabase migrations</span> no
            Lovable para ligar esta seção.
          </p>
        </div>
      </div>
    </section>
  );
}

function NovoPlano({ patientId, onPronto }: { patientId: string; onPronto: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [itens, setItens] = useState([{ procedureName: "", tooth: "", amount: "" }]);
  const salvar = useServerFn(salvarPlano);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      salvar({
        data: {
          patientId,
          title: titulo,
          itens: itens
            .filter((i) => i.procedureName.trim())
            .map((i) => ({
              procedureName: i.procedureName.trim(),
              tooth: i.tooth.trim() || null,
              amount: Number(i.amount.replace(",", ".")) || 0,
            })),
        },
      }),
    onSuccess: () => {
      toast.success("Orçamento criado");
      queryClient.invalidateQueries({ queryKey: ["tratamentos", patientId] });
      onPronto();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 border-t border-border p-4">
      <Input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Nome do orçamento (ex.: Plano de tratamento inicial)"
        className="h-10 rounded-xl"
        aria-label="Nome do orçamento"
      />

      {itens.map((item, i) => (
        <div key={i} className="flex flex-wrap gap-2">
          <Input
            value={item.procedureName}
            onChange={(e) =>
              setItens((l) => l.map((x, j) => (j === i ? { ...x, procedureName: e.target.value } : x)))
            }
            placeholder="Procedimento"
            className="h-10 min-w-[160px] flex-1 rounded-xl"
            aria-label={`Procedimento ${i + 1}`}
          />
          <Input
            value={item.tooth}
            onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, tooth: e.target.value } : x)))}
            placeholder="Dente"
            className="h-10 w-20 rounded-xl"
            aria-label={`Dente do procedimento ${i + 1}`}
          />
          <Input
            value={item.amount}
            onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
            placeholder="Valor"
            inputMode="decimal"
            className="h-10 w-28 rounded-xl"
            aria-label={`Valor do procedimento ${i + 1}`}
          />
          {itens.length > 1 && (
            <button
              type="button"
              onClick={() => setItens((l) => l.filter((_, j) => j !== i))}
              aria-label={`Remover procedimento ${i + 1}`}
              className="press grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setItens((l) => [...l, { procedureName: "", tooth: "", amount: "" }])}
        >
          <Plus className="h-4 w-4" />
          Procedimento
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onPronto}>
            Cancelar
          </Button>
          <Button
            className="bg-gradient-primary text-white"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Salvando…" : "Salvar orçamento"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CartaoPlano({
  plano,
  patientId,
}: {
  plano: PlanoDeTratamento;
  patientId: string;
}) {
  const queryClient = useQueryClient();
  const mudarStatus = useServerFn(definirStatusDoPlano);
  const apagar = useServerFn(excluirPlano);
  const concluir = useServerFn(concluirItem);
  const reabrir = useServerFn(reabrirItem);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["tratamentos", patientId] });
  const aoErrar = (e: Error) => toast.error(e.message);

  const status = useMutation({
    mutationFn: (s: StatusDoPlano) => mudarStatus({ data: { id: plano.id, status: s } }),
    onSuccess: invalidar,
    onError: aoErrar,
  });
  const remover = useMutation({
    mutationFn: () => apagar({ data: { id: plano.id } }),
    onSuccess: () => {
      toast.success("Orçamento excluído");
      invalidar();
    },
    onError: aoErrar,
  });
  const marcarFeito = useMutation({
    mutationFn: (v: { id: string; gerarCobranca: boolean }) => concluir({ data: v }),
    onSuccess: (r: { cobrancaGerada: boolean }) => {
      toast.success(r.cobrancaGerada ? "Concluído e recebimento gerado" : "Procedimento concluído");
      invalidar();
      queryClient.invalidateQueries({ queryKey: ["patient-detail", patientId] });
    },
    onError: aoErrar,
  });
  const desfazer = useMutation({
    mutationFn: (id: string) => reabrir({ data: { id } }),
    onSuccess: invalidar,
    onError: aoErrar,
  });

  const aprovado = plano.status === "approved";
  const rotulo = ROTULO[plano.status];

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">{plano.title}</h4>
            <span className={cn("rounded-full px-2 py-0.5 text-2xs font-semibold", rotulo.classe)}>
              {rotulo.texto}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatBRL(plano.total)}
            {aprovado && plano.totalConcluido > 0
              ? ` · ${formatBRL(plano.totalConcluido)} concluído`
              : ""}
            {plano.professionalName ? ` · ${plano.professionalName}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          {plano.status === "draft" && (
            <>
              <Button variant="outline" size="sm" onClick={() => status.mutate("rejected")}>
                Recusado
              </Button>
              <Button
                size="sm"
                className="bg-gradient-primary text-white"
                onClick={() => status.mutate("approved")}
              >
                Aprovar
              </Button>
            </>
          )}
          {plano.status === "rejected" && (
            <Button variant="outline" size="sm" onClick={() => status.mutate("draft")}>
              Reabrir
            </Button>
          )}
          <button
            type="button"
            onClick={() => remover.mutate()}
            aria-label={`Excluir orçamento ${plano.title}`}
            className="press grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="divide-y divide-border border-t border-border">
        {plano.itens.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-sm",
                  item.status === "done" ? "text-muted-foreground line-through" : "text-foreground",
                )}
              >
                {item.procedureName}
                {item.tooth ? ` · dente ${item.tooth}` : ""}
              </p>
              {item.temCobranca && (
                <p className="mt-0.5 text-2xs text-success">Recebimento gerado</p>
              )}
            </div>
            <span className="shrink-0 text-sm font-medium tabular-nums">{formatBRL(item.amount)}</span>

            {/* Concluir só faz sentido no plano aprovado: marcar item de um
                orçamento ainda não aceito geraria cobrança de algo que o
                paciente não autorizou. */}
            {aprovado &&
              (item.status === "done" ? (
                <button
                  type="button"
                  onClick={() => desfazer.mutate(item.id)}
                  aria-label={`Reabrir ${item.procedureName}`}
                  className="press grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  disabled={marcarFeito.isPending}
                  onClick={() => marcarFeito.mutate({ id: item.id, gerarCobranca: true })}
                >
                  <Check className="h-4 w-4" />
                  Concluir
                </Button>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Tratamentos({ patientId }: { patientId: string }) {
  const buscar = useServerFn(getTratamentos);
  const [novo, setNovo] = useState(false);

  const tratamentos = useQuery({
    queryKey: ["tratamentos", patientId],
    queryFn: () => buscar({ data: { patientId } }),
    staleTime: 15_000,
  });

  const planos = tratamentos.data?.planos ?? [];

  // O odontograma resume TODOS os planos aprovados de uma vez: é a pergunta
  // "o que este paciente tem para fazer", não "o que tem no orçamento nº 3".
  // Concluído ganha do pendente quando o mesmo dente aparece nos dois.
  const estadosPorDente = useMemo(() => {
    const mapa: Record<string, EstadoDoDente> = {};
    for (const plano of planos) {
      if (plano.status !== "approved") continue;
      for (const item of plano.itens) {
        if (!item.tooth) continue;
        const atual = mapa[item.tooth];
        if (item.status === "done") mapa[item.tooth] = "concluido";
        else if (atual !== "concluido") mapa[item.tooth] = "pendente";
      }
    }
    return mapa;
  }, [planos]);

  if (tratamentos.data?.indisponivel) return <AindaNaoLigado />;

  const temMarcacao = Object.keys(estadosPorDente).length > 0;

  return (
    <div className="space-y-5">
      {temMarcacao && (
        <section className="surface-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Odontograma</h3>
          <Odontograma estados={estadosPorDente} />
        </section>
      )}

      <section className="surface-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-success" />
            <h3 className="text-sm font-semibold">Orçamentos e tratamentos</h3>
          </div>
          {!novo && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setNovo(true)}>
              <Plus className="h-4 w-4" />
              Novo
            </Button>
          )}
        </div>

        {novo && <NovoPlano patientId={patientId} onPronto={() => setNovo(false)} />}

        {tratamentos.isLoading ? (
          <p className="border-t border-border px-4 py-5 text-sm text-muted-foreground">Carregando…</p>
        ) : !planos.length && !novo ? (
          <p className="border-t border-border px-4 py-5 text-sm text-muted-foreground">
            Nenhum orçamento para este paciente.
          </p>
        ) : null}
      </section>

      {planos.map((p) => (
        <CartaoPlano key={p.id} plano={p} patientId={patientId} />
      ))}
    </div>
  );
}
