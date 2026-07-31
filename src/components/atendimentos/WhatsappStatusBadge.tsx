import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getWhatsappInstance } from "@/lib/atendimentos/atendimentos.functions";
import { WhatsappConnectSheet } from "./WhatsappConnectSheet";

const STATUS_CONFIG: Record<string, { dot: string; label: string; clickable: boolean }> = {
  open: { dot: "bg-success", label: "Conectado", clickable: false },
  connecting: { dot: "bg-warning", label: "Conectando…", clickable: true },
  disconnected: { dot: "bg-muted-foreground/50", label: "WhatsApp desconectado", clickable: true },
  error: { dot: "bg-danger", label: "Erro na conexão", clickable: true },
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
  const label =
    instance?.status === "open" && instance.phoneNumber ? `Conectado · ${instance.phoneNumber}` : config.label;

  return (
    <>
      <button
        type="button"
        onClick={() => config.clickable && setSheetOpen(true)}
        disabled={!config.clickable}
        className={cn(
          "flex shrink-0 items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition-colors",
          config.clickable ? "cursor-pointer hover:bg-muted" : "cursor-default",
        )}
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", config.dot)} />
        {label}
      </button>
      <WhatsappConnectSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
