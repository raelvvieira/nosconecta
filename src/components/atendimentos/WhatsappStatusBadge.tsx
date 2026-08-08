import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getWhatsappInstance } from "@/lib/atendimentos/atendimentos.functions";
import { formatWhatsappNumber } from "@/lib/atendimentos/phone";
import { WhatsappConnectSheet } from "./WhatsappConnectSheet";

// Sempre clicável: mesmo conectado, abrir o painel é como se vê o número
// pareado e se desconecta pra trocar de número.
const STATUS_CONFIG: Record<string, { dot: string; label: string }> = {
  open: { dot: "bg-success", label: "Conectado" },
  connecting: { dot: "bg-warning", label: "Conectando…" },
  disconnected: { dot: "bg-muted-foreground/50", label: "WhatsApp desconectado" },
  error: { dot: "bg-danger", label: "Erro na conexão" },
};

// "pill" nos cabeçalhos largos (Dashboard, Pipeline, Campanhas).
// "minimal" onde o espaço é apertado, como a coluna de conversas: só um
// ponto e o número em texto pequeno, sem caixa nem cor de fundo — o pill
// verde com o número inteiro competia com o título da página.
export function WhatsappStatusBadge({ variant = "pill" }: { variant?: "pill" | "minimal" }) {
  const fetchInstance = useServerFn(getWhatsappInstance);
  const [sheetOpen, setSheetOpen] = useState(false);

  const instanceQuery = useQuery({
    queryKey: ["atendimentos-instance"],
    queryFn: () => fetchInstance(),
    staleTime: 8_000,
    refetchInterval: (query) => (query.state.data?.status === "connecting" ? 4_000 : 20_000),
  });
  const instance = instanceQuery.data ?? null;
  const config = STATUS_CONFIG[instance?.status ?? "disconnected"];
  const connected = instance?.status === "open";
  const formattedPhone = formatWhatsappNumber(instance?.phoneNumber);

  if (variant === "minimal") {
    return (
      <>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          title={connected ? "WhatsApp conectado — clique para gerenciar" : config.label}
          className="flex max-w-full items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", connected ? "bg-success" : config.dot)} />
          <span className="truncate">{connected ? formattedPhone || "Conectado" : config.label}</span>
        </button>
        <WhatsappConnectSheet open={sheetOpen} onOpenChange={setSheetOpen} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className={cn(
          "flex shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
          connected
            ? "border-success/30 bg-success-soft text-success hover:bg-success-soft/70"
            : "border-border bg-white text-foreground hover:bg-muted",
        )}
      >
        {connected ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <span className={cn("h-2 w-2 shrink-0 rounded-full", config.dot)} />
        )}
        {connected ? (formattedPhone ? `Conectado · ${formattedPhone}` : "Conectado") : config.label}
      </button>
      <WhatsappConnectSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
