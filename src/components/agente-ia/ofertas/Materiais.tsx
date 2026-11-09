import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { vincularCaso, type CasoParaLigar } from "@/lib/agente-ia/ofertas.functions";

/**
 * Fotos e vídeos da Biblioteca de casos ligados a esta oferta. Um caso ligado
 * só vai numa conversa em que esta oferta está em foco; um caso sem oferta
 * continua valendo para todas as conversas, como sempre.
 */
export function MateriaisDaOferta({
  ofertaId,
  casos,
  nomeDasOfertas,
}: {
  ofertaId: string;
  casos: CasoParaLigar[];
  nomeDasOfertas: Record<string, string>;
}) {
  const queryClient = useQueryClient();
  const vincular = useServerFn(vincularCaso);
  const m = useMutation({
    mutationFn: (v: { casoId: string; ofertaId: string | null }) => vincular({ data: v }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agente-oferta", ofertaId] });
      queryClient.invalidateQueries({ queryKey: ["agente-ofertas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Escolha quais casos autorizados da biblioteca servem para esta oferta. A assistente só manda
        a foto quando a conversa é sobre ela. Um caso sem oferta continua valendo para todas as
        conversas.
      </p>

      <div className="grid gap-2">
        {casos.map((c) => {
          const nesta = c.ofertaId === ofertaId;
          const emOutra = c.ofertaId && !nesta;
          return (
            <label
              key={c.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm",
                !c.ativo && "opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.titulo || "Caso sem título"}</span>
                <span className="block text-xs text-muted-foreground">
                  {nesta
                    ? "Ligado a esta oferta"
                    : emOutra
                      ? `Ligado a ${nomeDasOfertas[c.ofertaId as string] ?? "outra oferta"}`
                      : "Vale para todas as conversas"}
                  {!c.ativo ? " · desligado na biblioteca" : ""}
                </span>
              </span>
              <Switch
                checked={nesta}
                disabled={m.isPending}
                onCheckedChange={(v) => m.mutate({ casoId: c.id, ofertaId: v ? ofertaId : null })}
                aria-label={`Ligar ${c.titulo} a esta oferta`}
              />
            </label>
          );
        })}
        {!casos.length && (
          <p className="rounded-3xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            A biblioteca ainda não tem casos. Cadastre um caso autorizado e volte aqui para ligá-lo
            a esta oferta.
          </p>
        )}
      </div>

      <Button asChild variant="outline" className="justify-self-start rounded-full">
        <Link to="/configuracoes/casos">Abrir a biblioteca de casos</Link>
      </Button>
    </div>
  );
}
