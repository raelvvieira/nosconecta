import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL, parseBRLInput } from "@/lib/finance/format";
import { clinicTodayStr } from "@/lib/date";
import {
  FORMAS,
  MAX_PARCELAS,
  MIN_PARCELAS,
  pedeParcelas,
  rotuloDoPagamento,
  type FormaDePagamento,
} from "@/lib/agenda/forma-de-pagamento";
import { recusaDoSinal, saldoAReceber, somaDosSinais } from "@/lib/agenda/sinal";
import { listarSinais, registrarSinal, removerSinal } from "@/lib/agenda/sinal.functions";
import { enviarReciboDoAtendimento, situacaoDoRecibo } from "@/lib/agenda/recibo.functions";
import { cn } from "@/lib/utils";

const dataCurta = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

function quando(iso: string): string {
  const d = new Date(iso);
  const fuso = { timeZone: "America/Sao_Paulo" } as const;
  return `${d.toLocaleDateString("pt-BR", fuso)} às ${d.toLocaleTimeString("pt-BR", { ...fuso, hour: "2-digit", minute: "2-digit" })}`;
}

/** Uma linha de recibo: o que é, quando foi enviado, e o botão. */
function LinhaDeRecibo({
  titulo,
  appointmentId,
  tipo,
  disponivel,
  motivoIndisponivel,
}: {
  titulo: string;
  appointmentId: string;
  tipo: "sinal" | "completo";
  disponivel: boolean;
  motivoIndisponivel: string;
}) {
  const qc = useQueryClient();
  const enviarFn = useServerFn(enviarReciboDoAtendimento);
  const situacaoFn = useServerFn(situacaoDoRecibo);
  const situacao = useQuery({
    queryKey: ["recibo-do-atendimento", appointmentId, tipo],
    queryFn: () => situacaoFn({ data: { appointmentId, tipo } }),
    staleTime: 30_000,
  });
  const enviar = useMutation({
    mutationFn: () => enviarFn({ data: { appointmentId, tipo } }),
    onSuccess: () => {
      toast.success("Recibo enviado");
      qc.invalidateQueries({ queryKey: ["recibo-do-atendimento", appointmentId, tipo] });
    },
    onError: (e: Error) => toast.error(`Recibo não enviado: ${e.message}`),
  });
  const jaEnviou = (situacao.data?.vezes ?? 0) > 0;
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <p
          className={cn(
            "min-w-0 text-sm",
            disponivel ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {titulo}
          <span className="block text-2xs text-muted-foreground">
            {!disponivel
              ? motivoIndisponivel
              : jaEnviou && situacao.data?.ultimoEm
                ? `Enviado em ${quando(situacao.data.ultimoEm)}`
                : "Manda no WhatsApp do paciente"}
          </span>
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 rounded-xl"
        disabled={!disponivel || enviar.isPending}
        onClick={() => enviar.mutate()}
      >
        {enviar.isPending ? "Enviando…" : jaEnviou ? "Enviar novamente" : "Enviar"}
      </Button>
    </div>
  );
}

/** O formulário de registrar um sinal, aberto no próprio card. */
function NovoSinal({ appointmentId, onFeito }: { appointmentId: string; onFeito: () => void }) {
  const qc = useQueryClient();
  const registrarFn = useServerFn(registrarSinal);
  const [valor, setValor] = useState("");
  const [pagoEm, setPagoEm] = useState(clinicTodayStr());
  const [forma, setForma] = useState<FormaDePagamento | null>(null);
  const [parcelas, setParcelas] = useState<number | null>(null);
  const registrar = useMutation({
    mutationFn: () =>
      registrarFn({
        data: { appointmentId, valor: parseBRLInput(valor), pagoEm, forma, parcelas },
      }),
    onSuccess: () => {
      toast.success("Sinal registrado");
      qc.invalidateQueries({ queryKey: ["sinais-do-atendimento", appointmentId] });
      qc.invalidateQueries({ queryKey: ["agenda-overview"] });
      onFeito();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const n = parseBRLInput(valor);
  const valido = !recusaDoSinal({ valor: n, total: 0, jaRegistrado: [] }) && !!pagoEm;
  return (
    <div className="mt-2 space-y-2.5 rounded-xl bg-surface px-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-2xs text-muted-foreground">Valor do sinal</span>
          <Input
            inputMode="decimal"
            placeholder="R$ 0,00"
            value={valor}
            autoFocus
            onChange={(e) => setValor(e.target.value)}
            className="rounded-xl bg-white"
          />
        </label>
        <label className="space-y-1">
          <span className="text-2xs text-muted-foreground">Pago em</span>
          <Input
            type="date"
            value={pagoEm}
            onChange={(e) => setPagoEm(e.target.value)}
            className="rounded-xl bg-white"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FORMAS.map((f) => (
          <button
            key={f.valor}
            type="button"
            aria-pressed={forma === f.valor}
            onClick={() => {
              setForma(forma === f.valor ? null : f.valor);
              setParcelas(null);
            }}
            className={
              forma === f.valor
                ? "h-8 rounded-lg border border-foreground bg-foreground px-2.5 text-xs font-medium text-background"
                : "h-8 rounded-lg border border-border bg-white px-2.5 text-xs text-foreground-secondary"
            }
          >
            {f.rotulo}
          </button>
        ))}
      </div>
      {pedeParcelas(forma) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Em quantas vezes?</span>
          {Array.from({ length: MAX_PARCELAS - MIN_PARCELAS + 1 }, (_, i) => i + MIN_PARCELAS).map(
            (p) => (
              <button
                key={p}
                type="button"
                aria-pressed={parcelas === p}
                onClick={() => setParcelas(p)}
                className={
                  parcelas === p
                    ? "h-7 w-9 rounded-lg border border-foreground bg-foreground text-xs text-background"
                    : "h-7 w-9 rounded-lg border border-border bg-white text-xs text-foreground-secondary"
                }
              >
                {p}x
              </button>
            ),
          )}
        </div>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-9 flex-1 rounded-xl bg-white"
          onClick={onFeito}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="premium"
          className="h-9 flex-1 rounded-xl"
          disabled={!valido || registrar.isPending}
          onClick={() => registrar.mutate()}
        >
          {registrar.isPending ? "Salvando…" : "Registrar sinal"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Pagamento e recibos de um atendimento: o sinal pago antes, e os recibos —
 * do sinal e do total — para mandar agora ou depois.
 *
 * O total do atendimento continua sendo o que vai para a Meta; o sinal fica só
 * aqui, no financeiro e no recibo.
 */
export function PagamentoDoAtendimento({
  appointmentId,
  status,
  expectedRevenue,
  actualRevenue,
}: {
  appointmentId: string;
  status: string;
  expectedRevenue: number;
  actualRevenue: number | null;
}) {
  const qc = useQueryClient();
  const listarFn = useServerFn(listarSinais);
  const removerFn = useServerFn(removerSinal);
  const [abrindo, setAbrindo] = useState(false);
  const sinais = useQuery({
    queryKey: ["sinais-do-atendimento", appointmentId],
    queryFn: () => listarFn({ data: { appointmentId } }),
    staleTime: 15_000,
  });
  const remover = useMutation({
    mutationFn: (id: string) => removerFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Sinal removido");
      qc.invalidateQueries({ queryKey: ["sinais-do-atendimento", appointmentId] });
      qc.invalidateQueries({ queryKey: ["agenda-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (status === "cancelled") return null;
  const lista = sinais.data ?? [];
  const concluido = status === "completed" && actualRevenue !== null;
  const total = concluido ? (actualRevenue ?? 0) : expectedRevenue;
  const pago = somaDosSinais(lista);

  return (
    <div className="rounded-2xl border border-border px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-3xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Pagamento e recibos
        </p>
        {!abrindo && (
          <button
            type="button"
            onClick={() => setAbrindo(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Registrar sinal
          </button>
        )}
      </div>

      {lista.length > 0 && (
        <ul className="mt-2 space-y-1">
          {lista.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 text-foreground">
                Sinal · <span className="font-semibold">{formatBRL(s.valor)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {dataCurta(s.pagoEm)}
                  {rotuloDoPagamento(s.forma, s.parcelas)
                    ? ` · ${rotuloDoPagamento(s.forma, s.parcelas)}`
                    : ""}
                </span>
              </span>
              <button
                type="button"
                aria-label="Remover sinal"
                disabled={remover.isPending}
                onClick={() => remover.mutate(s.id)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-danger"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </li>
          ))}
          {total > 0 && (
            <li className="text-2xs text-muted-foreground">
              {concluido ? "Total" : "Previsto"} {formatBRL(total)} · saldo{" "}
              {formatBRL(saldoAReceber(total, lista))}
            </li>
          )}
        </ul>
      )}

      {abrindo && <NovoSinal appointmentId={appointmentId} onFeito={() => setAbrindo(false)} />}

      <div className="mt-1 divide-y divide-border/60">
        <LinhaDeRecibo
          titulo="Recibo do sinal"
          appointmentId={appointmentId}
          tipo="sinal"
          disponivel={pago > 0}
          motivoIndisponivel="Registre um sinal para emitir"
        />
        <LinhaDeRecibo
          titulo="Recibo completo"
          appointmentId={appointmentId}
          tipo="completo"
          disponivel={concluido && total > 0}
          motivoIndisponivel="Disponível depois de confirmar o atendimento"
        />
      </div>
    </div>
  );
}

/** Na confirmação: se já há sinal, mostra quanto falta receber hoje. */
export function ResumoDoSinalNaConfirmacao({
  appointmentId,
  total,
}: {
  appointmentId: string;
  total: number | null;
}) {
  const listarFn = useServerFn(listarSinais);
  const sinais = useQuery({
    queryKey: ["sinais-do-atendimento", appointmentId],
    queryFn: () => listarFn({ data: { appointmentId } }),
    staleTime: 15_000,
  });
  const lista = sinais.data ?? [];
  if (lista.length === 0) return null;
  const pago = somaDosSinais(lista);
  return (
    <div className="rounded-xl bg-white px-3 py-2.5 text-sm text-foreground-secondary">
      Sinal já pago <span className="font-semibold">{formatBRL(pago)}</span>
      {total !== null && total > 0 && (
        <>
          {" "}
          · a receber hoje{" "}
          <span className="font-semibold">{formatBRL(saldoAReceber(total, lista))}</span>
        </>
      )}
      <span className="mt-0.5 block text-2xs text-muted-foreground">
        O valor acima é o total do atendimento, com o sinal incluído.
      </span>
    </div>
  );
}
