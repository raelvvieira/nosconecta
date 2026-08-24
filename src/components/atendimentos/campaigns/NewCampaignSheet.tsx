import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Rocket } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getDailySendUsage } from "@/lib/atendimentos/campaigns.functions";
import { criarDisparo, type RitmoDoDisparo } from "@/lib/atendimentos/broadcast.functions";
import { garantirContatoCrm } from "@/lib/patients/patients.functions";
import { prepararAlvos } from "@/lib/atendimentos/prepararAlvos";
import { ContactsTab, type ContatoSelecionado } from "@/components/atendimentos/contacts/ContactsTab";
import { BroadcastDialog } from "@/components/atendimentos/contacts/BroadcastDialog";

/**
 * Novo disparo: escolher quem recebe, revisar, enviar.
 *
 * Isto já foi um formulário de campanha com escolha de audiência, ritmo,
 * modelo e etapa de destino no funil. Aquele caminho ia para o motor de
 * campanhas do CRM, que **nunca enviou nada** — o time deles confirmou em
 * 18/08 olhando o próprio banco: 5 campanhas criadas, 0 executadas, porque o
 * servidor que o motor exige não está implantado.
 *
 * Manter os dois caminhos na tela era oferecer uma promessa que o sistema não
 * podia cumprir. Sobrou o que entrega: seleção de contatos e a fila própria de
 * disparo, testada com entrega real.
 */
export function NewCampaignSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchUsage = useServerFn(getDailySendUsage);
  const doDisparar = useServerFn(criarDisparo);
  const doGarantirContato = useServerFn(garantirContatoCrm);

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [disparoSelecao, setDisparoSelecao] = useState<ContatoSelecionado[] | null>(null);

  // Mesma chave da página: reaproveita o cache em vez de pedir de novo, e os
  // dois lugares mostram o mesmo número de cota.
  const usageQuery = useQuery({
    queryKey: ["campaigns-usage"],
    queryFn: () => fetchUsage(),
    enabled: open,
    staleTime: 15_000,
  });

  const reset = () => {
    setSelecionados(new Set());
    setDisparoSelecao(null);
  };

  const disparoMutation = useMutation({
    mutationFn: async (dados: {
      message: string;
      ritmo: RitmoDoDisparo;
      mediaPath: string | null;
    }) => {
      // Exigente (sem `tolerante`): aqui a pessoa escolheu cada contato a dedo,
      // então um que não possa receber precisa parar tudo em vez de sair da
      // lista sem ela perceber.
      const { alvos } = await prepararAlvos(disparoSelecao ?? [], doGarantirContato);
      return doDisparar({ data: { ...dados, targets: alvos } });
    },
    onSuccess: (r) => {
      const fim = r.terminaEm ? new Date(r.terminaEm) : null;
      toast.success(
        fim
          ? `Fila criada com ${r.total} contatos — termina por volta das ${fim.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`
          : `Fila criada com ${r.total} contatos.`,
        { duration: 8000 },
      );
      queryClient.invalidateQueries({ queryKey: ["campaigns-usage"] });
      queryClient.invalidateQueries({ queryKey: ["disparos"] });
      // Sem isto, quem acabou de entrar na fila continua aparecendo como "ainda
      // não recebeu" até o cache vencer — e no envio em lotes isso é o que
      // faria o progresso não andar e o mesmo lote ser oferecido de novo.
      queryClient.invalidateQueries({ queryKey: ["broadcast-recent-recipients"] });
      setDisparoSelecao(null);
      onOpenChange(false);
      reset();
      onCreated();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          onOpenChange(next);
        }}
      >
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
          <SheetHeader className="border-b border-border bg-gradient-to-br from-pink-soft/50 to-coral-soft/40 px-6 py-5 text-left">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-primary text-white shadow-soft">
                <Rocket className="h-5 w-5" />
              </span>
              <div>
                <SheetTitle>Novo disparo</SheetTitle>
                <SheetDescription>
                  Escolha quem recebe; a mensagem e o ritmo vêm na revisão.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="px-6 py-6">
            <ContactsTab
              ativo={open}
              barraFixa={false}
              selecionados={selecionados}
              onSelecionadosChange={setSelecionados}
              onDisparar={setDisparoSelecao}
            />
          </div>
        </SheetContent>
      </Sheet>

      <BroadcastDialog
        contatos={disparoSelecao}
        usage={usageQuery.data ?? { limit: 200, usedToday: 0 }}
        isPending={disparoMutation.isPending}
        onOpenChange={(o) => !o && setDisparoSelecao(null)}
        onConfirm={(dados) => disparoMutation.mutate(dados)}
      />
    </>
  );
}
