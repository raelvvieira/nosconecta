import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getWhatsappInstance } from "@/lib/atendimentos/atendimentos.functions";
import { WhatsappConnectSheet } from "./WhatsappConnectSheet";

// Era uma cápsula verde com borda, ícone e o número inteiro —
// "Conectado · +55 (48) 98419-5309". No celular ela dividia a linha do
// cabeçalho com o botão da tela e os dois não cabiam: o botão saía cortado na
// borda direita.
//
// Agora é o mínimo que responde à única pergunta que a tela faz: dá para
// mandar mensagem agora? Um ponto e uma palavra. O número continua no painel
// que abre ao tocar, que é onde ele serve para alguma coisa — trocar de
// aparelho, reconectar, ver qual chip está pareado.
//
// Sempre clicável: mesmo conectado, tocar é como se vê o número pareado e se
// desconecta para trocar de número.

type Forma = { cor: string; texto: string; xis: boolean };

const ESTADOS: Record<string, Forma> = {
  open: { cor: "bg-success", texto: "Conectado", xis: false },
  // "Conectando…" não estava na descrição de duas cores, mas existe de
  // verdade: são os segundos entre ler o QR e o WhatsApp pareado. Dizer
  // "Desconectado" ali seria mentir bem na hora em que a pessoa está olhando.
  connecting: { cor: "bg-warning", texto: "Conectando…", xis: false },
  disconnected: { cor: "bg-danger", texto: "Desconectado", xis: true },
  error: { cor: "bg-danger", texto: "Desconectado", xis: true },
};

export function WhatsappStatusBadge({ className }: { className?: string }) {
  const fetchInstance = useServerFn(getWhatsappInstance);
  const [sheetOpen, setSheetOpen] = useState(false);

  const instanceQuery = useQuery({
    queryKey: ["atendimentos-instance"],
    queryFn: () => fetchInstance(),
    staleTime: 8_000,
    refetchInterval: (query) => (query.state.data?.status === "connecting" ? 4_000 : 20_000),
  });
  const instance = instanceQuery.data ?? null;
  const estado = ESTADOS[instance?.status ?? "disconnected"];

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        title={
          estado.xis
            ? "WhatsApp desconectado — toque para conectar"
            : "WhatsApp conectado — toque para gerenciar"
        }
        className={cn(
          "inline-flex max-w-full shrink-0 items-center gap-1.5 text-xs font-medium transition-colors",
          estado.xis
            ? "text-danger hover:text-danger/80"
            : "text-muted-foreground hover:text-foreground",
          className,
        )}
      >
        {estado.xis ? (
          <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
        ) : (
          <span className={cn("h-2 w-2 shrink-0 rounded-full", estado.cor)} />
        )}
        <span className="truncate">{estado.texto}</span>
      </button>
      <WhatsappConnectSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
