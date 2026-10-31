import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  excluirEvolucao,
  getProntuario,
  salvarEvolucao,
  type Evolucao,
} from "@/lib/patients/clinical-record.functions";
import { getTratamentos } from "@/lib/patients/treatments.functions";
import {
  descricaoDoDente,
  ehDente,
  rotuloDaRegiao,
  type Denticao,
} from "@/lib/patients/odontograma";
import { LegendaDoOdontograma, Odontograma, type EstadoDoDente } from "./Odontograma";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// O odontograma na ficha do paciente, com as anotações.
//
// Toca-se num dente (ou numa região: maxila, face…) e abre o painel daquela
// região: o que está em tratamento ali, as anotações já feitas e o campo para
// escrever a próxima. A anotação é gravada como evolução com endereço
// (`patient_notes.regiao`), então ela aparece aqui E na linha do tempo do
// prontuário — um lugar só para ler o que aconteceu com a pessoa.
//
// As duas consultas são as mesmas do Prontuário e dos Tratamentos (mesma
// chave de cache): abrir a aba não busca nada duas vezes.

const MAXIMO = 1000;

function quando(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function PainelDaRegiao({
  patientId,
  regiao,
  anotacoes,
  itens,
}: {
  patientId: string;
  regiao: string;
  anotacoes: Evolucao[];
  itens: { nome: string; status: string; plano: string }[];
}) {
  const [texto, setTexto] = useState("");
  const gravar = useServerFn(salvarEvolucao);
  const apagar = useServerFn(excluirEvolucao);
  const queryClient = useQueryClient();
  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["prontuario", patientId] });

  const criar = useMutation({
    mutationFn: () => gravar({ data: { patientId, body: texto, regiao } }),
    onSuccess: () => {
      setTexto("");
      toast.success("Anotação salva");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remover = useMutation({
    mutationFn: (id: string) => apagar({ data: { id } }),
    onSuccess: () => {
      toast.success("Anotação removida");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5 px-6 pb-6 pt-7">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.01em]">{rotuloDaRegiao(regiao)}</h2>
        {ehDente(regiao) && (
          <p className="mt-0.5 text-sm capitalize text-muted-foreground">
            {descricaoDoDente(regiao)}
          </p>
        )}
      </div>

      {itens.length > 0 && (
        <div className="rounded-2xl bg-surface-subtle p-3.5">
          <p className="text-3xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Em tratamento
          </p>
          <ul className="mt-2 space-y-1.5">
            {itens.map((i, k) => (
              <li key={k} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{i.nome}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium",
                    i.status === "done"
                      ? "bg-success-soft text-success"
                      : "bg-warning-soft text-warning",
                  )}
                >
                  {i.status === "done" ? "Concluído" : "A fazer"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, MAXIMO))}
          placeholder="Adicionar anotação…"
          rows={3}
          className="rounded-2xl"
          aria-label={`Anotação em ${rotuloDaRegiao(regiao)}`}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-2xs tabular-nums text-muted-foreground">
            {texto.length} / {MAXIMO}
          </span>
          <Button
            variant="premium"
            size="sm"
            disabled={!texto.trim() || criar.isPending}
            onClick={() => criar.mutate()}
          >
            {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </div>

      {anotacoes.length > 0 ? (
        <ul className="space-y-3">
          {anotacoes.map((a) => (
            <li key={a.id} className="group rounded-2xl border border-border/70 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-2xs text-muted-foreground">
                  {quando(a.createdAt)}
                  {a.professionalName ? ` · ${a.professionalName}` : ""}
                </p>
                <button
                  type="button"
                  onClick={() => remover.mutate(a.id)}
                  aria-label="Remover anotação"
                  className="text-muted-foreground/60 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{a.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma anotação aqui ainda.</p>
      )}
    </div>
  );
}

export function OdontogramaDoPaciente({ patientId }: { patientId: string }) {
  const buscarProntuario = useServerFn(getProntuario);
  const buscarTratamentos = useServerFn(getTratamentos);
  const [denticao, setDenticao] = useState<Denticao>("permanente");
  const [regiao, setRegiao] = useState<string | null>(null);

  const prontuario = useQuery({
    queryKey: ["prontuario", patientId],
    queryFn: () => buscarProntuario({ data: { patientId } }),
    staleTime: 15_000,
  });
  const tratamentos = useQuery({
    queryKey: ["tratamentos", patientId],
    queryFn: () => buscarTratamentos({ data: { patientId } }),
    staleTime: 15_000,
  });

  const dadosDoProntuario = prontuario.data;
  const dadosDosTratamentos = tratamentos.data;
  const evolucoes = dadosDoProntuario?.evolucoes ?? [];

  // Concluído ganha do pendente quando o mesmo dente aparece nos dois planos.
  const { estados, itensPorDente } = useMemo(() => {
    const planos = dadosDosTratamentos?.planos ?? [];
    const estados: Record<string, EstadoDoDente> = {};
    const itensPorDente: Record<string, { nome: string; status: string; plano: string }[]> = {};
    for (const plano of planos) {
      if (plano.status !== "approved") continue;
      for (const item of plano.itens) {
        if (!item.tooth) continue;
        (itensPorDente[item.tooth] ??= []).push({
          nome: item.procedureName,
          status: item.status,
          plano: plano.title,
        });
        if (item.status === "done") estados[item.tooth] = "concluido";
        else if (estados[item.tooth] !== "concluido") estados[item.tooth] = "pendente";
      }
    }
    return { estados, itensPorDente };
  }, [dadosDosTratamentos]);

  const anotacoes = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const e of dadosDoProntuario?.evolucoes ?? []) {
      if (e.regiao) mapa[e.regiao] = (mapa[e.regiao] ?? 0) + 1;
    }
    return mapa;
  }, [dadosDoProntuario]);

  if (prontuario.data?.indisponivel) return null;

  return (
    <section className="surface-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Odontograma</h3>
        <div
          className="flex rounded-full border border-border/70 bg-card p-0.5"
          role="group"
          aria-label="Dentição"
        >
          {(
            [
              ["permanente", "Permanentes"],
              ["deciduo", "Decíduos"],
            ] as [Denticao, string][]
          ).map(([v, r]) => (
            <button
              key={v}
              type="button"
              onClick={() => setDenticao(v)}
              aria-pressed={denticao === v}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                denticao === v
                  ? "bg-foreground text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <Odontograma
          denticao={denticao}
          estados={estados}
          anotacoes={anotacoes}
          selecionado={regiao}
          onSelecionar={setRegiao}
        />
      </div>
      <div className="mt-4 border-t border-border/60 pt-3">
        <LegendaDoOdontograma />
      </div>

      <Sheet open={!!regiao} onOpenChange={(open) => !open && setRegiao(null)}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>{rotuloDaRegiao(regiao)}</SheetTitle>
          </SheetHeader>
          {regiao && (
            <PainelDaRegiao
              key={regiao}
              patientId={patientId}
              regiao={regiao}
              anotacoes={evolucoes.filter((e) => e.regiao === regiao)}
              itens={itensPorDente[regiao] ?? []}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
