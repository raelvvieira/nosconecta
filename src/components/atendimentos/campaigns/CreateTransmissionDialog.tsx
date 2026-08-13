import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Rocket, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Último passo da criação de campanha.
 *
 * Aqui havia um botão só, "Criar e iniciar transmissão", que criava **e
 * disparava** na mesma ação — e a tela nunca dizia para quantas pessoas. Quem
 * clicava achando que estava salvando um rascunho mandava mensagem para a base
 * inteira, e o número só aparecia no toast, depois de sair.
 *
 * Agora são duas ações separadas, e a que dispara passa pela revisão de sempre:
 * contagem, cota do dia e preview, no `FireCampaignDialog` da lista.
 */
export function CreateTransmissionDialog({
  open,
  onOpenChange,
  defaultTitle,
  isPending,
  moveProgress,
  totalContatos,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTitle: string;
  isPending: boolean;
  moveProgress: { done: number; total: number } | null;
  /** Quantos contatos a campanha alcançaria. `null` enquanto carrega. */
  totalContatos: number | null;
  /** `disparar` decide se a campanha sai agora ou fica salva na lista. */
  onConfirm: (title: string, disparar: boolean) => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [confirmedNoSpam, setConfirmedNoSpam] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setConfirmedNoSpam(false);
    }
  }, [open, defaultTitle]);

  const busy = isPending || moveProgress !== null;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Criar Transmissão</DialogTitle>
        </DialogHeader>

        {moveProgress ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Campanha disparada. Movendo {moveProgress.done}/{moveProgress.total} contatos para a etapa de destino...
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-primary transition-[width]"
                style={{ width: `${(moveProgress.done / Math.max(1, moveProgress.total)) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="transmission-title">Título para referência</Label>
              <Input
                id="transmission-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1.5"
                placeholder="Título para pesquisar e resgatar a transmissão posteriormente"
              />
            </div>

            {/* O que o motor do Wavy faz, dito antes e não depois: campanha
                não recorta audiência, vai para todo mundo da conta do CRM. */}
            <p
              data-aviso-audiencia=""
              className="flex gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-2xs leading-4 text-warning"
            >
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span>
                Campanha vai para <strong>todos os {totalContatos ?? "…"} contatos</strong> da
                conta do CRM — não dá para escolher quem recebe por este caminho, e pode
                alcançar contatos de um número anterior. Para escolher pessoa por
                pessoa, volte e escolha <strong>Selecionar contatos</strong> em "Quem recebe".
              </span>
            </p>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-white p-3 text-sm">
              <Checkbox checked={confirmedNoSpam} onCheckedChange={(v) => setConfirmedNoSpam(!!v)} className="mt-0.5" />
              Não irei fazer SPAM
            </label>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                data-salvar-sem-disparar=""
                variant="outline"
                className="flex-1 gap-2"
                disabled={!title.trim() || busy}
                onClick={() => onConfirm(title.trim(), false)}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar sem disparar
              </Button>
              <Button
                data-criar-e-disparar=""
                className="flex-1 gap-2 bg-gradient-primary text-white"
                disabled={!title.trim() || !confirmedNoSpam || busy}
                onClick={() => onConfirm(title.trim(), true)}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Criar e disparar agora
              </Button>
            </div>
            <p className="text-2xs leading-4 text-muted-foreground">
              Salvar deixa a campanha pronta na lista; o disparo continua disponível
              lá, com a revisão completa.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
