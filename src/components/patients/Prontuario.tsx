import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ClipboardList, Plus, Stethoscope, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  MODELO_PADRAO,
  excluirEvolucao,
  getProntuario,
  salvarAnamnese,
  salvarEvolucao,
  type Anamnese,
  type RespostaDeAnamnese,
} from "@/lib/patients/clinical-record.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Anamnese e evoluções, dentro da aba Clínico.
//
// Evolução é o que a dentista escreve todo dia; anamnese é uma vez e se
// consulta depois. Por isso a evolução vem primeiro e já abre com o campo de
// escrever à mão, enquanto a anamnese fica recolhida.

function quando(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** O passo que falta no Lovable, dito por extenso.
 *
 *  Sem isto a aba mostraria uma lista vazia e a pessoa concluiria que o
 *  prontuário existe e está zerado — quando na verdade ele ainda não foi
 *  ligado. Estado vazio que mente é pior do que estado vazio nenhum. */
function AindaNaoLigado() {
  return (
    <section className="surface-card p-5">
      <div className="flex items-start gap-3">
        <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div>
          <p className="text-sm font-medium text-foreground">Prontuário ainda não ativado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            As tabelas de anamnese e evolução ainda não existem no banco. Rode{" "}
            <span className="font-medium text-foreground">Apply pending Supabase migrations</span>{" "}
            no Lovable para ligar esta seção.
          </p>
        </div>
      </div>
    </section>
  );
}

function CartaoAnamnese({ anamnese }: { anamnese: Anamnese }) {
  const [aberto, setAberto] = useState(false);
  const respondidas = anamnese.template.filter((c) => {
    const v = anamnese.answers[c.id];
    return v !== null && v !== undefined && v !== "" && v !== false;
  });

  return (
    <div className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="press flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{quando(anamnese.filledAt)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {anamnese.professionalName ?? "Autor não registrado"}
            {respondidas.length ? ` · ${respondidas.length} respostas relevantes` : ""}
          </p>
        </div>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")}
        />
      </button>

      {aberto && (
        <div className="space-y-2 px-4 pb-4">
          {anamnese.template.map((campo) => {
            const v = anamnese.answers[campo.id];
            // Pergunta sem resposta some: a anamnese impressa fica com o que
            // de fato foi dito, não com um formulário em branco.
            if (v === null || v === undefined || v === "") return null;
            return (
              <div key={campo.id} className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-muted-foreground">{campo.label}</span>
                <span className="shrink-0 text-sm font-medium">
                  {typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormularioAnamnese({
  patientId,
  onPronto,
}: {
  patientId: string;
  onPronto: () => void;
}) {
  const [respostas, setRespostas] = useState<Record<string, RespostaDeAnamnese>>({});
  const salvar = useServerFn(salvarAnamnese);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => salvar({ data: { patientId, answers: respostas } }),
    onSuccess: () => {
      toast.success("Anamnese registrada");
      queryClient.invalidateQueries({ queryKey: ["prontuario", patientId] });
      onPronto();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 border-t border-border p-4">
      {MODELO_PADRAO.map((campo) => (
        <div key={campo.id} className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor={`an-${campo.id}`} className="text-sm text-foreground-secondary">
            {campo.label}
          </label>
          {campo.type === "boolean" ? (
            <div className="flex gap-1" role="group" aria-label={campo.label}>
              {[true, false].map((valor) => (
                <button
                  key={String(valor)}
                  type="button"
                  onClick={() => setRespostas((r) => ({ ...r, [campo.id]: valor }))}
                  aria-pressed={respostas[campo.id] === valor}
                  className={cn(
                    "press rounded-lg border border-border px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    respostas[campo.id] === valor
                      ? "bg-foreground text-white"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {valor ? "Sim" : "Não"}
                </button>
              ))}
            </div>
          ) : (
            <Input
              id={`an-${campo.id}`}
              value={String(respostas[campo.id] ?? "")}
              onChange={(e) => setRespostas((r) => ({ ...r, [campo.id]: e.target.value }))}
              className="h-9 w-full max-w-[260px] rounded-xl"
            />
          )}
        </div>
      ))}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onPronto}>
          Cancelar
        </Button>
        <Button
          className="bg-gradient-primary text-white"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Salvando…" : "Salvar anamnese"}
        </Button>
      </div>
    </div>
  );
}

export function Prontuario({ patientId }: { patientId: string }) {
  const buscar = useServerFn(getProntuario);
  const gravarEvolucao = useServerFn(salvarEvolucao);
  const apagarEvolucao = useServerFn(excluirEvolucao);
  const queryClient = useQueryClient();

  const [texto, setTexto] = useState("");
  const [novaAnamnese, setNovaAnamnese] = useState(false);

  const prontuario = useQuery({
    queryKey: ["prontuario", patientId],
    queryFn: () => buscar({ data: { patientId } }),
    staleTime: 15_000,
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["prontuario", patientId] });

  const criar = useMutation({
    mutationFn: () => gravarEvolucao({ data: { patientId, body: texto } }),
    onSuccess: () => {
      setTexto("");
      toast.success("Evolução registrada");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: (id: string) => apagarEvolucao({ data: { id } }),
    onSuccess: () => {
      toast.success("Evolução removida");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (prontuario.data?.indisponivel) return <AindaNaoLigado />;

  const evolucoes = prontuario.data?.evolucoes ?? [];
  const anamneses = prontuario.data?.anamneses ?? [];

  return (
    <div className="space-y-5">
      <section className="surface-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <Stethoscope className="h-4 w-4 text-pink" />
          <h3 className="text-sm font-semibold">Evoluções</h3>
        </div>

        <div className="border-t border-border p-4">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="O que foi feito nesta consulta?"
            rows={3}
            className="rounded-xl"
            aria-label="Nova evolução"
          />
          <div className="mt-2 flex justify-end">
            <Button
              className="bg-gradient-primary text-white"
              disabled={!texto.trim() || criar.isPending}
              onClick={() => criar.mutate()}
            >
              {criar.isPending ? "Salvando…" : "Registrar evolução"}
            </Button>
          </div>
        </div>

        <div className="divide-y divide-border border-t border-border">
          {prontuario.isLoading ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">Carregando…</p>
          ) : !evolucoes.length ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">
              Nenhuma evolução registrada para este paciente.
            </p>
          ) : (
            evolucoes.map((ev) => (
              <div key={ev.id} className="group flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-line text-sm text-foreground">{ev.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {quando(ev.createdAt)}
                    {ev.professionalName ? ` · ${ev.professionalName}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remover.mutate(ev.id)}
                  aria-label="Excluir evolução"
                  className="press grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="surface-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-violet" />
            <h3 className="text-sm font-semibold">Anamnese</h3>
          </div>
          {!novaAnamnese && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setNovaAnamnese(true)}>
              <Plus className="h-4 w-4" />
              Nova
            </Button>
          )}
        </div>

        {novaAnamnese && (
          <FormularioAnamnese patientId={patientId} onPronto={() => setNovaAnamnese(false)} />
        )}

        {!anamneses.length && !novaAnamnese ? (
          <p className="border-t border-border px-4 py-5 text-sm text-muted-foreground">
            Paciente sem anamnese preenchida.
          </p>
        ) : (
          <div className="border-t border-border">
            {anamneses.map((a) => (
              <CartaoAnamnese key={a.id} anamnese={a} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
