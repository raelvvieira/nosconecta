import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  criarDisparo,
  listarFalhasDoDisparo,
  type BroadcastResumo,
} from "@/lib/atendimentos/broadcast.functions";
import { progressoDoDisparo } from "@/lib/atendimentos/statusDoDisparo";

/**
 * O disparo por dentro: quantos saíram, quantos esperam, e — o que a lista não
 * cabia dizer — quem não recebeu e por quê, com reenvio só para esses.
 */
export function DetalhesDoDisparo({
  disparo,
  onOpenChange,
}: {
  disparo: BroadcastResumo | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const buscarFalhas = useServerFn(listarFalhasDoDisparo);
  const disparar = useServerFn(criarDisparo);

  const falhasQuery = useQuery({
    queryKey: ["disparo-falhas", disparo?.id],
    queryFn: () => buscarFalhas({ data: { broadcastId: disparo!.id } }),
    enabled: Boolean(disparo) && (disparo?.falhas ?? 0) > 0,
  });

  const reenviar = useMutation({
    mutationFn: async () => {
      const falhas = falhasQuery.data ?? [];
      return disparar({
        data: {
          message: disparo!.message,
          name: `${disparo!.name?.trim() || "Disparo"} · reenvio`,
          ritmo: { minSegundos: 5, maxSegundos: 10, pausarACada: 50, retomarEmMinutos: 5 },
          mediaPath: null,
          prontos: falhas.map((f) => ({
            contactId: f.contactId,
            conversationId: f.conversationId,
            name: f.nome,
            phone: f.phone,
          })),
          aVincular: [],
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`Reenvio na fila com ${r.total} contatos.`);
      queryClient.invalidateQueries({ queryKey: ["disparos"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const p = disparo ? progressoDoDisparo(disparo) : null;

  return (
    <Sheet open={Boolean(disparo)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {disparo && p && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle>{disparo.name?.trim() || "Disparo"}</SheetTitle>
              <SheetDescription>{p.rotulo}</SheetDescription>
            </SheetHeader>

            <div className="mt-5 grid grid-cols-3 gap-2.5">
              {[
                { rotulo: "Enviados", valor: disparo.enviados },
                { rotulo: "Na fila", valor: disparo.pendentes },
                { rotulo: "Falharam", valor: disparo.falhas },
              ].map((k) => (
                <div key={k.rotulo} className="rounded-2xl bg-surface px-3 py-3 text-center">
                  <p className="text-lg font-semibold tabular-nums">{k.valor}</p>
                  <p className="text-2xs text-muted-foreground">{k.rotulo}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl bg-surface px-3 py-3">
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                Mensagem
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{disparo.message}</p>
            </div>

            {disparo.falhas > 0 && (
              <div className="mt-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Não receberam
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={reenviar.isPending || !(falhasQuery.data ?? []).length}
                    onClick={() => reenviar.mutate()}
                  >
                    {reenviar.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Reenviar aos que falharam
                  </Button>
                </div>
                <ul className="mt-2.5 divide-y divide-border rounded-2xl bg-surface">
                  {falhasQuery.isLoading && (
                    <li className="px-3 py-3 text-2xs text-muted-foreground">Carregando…</li>
                  )}
                  {(falhasQuery.data ?? []).map((f) => (
                    <li key={f.contactId} className="px-3 py-2.5">
                      <p className="truncate text-sm font-medium">{f.nome || f.phone || f.contactId}</p>
                      <p className="text-2xs text-muted-foreground">
                        {f.phone ? `${f.phone} · ` : ""}
                        {f.erro || "sem motivo registrado"}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
