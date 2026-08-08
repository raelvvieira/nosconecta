import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QrCode, RefreshCw, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  connectWhatsapp,
  disconnectWhatsapp,
  getWhatsappInstance,
  setWhatsappInboxId,
} from "@/lib/atendimentos/atendimentos.functions";

export function WhatsappConnectSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fetchInstance = useServerFn(getWhatsappInstance);
  const doConnect = useServerFn(connectWhatsapp);
  const doDisconnect = useServerFn(disconnectWhatsapp);
  const doSetInboxId = useServerFn(setWhatsappInboxId);

  const instanceQuery = useQuery({
    queryKey: ["atendimentos-instance"],
    queryFn: () => fetchInstance(),
    staleTime: 8_000,
    refetchInterval: (query) => (query.state.data?.status === "connecting" ? 4_000 : 20_000),
  });
  const instance = instanceQuery.data ?? null;

  const [phoneNumber, setPhoneNumber] = useState("");
  const connectMutation = useMutation({
    mutationFn: () => doConnect({ data: { phoneNumber } }),
    onSuccess: (res) => {
      // Sem QR e já conectado: o CRM adotou uma instância que já existia pra
      // esse número. É sucesso, não erro — mas sem avisar, a tela só ficaria
      // sem QR e pareceria que nada aconteceu.
      if (res.status === "open") toast.success("Este número já estava conectado — pronto pra usar.");
      queryClient.invalidateQueries({ queryKey: ["atendimentos-instance"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => doDisconnect(),
    onSuccess: () => {
      toast.success("Instância desconectada — pode tentar conectar de novo.");
      queryClient.invalidateQueries({ queryKey: ["atendimentos-instance"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [showInboxIdField, setShowInboxIdField] = useState(false);
  const [inboxIdInput, setInboxIdInput] = useState("");
  const setInboxIdMutation = useMutation({
    mutationFn: () => doSetInboxId({ data: { inboxId: inboxIdInput.trim() } }),
    onSuccess: () => {
      toast.success("Inbox vinculada — pode conectar agora.");
      setShowInboxIdField(false);
      setInboxIdInput("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const connecting = instance?.status === "connecting";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{connecting ? "Escaneie o QR Code" : "Conectar WhatsApp"}</SheetTitle>
        </SheetHeader>

        <div className="mt-2 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] bg-coral-soft text-coral">
            {connecting ? <QrCode className="h-6 w-6" /> : <WifiOff className="h-6 w-6" />}
          </span>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
            {connecting
              ? "Abra o WhatsApp no celular da clínica → Aparelhos conectados → Conectar um aparelho."
              : "Conecte o número da clínica para espelhar as conversas de WhatsApp aqui."}
          </p>

          {connecting && instance?.qrCode && (
            <img
              src={instance.qrCode.startsWith("data:") ? instance.qrCode : `data:image/png;base64,${instance.qrCode}`}
              alt="QR Code de conexão do WhatsApp"
              className="mx-auto mt-6 h-56 w-56 rounded-2xl border border-border object-contain"
            />
          )}

          {!connecting && (
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="Número com DDD, sem o 0 (ex.: 48 98419-5309)"
              className="mx-auto mt-5 h-11 rounded-[16px] bg-white text-center"
            />
          )}

          {instance?.lastError && (
            <p className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">{instance.lastError}</p>
          )}

          <Button
            className="mt-6 gap-2 bg-gradient-primary text-white"
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending || (!connecting && !phoneNumber.trim())}
          >
            <RefreshCw className={cn("h-4 w-4", connectMutation.isPending && "animate-spin")} />
            {connecting ? "Gerar novo QR Code" : "Conectar"}
          </Button>

          {instance?.status && instance.status !== "disconnected" && (
            <button
              type="button"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="mt-3 block w-full text-xs text-muted-foreground underline underline-offset-2"
            >
              {connecting
                ? "O celular recusou o pareamento? Desconecte e tente de novo"
                : "Desconectar instância"}
            </button>
          )}

          {!connecting && (
            <div className="mt-4">
              {!showInboxIdField ? (
                <button
                  type="button"
                  onClick={() => setShowInboxIdField(true)}
                  className="text-xs text-muted-foreground underline underline-offset-2"
                >
                  Já tenho o Inbox ID (caso o "Conectar" dê erro de permissão)
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    value={inboxIdInput}
                    onChange={(e) => setInboxIdInput(e.target.value)}
                    placeholder="Inbox ID"
                    className="h-9 rounded-xl"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!inboxIdInput.trim() || setInboxIdMutation.isPending}
                    onClick={() => setInboxIdMutation.mutate()}
                  >
                    Vincular
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
