import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getFigurinhasDoChat,
  sendWhatsappSticker,
} from "@/lib/atendimentos/atendimentos.functions";

// As figurinhas salvas no sistema, para mandar na conversa com um toque.
//
// Diferente dos casos de antes e depois, a figurinha não passa pela bandeja
// de anexos: ela não tem legenda e, como anexo, sairia como foto. Um toque
// manda, e a mensagem aparece na conversa assim que o servidor a espelha.

export function FigurinhasParaEnviar({
  open,
  onOpenChange,
  conversationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
}) {
  const queryClient = useQueryClient();
  const listar = useServerFn(getFigurinhasDoChat);
  const enviar = useServerFn(sendWhatsappSticker);
  const figurinhas = useQuery({
    queryKey: ["figurinhas-do-chat"],
    queryFn: () => listar(),
    enabled: open,
    // As URLs assinadas valem uma hora; refaz antes disso.
    staleTime: 20 * 60_000,
  });
  const [enviando, setEnviando] = useState<string | null>(null);

  const mandar = useMutation({
    mutationFn: (stickerId: string) => enviar({ data: { conversationId, stickerId } }),
    onMutate: (stickerId) => setEnviando(stickerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["atendimentos-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Não consegui mandar a figurinha."),
    onSettled: () => setEnviando(null),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Figurinhas</DialogTitle>
        </DialogHeader>
        {figurinhas.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : figurinhas.isError ? (
          <p className="py-8 text-center text-sm text-danger">
            {figurinhas.error instanceof Error
              ? figurinhas.error.message
              : "Não consegui carregar."}
          </p>
        ) : !figurinhas.data?.length ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma figurinha salva ainda. Numa conversa, toque em “Usar nos follow-ups” embaixo
              de uma figurinha para guardá-la aqui.
            </p>
            <Link
              to="/agente-ia"
              className="mt-2 inline-block text-sm font-medium text-coral hover:underline"
              onClick={() => onOpenChange(false)}
            >
              Ver a biblioteca
            </Link>
          </div>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
            {figurinhas.data.map((f) => (
              <button
                key={f.id}
                type="button"
                disabled={!f.url || mandar.isPending}
                onClick={() => mandar.mutate(f.id)}
                aria-label="Mandar esta figurinha"
                className="press relative aspect-square overflow-hidden rounded-2xl border border-border bg-surface-subtle p-2 transition-shadow hover:shadow-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
              >
                {f.url && (
                  <img src={f.url} alt="" loading="lazy" className="h-full w-full object-contain" />
                )}
                {enviando === f.id && (
                  <span className="absolute inset-0 grid place-items-center bg-black/30">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
