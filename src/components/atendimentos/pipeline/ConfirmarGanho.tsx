import { useEffect, useId, useState } from "react";
import { CheckCircle2, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatBRL, parseBRLInput } from "@/lib/finance/format";
import { formatWhatsappNumber } from "@/lib/atendimentos/phone";

export interface DadosGanho {
  valor: number;
  realizadoEm: string;
  /** Telefone conferido/digitado, no formato que vai para a Meta. */
  phone: string | null;
  gerarCobranca: boolean;
}

/** Hoje pela data local. `toISOString` é UTC e viraria o dia depois das 21h. */
function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Confirmar que a negociação virou atendimento.
 *
 * Marcar "Ganho" era um clique só, e por isso chegava torto na Meta: o valor
 * morava num campo separado (quem marcasse antes de digitar mandava valor
 * nulo, e o `event_id` estável impedia qualquer correção depois), não havia
 * data nenhuma, e o telefone nunca ia junto. Os três dados são pedidos aqui, de
 * uma vez, porque é o momento em que se sabe todos eles.
 *
 * O telefone aparece mesmo quando existe: é ele que faz a Meta casar a
 * conversão, e conferir custa um segundo. Faltando, o campo fica editável e o
 * que for digitado é gravado no paciente.
 */
export function ConfirmarGanho({
  open,
  contactName,
  phone,
  valorSugerido,
  isPending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  contactName: string;
  /** Telefone conhecido do contato, em dígitos ou formatado. */
  phone: string | null;
  /** Valor da negociação já registrado, se houver, para pré-preencher. */
  valorSugerido?: number | null;
  isPending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (dados: DadosGanho) => void;
}) {
  const idValor = useId();
  const idData = useId();
  const idFone = useId();

  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje());
  const [fone, setFone] = useState("");
  const [gerarCobranca, setGerarCobranca] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Repovoa a cada abertura: o painel fica montado e um estado velho mostraria
  // o valor da negociação anterior.
  useEffect(() => {
    if (!open) return;
    setValor(valorSugerido ? String(valorSugerido).replace(".", ",") : "");
    setData(hoje());
    setFone(formatWhatsappNumber(phone));
    setGerarCobranca(true);
    setErro(null);
  }, [open, valorSugerido, phone]);

  const lido = parseBRLInput(valor);
  const valorValido = !Number.isNaN(lido) && lido >= 0;

  const confirmar = () => {
    if (Number.isNaN(lido)) {
      setErro("Informe o valor cobrado no atendimento.");
      return;
    }
    if (lido < 0) {
      setErro("O valor cobrado não pode ser negativo.");
      return;
    }
    if (!data) {
      setErro("Informe a data em que o atendimento foi realizado.");
      return;
    }
    setErro(null);
    onConfirm({
      valor: lido,
      realizadoEm: data,
      phone: fone.trim() ? fone.trim() : null,
      gerarCobranca,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px]" data-confirmar-ganho="">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={2} />
            Atendimento realizado
          </DialogTitle>
          <DialogDescription>
            Marcar como ganho registra o atendimento na agenda e envia a conversão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5 rounded-xl bg-surface px-3 py-2.5">
            <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cliente
            </p>
            <p className="text-sm font-medium text-foreground">{contactName}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={idFone} className="text-sm text-foreground-secondary">
              Telefone
            </Label>
            <Input
              id={idFone}
              data-ganho-telefone=""
              inputMode="tel"
              value={fone}
              onChange={(e) => setFone(e.target.value)}
              placeholder="+55 (48) 98419-5309"
              className="w-full min-w-0 rounded-xl border-surface-muted font-mono"
            />
            <p className="text-2xs leading-4 text-muted-foreground">
              {fone.trim()
                ? "É por ele que a Meta reconhece a pessoa. Confira antes de confirmar."
                : "Sem telefone, a Meta quase não consegue casar a conversão. Preencha se souber."}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor={idValor} className="text-sm text-foreground-secondary">
                Valor cobrado *
              </Label>
              <Input
                id={idValor}
                data-ganho-valor=""
                inputMode="decimal"
                placeholder="R$ 0,00"
                autoFocus
                value={valor}
                onChange={(e) => {
                  setValor(e.target.value);
                  if (erro) setErro(null);
                }}
                className="w-full min-w-0 rounded-xl border-surface-muted"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor={idData} className="text-sm text-foreground-secondary">
                Realizado em *
              </Label>
              <Input
                id={idData}
                data-ganho-data=""
                type="date"
                value={data}
                onChange={(e) => {
                  setData(e.target.value);
                  if (erro) setErro(null);
                }}
                className="w-full min-w-0 rounded-xl border-surface-muted"
              />
            </div>
          </div>

          {erro && (
            <p data-ganho-erro="" className="text-2xs text-danger">
              {erro}
            </p>
          )}

          <label className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2.5">
            <span className="text-sm text-foreground-secondary">
              Gerar recebimento{valorValido && valor.trim() ? ` de ${formatBRL(lido)}` : ""}
            </span>
            <Switch checked={gerarCobranca} onCheckedChange={setGerarCobranca} />
          </label>

          <p className="flex gap-2 rounded-xl bg-surface px-3 py-2 text-2xs leading-4 text-muted-foreground">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Se esta pessoa já tiver atendimento realizado nesta data, o ganho é
            registrado mas a conversão não é enviada de novo.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            data-ganho-confirmar=""
            variant="premium"
            disabled={isPending}
            onClick={confirmar}
          >
            {isPending ? "Confirmando..." : "Confirmar ganho"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
