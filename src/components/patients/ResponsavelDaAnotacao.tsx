import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { editarEvolucao, type Evolucao } from "@/lib/patients/clinical-record.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useProfissionaisAtivos } from "./useProfissionaisAtivos";

// Quem é o responsável por uma anotação, e como corrigir.
//
// Serve às duas listas que mostram a mesma tabela: as anotações do odontograma
// (por dente) e as evoluções do prontuário. Nas duas, o responsável é um
// profissional cadastrado — não o nome de quem digitou —, porque quem escreve
// no sistema muitas vezes é a recepção, anotando o que a dentista disse.

const MAXIMO = 1000;
/** O Select do Radix não aceita valor vazio, então "sem responsável" tem o seu. */
const NENHUM = "__nenhum";

export function SeletorDeResponsavel({
  valor,
  onChange,
  nomeAtual,
  className,
}: {
  valor: string | null;
  onChange: (id: string | null) => void;
  /** O nome gravado na anotação: mostra quem é mesmo que o profissional tenha
   *  sido desativado ou removido da lista. */
  nomeAtual?: string | null;
  className?: string;
}) {
  const profissionais = useProfissionaisAtivos();
  const foraDaLista = valor && !profissionais.some((p) => p.id === valor);
  return (
    <Select value={valor ?? NENHUM} onValueChange={(v) => onChange(v === NENHUM ? null : v)}>
      <SelectTrigger className={cn("h-9 min-w-0 text-xs", className)} aria-label="Responsável">
        <SelectValue placeholder="Responsável" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NENHUM}>Sem responsável</SelectItem>
        {foraDaLista && (
          <SelectItem value={valor}>{nomeAtual || "Profissional removido"}</SelectItem>
        )}
        {profissionais.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Corrige o texto e o responsável de uma anotação, no lugar dela. */
export function EditarAnotacao({
  ev,
  patientId,
  onFechar,
}: {
  ev: Evolucao;
  patientId: string;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const editar = useServerFn(editarEvolucao);
  const [texto, setTexto] = useState(ev.body);
  const [responsavel, setResponsavel] = useState<string | null>(ev.professionalId);
  const mudouResponsavel = responsavel !== ev.professionalId;
  const mudou = texto.trim() !== ev.body.trim() || mudouResponsavel;

  const salvar = useMutation({
    mutationFn: () =>
      editar({
        data: {
          id: ev.id,
          body: texto,
          // Sem mudança, nem manda: o nome gravado na época fica como estava.
          professionalId: mudouResponsavel ? responsavel : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Anotação atualizada");
      queryClient.invalidateQueries({ queryKey: ["prontuario", patientId] });
      onFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-2 space-y-2">
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value.slice(0, MAXIMO))}
        rows={3}
        autoFocus
        className="rounded-2xl"
        aria-label="Editar anotação"
      />
      <div className="flex flex-wrap items-center gap-2">
        <SeletorDeResponsavel
          valor={responsavel}
          onChange={setResponsavel}
          nomeAtual={ev.professionalName}
          className="w-44"
        />
        <span className="ml-auto text-2xs tabular-nums text-muted-foreground">
          {texto.length} / {MAXIMO}
        </span>
        <Button variant="outline" size="sm" onClick={onFechar} disabled={salvar.isPending}>
          Cancelar
        </Button>
        <Button
          variant="premium"
          size="sm"
          disabled={!texto.trim() || !mudou || salvar.isPending}
          onClick={() => salvar.mutate()}
        >
          {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
