import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, RefreshCw } from "lucide-react";
import { getWhatsappInstance } from "@/lib/atendimentos/atendimentos.functions";
import { WhatsappConnectSheet } from "./WhatsappConnectSheet";

const STATUS_CONFIG: Record<string, { dot: string; label: string; cta: string }> = {
  open: { dot: "bg-success", label: "Conectado", cta: "Gerenciar conexão" },
  connecting: { dot: "bg-warning", label: "Conectando…", cta: "Ver QR Code" },
  disconnected: { dot: "bg-muted-foreground/50", label: "Desconectado", cta: "Conectar" },
  error: { dot: "bg-danger", label: "Erro na conexão", cta: "Tentar de novo" },
};

// Card de destaque do Dashboard — vira o único lugar de onde se inicia o
// fluxo de conectar (a página de Chat só mostra um aviso leve linkando pra
// cá). Reusa o WhatsappConnectSheet existente sem alteração.
export function WhatsappConnectionCard({ dailyUsage }: { dailyUsage?: { limit: number; usedToday: number } }) {
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
      <section className="surface-card flex h-full flex-col justify-between gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-coral-soft text-coral">
              <MessageCircle className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">WhatsApp</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`h-2 w-2 shrink-0 rounded-full ${config.dot}`} />
                {label}
              </p>
            </div>
          </div>
        </div>

        {instance?.lastError && (
          <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">{instance.lastError}</p>
        )}

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex items-center justify-center gap-2 rounded-[16px] bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <RefreshCw className="h-4 w-4" />
          {config.cta}
        </button>

        {dailyUsage && (
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Envio diário de campanhas</span>
              <span>
                {dailyUsage.usedToday}/{dailyUsage.limit}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-primary"
                style={{
                  width: `${dailyUsage.limit > 0 ? Math.min(100, Math.round((dailyUsage.usedToday / dailyUsage.limit) * 100)) : 0}%`,
                }}
              />
            </div>
          </div>
        )}
      </section>

      <WhatsappConnectSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
