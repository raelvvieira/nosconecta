import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, RefreshCw, Smartphone, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  desconectarConexaoPropria,
  gerarQrDaConexao,
  getConexaoPropria,
} from "@/lib/atendimentos/conexao.functions";
import { formatWhatsappNumber } from "@/lib/atendimentos/phone";

/**
 * Conectar o WhatsApp da clínica, em uma janela.
 *
 * ── O que sumiu em relação ao caminho antigo ────────────────────────────
 *
 * A API key e o campo de número. A chave nunca chega à tela — ela mora nos
 * segredos do servidor, e pedir uma chave de 64 caracteres a quem só quer
 * ligar o telefone era difícil e espalhava a chave por áreas de transferência.
 * O número também some: quem escaneia É o número, e a Evolution descobre
 * qual é na conexão.
 *
 * ── O QR se renova sozinho ──────────────────────────────────────────────
 *
 * Ele expira em cerca de 40 segundos. Antes, quem demorava a pegar o celular
 * escaneava um código morto e via "falhou" sem entender por quê. Aqui a tela
 * pede um novo a cada 30 segundos enquanto a janela está aberta — com folga
 * antes de expirar.
 */
export function ConectarWhatsapp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const buscarEstado = useServerFn(getConexaoPropria);
  const pedirQr = useServerFn(gerarQrDaConexao);
  const desconectarFn = useServerFn(desconectarConexaoPropria);

  const [qr, setQr] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const estadoQuery = useQuery({
    queryKey: ["conexao-propria"],
    queryFn: () => buscarEstado(),
    enabled: open,
    // Esperando leitura, pergunta de 3 em 3 segundos: é o que faz a tela
    // virar "conectado" sozinha assim que o celular lê, sem ninguém clicar.
    refetchInterval: (q) => (open && q.state.data?.estado !== "open" ? 3_000 : 15_000),
  });
  const conexao = estadoQuery.data ?? null;
  const conectado = conexao?.estado === "open";

  const gerar = useMutation({
    mutationFn: () => pedirQr(),
    onSuccess: (r) => {
      setErro(null);
      setQr(r.qr);
      if (r.estado === "open") {
        setQr(null);
        queryClient.invalidateQueries({ queryKey: ["conexao-propria"] });
      }
    },
    onError: (e: Error) => {
      setErro(e.message);
      setQr(null);
    },
  });

  const desconectar = useMutation({
    mutationFn: () => desconectarFn(),
    onSuccess: () => {
      toast.success("WhatsApp desconectado.");
      setQr(null);
      queryClient.invalidateQueries({ queryKey: ["conexao-propria"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Renovação do QR enquanto a janela está aberta e ninguém escaneou ainda.
  // Para sozinha quando conecta ou quando a janela fecha — um relógio rodando
  // numa janela fechada continuaria pedindo QR ao servidor para ninguém.
  // `mutate` é estável no react-query; usar ele direto (em vez do objeto
  // `gerar`, que muda de identidade a cada render) evita recriar o relógio a
  // cada atualização de tela.
  const regerarQr = gerar.mutate;
  useEffect(() => {
    if (!open || conectado || !qr) return;
    const t = setInterval(() => regerarQr(), 30_000);
    return () => clearInterval(t);
  }, [open, conectado, qr, regerarQr]);

  // Conectou: o QR sai da tela na hora. Deixá-lo visível convidaria a
  // escanear de novo, e escanear de novo derruba a sessão que acabou de subir.
  useEffect(() => {
    if (conectado) setQr(null);
  }, [conectado]);

  useEffect(() => {
    if (!open) {
      setQr(null);
      setErro(null);
    }
  }, [open]);

  const carregando = estadoQuery.isLoading || gerar.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {conectado ? "WhatsApp conectado" : qr ? "Escaneie com o celular" : "Conectar WhatsApp"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-center">
          <span
            className={cn(
              "mx-auto grid h-14 w-14 place-items-center rounded-2xl",
              conectado ? "bg-success-soft text-success" : "bg-coral-soft text-coral",
            )}
          >
            {conectado ? (
              <CheckCircle2 className="h-7 w-7" strokeWidth={1.75} />
            ) : carregando ? (
              <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.75} />
            ) : (
              <WifiOff className="h-6 w-6" strokeWidth={1.75} />
            )}
          </span>

          {conectado ? (
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                {conexao?.telefone ? formatWhatsappNumber(conexao.telefone) : "Número conectado"}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                As conversas deste WhatsApp aparecem em Atendimentos → Chat.
              </p>
            </div>
          ) : qr ? (
            <>
              {/* As instruções ao lado do QR, e não antes dele: quem está com
                  o celular na mão precisa do caminho do menu agora, não de um
                  texto que já rolou para fora da tela. */}
              <img
                src={qr}
                alt="QR Code para conectar o WhatsApp"
                className="mx-auto h-56 w-56 rounded-2xl border border-border bg-white object-contain p-2"
              />
              <ol className="mx-auto max-w-[280px] space-y-1.5 text-left text-xs leading-5 text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground-secondary">1.</span> Abra o WhatsApp
                  no celular
                </li>
                <li>
                  <span className="font-medium text-foreground-secondary">2.</span> Toque em{" "}
                  <span className="font-medium text-foreground-secondary">Configurações</span> →{" "}
                  <span className="font-medium text-foreground-secondary">
                    Aparelhos conectados
                  </span>
                </li>
                <li>
                  <span className="font-medium text-foreground-secondary">3.</span> Toque em{" "}
                  <span className="font-medium text-foreground-secondary">Conectar aparelho</span> e
                  aponte para o código
                </li>
              </ol>
              <p className="text-2xs text-muted-foreground">
                O código se renova sozinho a cada 30 segundos.
              </p>
            </>
          ) : (
            <p className="mx-auto max-w-[300px] text-sm leading-6 text-muted-foreground">
              Ao conectar, as conversas deste número passam a aparecer aqui dentro — e os lembretes
              de consulta saem por ele.
            </p>
          )}

          {erro && (
            <p className="rounded-xl bg-danger-soft px-3 py-2 text-left text-xs leading-5 text-danger">
              {erro}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {!conectado && (
              <Button
                type="button"
                variant="premium"
                className="h-11 w-full rounded-full"
                onClick={() => gerar.mutate()}
                disabled={gerar.isPending}
              >
                {gerar.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : qr ? (
                  <RefreshCw className="mr-2 h-4 w-4" />
                ) : (
                  <Smartphone className="mr-2 h-4 w-4" />
                )}
                {gerar.isPending ? "Gerando…" : qr ? "Gerar outro código" : "Conectar WhatsApp"}
              </Button>
            )}

            {conectado && (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-full"
                onClick={() => desconectar.mutate()}
                disabled={desconectar.isPending}
              >
                {desconectar.isPending ? "Desconectando…" : "Desconectar"}
              </Button>
            )}
          </div>

          {conexao?.instancia && (
            <p className="text-2xs text-muted-foreground">Conexão própria · {conexao.instancia}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
