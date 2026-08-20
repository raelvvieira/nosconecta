import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info, MessageCircle, UserX } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PhonePreview } from "@/components/atendimentos/campaigns/PhonePreview";
import type { ContatoSelecionado } from "./ContactsTab";

/** Ritmo entre mensagens, em segundos. Rajada é o que mais derruba número. */
const RITMOS = [
  { valor: 8, label: "8 segundos (sugerido)" },
  { valor: 15, label: "15 segundos" },
  { valor: 30, label: "30 segundos" },
  { valor: 3, label: "3 segundos (arriscado)" },
];

/**
 * Revisão antes de disparar para uma seleção.
 *
 * Mesmo desenho do `FireCampaignDialog`: a mensagem à vista, quantos vão,
 * quanto sobra da cota. A diferença é a divisão entre os dois caminhos de
 * envio — quem tem conversa aberta recebe por um caminho confirmado, quem não
 * tem depende de um endpoint do CRM que nunca foi testado. Dizer isso antes é
 * o que evita a pessoa achar que alcançou a base inteira.
 */
export function BroadcastDialog({
  contatos,
  usage,
  isPending,
  onOpenChange,
  onConfirm,
}: {
  /** `null` = fechado. */
  contatos: ContatoSelecionado[] | null;
  usage: { limit: number; usedToday: number };
  isPending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (dados: { message: string; intervalSeconds: number }) => void;
}) {
  const [mensagem, setMensagem] = useState("");
  const [ritmo, setRitmo] = useState(8);
  const [erro, setErro] = useState<string | null>(null);
  const aberto = Boolean(contatos?.length);

  useEffect(() => {
    if (!aberto) return;
    setMensagem("");
    setRitmo(8);
    setErro(null);
  }, [aberto]);

  const { comConversa, semConversa } = useMemo(() => {
    const lista = contatos ?? [];
    return {
      comConversa: lista.filter((c) => c.conversationId).length,
      semConversa: lista.filter((c) => !c.conversationId).length,
    };
  }, [contatos]);

  const total = contatos?.length ?? 0;
  const restante = Math.max(0, usage.limit - usage.usedToday);
  const estouraLimite = total > restante;
  const minutos = Math.round(((total - 1) * ritmo) / 60);

  const confirmar = () => {
    if (!mensagem.trim()) {
      setErro("Escreva a mensagem que será enviada.");
      return;
    }
    setErro(null);
    onConfirm({ message: mensagem.trim(), intervalSeconds: ritmo });
  };

  return (
    <AlertDialog open={aberto} onOpenChange={(o) => !o && onOpenChange(false)}>
      <AlertDialogContent className="max-w-[560px]" data-disparo-revisao="">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Disparar para {total} contato{total === 1 ? "" : "s"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Confira a mensagem antes de enviar. Depois de disparada, não há como recolher.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="disparo-msg" className="text-sm text-foreground-secondary">
                Mensagem *
              </Label>
              <Textarea
                id="disparo-msg"
                data-disparo-mensagem=""
                value={mensagem}
                onChange={(e) => {
                  setMensagem(e.target.value);
                  if (erro) setErro(null);
                }}
                placeholder="Digite a mensagem que será enviada para os selecionados…"
                className="min-h-24 rounded-xl bg-white"
              />
              {erro && (
                <p data-disparo-erro="" className="text-2xs text-danger">
                  {erro}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="disparo-ritmo" className="text-sm text-foreground-secondary">
                Intervalo entre mensagens
              </Label>
              <select
                id="disparo-ritmo"
                data-disparo-ritmo=""
                value={ritmo}
                onChange={(e) => setRitmo(Number(e.target.value))}
                className="w-full min-w-0 rounded-xl border border-border bg-white px-3 py-2 text-sm"
              >
                {RITMOS.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.label}
                  </option>
                ))}
              </select>
              <p className="text-2xs text-muted-foreground">
                A fila leva cerca de {minutos < 1 ? "menos de um minuto" : `${minutos} minutos`} e
                continua mesmo com o aplicativo fechado.
              </p>
            </div>

            {/* A divisão que importa: quem recebe por caminho confirmado e quem
                depende de um endpoint que ainda não foi provado. */}
            <div className="space-y-1.5 rounded-xl bg-surface px-3 py-2.5 text-2xs leading-4">
              <p className="flex items-center gap-2 text-foreground-secondary">
                <MessageCircle className="h-3.5 w-3.5 shrink-0 text-success" />
                <span data-com-conversa="">
                  <strong>{comConversa}</strong> com conversa aberta — envio direto.
                </span>
              </p>
              {semConversa > 0 && (
                <p className="flex items-center gap-2 text-foreground-secondary">
                  <UserX className="h-3.5 w-3.5 shrink-0 text-warning" />
                  <span data-sem-conversa="">
                    <strong>{semConversa}</strong> sem conversa — tentamos abrir pelo contato,
                    mas esse caminho ainda não foi confirmado pelo CRM e pode falhar.
                  </span>
                </p>
              )}
            </div>

            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Sobra hoje</span>
              <span className={estouraLimite ? "font-semibold text-danger" : "font-semibold text-foreground"}>
                {restante} de {usage.limit}
              </span>
            </div>

            {estouraLimite && (
              <p className="flex gap-2 rounded-xl bg-danger-soft px-3 py-2 text-2xs leading-4 text-danger">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                A seleção passa do limite diário. O disparo será recusado.
              </p>
            )}

            <p className="flex gap-2 rounded-xl bg-surface px-3 py-2 text-2xs leading-4 text-muted-foreground">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              A cota do dia é debitada inteira no disparo — cancelar no meio não devolve.
            </p>
          </div>

          <div className="sm:w-[210px]">
            <PhonePreview content={mensagem} mediaUrl={null} />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            data-disparo-confirmar=""
            className="bg-gradient-primary text-white hover:opacity-90"
            disabled={isPending || estouraLimite || !mensagem.trim()}
            onClick={(e) => {
              e.preventDefault();
              confirmar();
            }}
          >
            {isPending ? "Enfileirando..." : `Disparar para ${total}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
