import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Sticker } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { aprovarFigurinha, idsDasFigurinhas } from "@/lib/agente-ia/recovery.functions";
import { useNomeDaAssistente } from "@/components/agente-ia/useNomeDaAssistente";

/**
 * "Usar nos follow-ups", embaixo de uma figurinha do chat.
 *
 * É assim que a biblioteca da Luna se monta: a figurinha chega numa conversa
 * (alguém da clínica manda do celular) e um toque a aprova. Só aparece para
 * quem pode mexer no Agente de IA; para o resto, a consulta falha e o botão
 * some.
 */
export function UsarFigurinha({ messageId, claro }: { messageId: string; claro: boolean }) {
  const luna = useNomeDaAssistente();
  const queryClient = useQueryClient();
  const buscar = useServerFn(idsDasFigurinhas);
  const aprovar = useServerFn(aprovarFigurinha);
  const query = useQuery({
    queryKey: ["figurinhas-da-luna", "ids"],
    queryFn: () => buscar(),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const [salvando, setSalvando] = useState(false);

  if (!query.data) return null;
  const aprovada = query.data.includes(messageId);

  return (
    <button
      type="button"
      disabled={aprovada || salvando}
      onClick={async () => {
        setSalvando(true);
        try {
          await aprovar({ data: { messageId } });
          await queryClient.invalidateQueries({ queryKey: ["figurinhas-da-luna"] });
          toast.success(`Figurinha liberada para os follow-ups da ${luna}.`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Não foi possível aprovar.");
        } finally {
          setSalvando(false);
        }
      }}
      className={cn(
        "mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-3xs font-medium",
        claro ? "bg-white/15 text-white" : "bg-muted text-muted-foreground",
        !aprovada && "hover:opacity-80",
      )}
    >
      {salvando ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : aprovada ? (
        <Check className="h-3 w-3" />
      ) : (
        <Sticker className="h-3 w-3" />
      )}
      {aprovada ? `Nos follow-ups da ${luna}` : "Usar nos follow-ups"}
    </button>
  );
}
