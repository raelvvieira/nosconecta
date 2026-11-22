import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enviarReciboDoAtendimento, situacaoDoRecibo } from "@/lib/agenda/recibo.functions";

function quando(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} às ${d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Recibo de um atendimento JÁ confirmado: enviar, ou enviar novamente.
 *
 * Existe para quem foi atendido antes de o recibo existir e para o paciente que
 * perdeu o arquivo. Mostra quando foi o último envio, para ninguém mandar duas
 * vezes sem querer.
 */
export function ReciboDoAtendimento({ appointmentId }: { appointmentId: string }) {
  const qc = useQueryClient();
  const enviarFn = useServerFn(enviarReciboDoAtendimento);
  const situacaoFn = useServerFn(situacaoDoRecibo);
  const situacao = useQuery({
    queryKey: ["recibo-do-atendimento", appointmentId],
    queryFn: () => situacaoFn({ data: { appointmentId } }),
    staleTime: 30_000,
  });
  const enviar = useMutation({
    mutationFn: () => enviarFn({ data: { appointmentId } }),
    onSuccess: () => {
      toast.success("Recibo enviado");
      qc.invalidateQueries({ queryKey: ["recibo-do-atendimento", appointmentId] });
    },
    onError: (e: Error) => toast.error(`Recibo não enviado: ${e.message}`),
  });

  const jaEnviou = (situacao.data?.vezes ?? 0) > 0;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <p className="min-w-0 text-sm text-foreground-secondary">
          {jaEnviou ? "Recibo enviado" : "Recibo em PDF"}
          <span className="block text-2xs text-muted-foreground">
            {jaEnviou && situacao.data?.ultimoEm
              ? `Último envio em ${quando(situacao.data.ultimoEm)}`
              : "Manda no WhatsApp do paciente"}
          </span>
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 rounded-xl"
        disabled={enviar.isPending}
        onClick={() => enviar.mutate()}
      >
        {enviar.isPending ? "Enviando…" : jaEnviou ? "Enviar novamente" : "Enviar recibo"}
      </Button>
    </div>
  );
}
