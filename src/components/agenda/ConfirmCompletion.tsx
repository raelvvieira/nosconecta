import { useId, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL, parseBRLInput } from "@/lib/finance/format";

/**
 * Confirmar que o atendimento aconteceu — sempre com o valor cobrado junto.
 *
 * Antes isso era escolher "Concluído" num select entre outros seis status, e o
 * valor que ia para a Meta era o *previsto*, digitado semanas antes a partir do
 * preço de catálogo. São duas coisas diferentes: o previsto é uma estimativa, o
 * cobrado é o que a pessoa pagou — e é o cobrado que faz sentido como valor de
 * conversão.
 *
 * O valor não é opcional de propósito. Zero é aceito (atendimento de cortesia
 * existe); o que não passa é deixar em branco.
 */
export function ConfirmCompletion({
  expectedRevenue,
  actualRevenue,
  isPending,
  onConfirm,
}: {
  expectedRevenue: number;
  /** Já confirmado: mostra o valor em vez da pergunta. */
  actualRevenue?: number | null;
  isPending?: boolean;
  onConfirm: (valor: number) => void;
}) {
  // id próprio: o mesmo bloco pode aparecer no formulário e na gaveta do
  // celular, e um id fixo faria o rótulo apontar para o campo errado.
  const campoId = useId();
  const [abrindo, setAbrindo] = useState(false);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  if (actualRevenue !== null && actualRevenue !== undefined) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-success-soft px-3 py-2.5">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" strokeWidth={2} />
        <p className="text-sm text-foreground-secondary">
          Atendimento realizado · <span className="font-semibold">{formatBRL(actualRevenue)}</span>
        </p>
      </div>
    );
  }

  const confirmar = () => {
    const n = parseBRLInput(valor);
    if (Number.isNaN(n)) {
      setErro("Informe o valor cobrado para confirmar o atendimento.");
      return;
    }
    if (n < 0) {
      setErro("O valor cobrado não pode ser negativo.");
      return;
    }
    setErro(null);
    onConfirm(n);
  };

  if (!abrindo) {
    return (
      <div className="rounded-xl border border-coral/30 bg-coral-soft px-3 py-3">
        <p className="text-sm font-medium text-foreground">Este atendimento já aconteceu?</p>
        <p className="mt-0.5 text-2xs leading-4 text-muted-foreground">
          Confirmar registra o valor cobrado e envia a conversão.
        </p>
        <Button
          type="button"
          variant="premium"
          className="mt-2.5 h-10 w-full rounded-xl"
          onClick={() => {
            // Pré-preenche com o previsto: na maioria das vezes é o valor certo,
            // e quando não é, corrigir um número já digitado é mais rápido que
            // digitar do zero.
            setValor(expectedRevenue ? String(expectedRevenue).replace(".", ",") : "");
            setAbrindo(true);
          }}
        >
          Confirmar atendimento realizado
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-coral/30 bg-coral-soft px-3 py-3">
      <Label htmlFor={campoId} className="text-sm text-foreground-secondary">
        Valor cobrado no atendimento *
      </Label>
      <Input
        id={campoId}
        data-valor-cobrado=""
        inputMode="decimal"
        placeholder="R$ 0,00"
        value={valor}
        autoFocus
        onChange={(e) => {
          setValor(e.target.value);
          if (erro) setErro(null);
        }}
        className="rounded-xl border-surface-muted bg-white"
      />
      {erro ? (
        <p className="text-2xs text-danger">{erro}</p>
      ) : (
        <p className="text-2xs text-muted-foreground">
          Previsto era {formatBRL(expectedRevenue)}
        </p>
      )}
      <div className="flex gap-2 pt-0.5">
        <Button
          type="button"
          variant="outline"
          className="h-10 flex-1 rounded-xl bg-white"
          onClick={() => {
            setAbrindo(false);
            setErro(null);
          }}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="premium"
          className="h-10 flex-1 rounded-xl"
          disabled={isPending}
          onClick={confirmar}
        >
          {isPending ? "Confirmando..." : "Confirmar e enviar"}
        </Button>
      </div>
    </div>
  );
}
