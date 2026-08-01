import { useEffect, useState } from "react";
import { Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function CreateTransmissionDialog({
  open,
  onOpenChange,
  defaultTitle,
  audienceSize,
  isPending,
  moveProgress,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTitle: string;
  audienceSize: number | null;
  isPending: boolean;
  moveProgress: { done: number; total: number } | null;
  onConfirm: (title: string, saveAudienceList: boolean) => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [confirmedNoSpam, setConfirmedNoSpam] = useState(false);
  const [saveAudienceList, setSaveAudienceList] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setConfirmedNoSpam(false);
      setSaveAudienceList(false);
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
                className="h-full rounded-full bg-gradient-primary transition-all"
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

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-white p-3 text-sm">
              <Checkbox checked={confirmedNoSpam} onCheckedChange={(v) => setConfirmedNoSpam(!!v)} className="mt-0.5" />
              Não irei fazer SPAM
            </label>

            {audienceSize !== null && audienceSize > 0 && (
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-white p-3 text-sm">
                <Checkbox checked={saveAudienceList} onCheckedChange={(v) => setSaveAudienceList(!!v)} className="mt-0.5" />
                Salvar lista ({audienceSize} contato{audienceSize > 1 ? "s" : ""})
              </label>
            )}

            <Button
              className="w-full gap-2 bg-gradient-primary text-white"
              disabled={!title.trim() || !confirmedNoSpam || busy}
              onClick={() => onConfirm(title.trim(), saveAudienceList)}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Criar e iniciar transmissão
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
