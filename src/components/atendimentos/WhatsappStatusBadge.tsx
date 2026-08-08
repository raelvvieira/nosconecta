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

export function WhatsappStatusBadge() {
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
  const label = connected
    ? instance?.phoneNumber
      ? `Conectado · ${formatWhatsappNumber(instance.phoneNumber)}`
      : "Conectado"
    : config.label;

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
        {label}
      </button>
      <WhatsappConnectSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
