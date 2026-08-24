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
import { classificarSelecao } from "@/lib/atendimentos/prepararAlvos";
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
  /** Recebe o id do disparo recém-criado, para a página destacá-lo na lista. */
  onCreated: (broadcastId: string) => void;
}) {
  const queryClient = useQueryClient();
  const fetchUsage = useServerFn(getDailySendUsage);
  const doDisparar = useServerFn(criarDisparo);

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
      name: string;
      ritmo: RitmoDoDisparo;
      mediaPath: string | null;
      alvos: ContatoSelecionado[];
    }) => {
      // Classificação pura, instantânea: o vínculo com o CRM acontece no
      // servidor, em lote. Os alvos vêm por parâmetro porque a tela já fechou
      // quando esta chamada acontece — o estado da seleção não existe mais.
      const { alvos, ...envio } = dados;
      const { prontos, aVincular, foraDoDisparo } = classificarSelecao(alvos);
      const r = await doDisparar({ data: { ...envio, prontos, aVincular } });
      return { ...r, foraDoDisparo: [...foraDoDisparo, ...r.foraDoDisparo] };
    },
    onSuccess: (r) => {
      toast.success(`Disparo na fila com ${r.total} contatos.`, { duration: 6000 });
      if (r.foraDoDisparo.length) {
        toast.warning(
          `${r.foraDoDisparo.length} ${r.foraDoDisparo.length === 1 ? "pessoa ficou" : "pessoas ficaram"} de fora: ` +
            r.foraDoDisparo.map((f) => f.nome).join(", "),
          { duration: 10000 },
        );
      }
      queryClient.invalidateQueries({ queryKey: ["campaigns-usage"] });
      queryClient.invalidateQueries({ queryKey: ["disparos"] });
      queryClient.invalidateQueries({ queryKey: ["broadcast-recent-recipients"] });
      onCreated(r.broadcastId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Confirmou: a tela sai de cena na hora e o acompanhamento passa a ser a
  // lista de Campanhas, que se atualiza sozinha enquanto a fila anda. Esperar
  // o servidor com o diálogo aberto prendia a pessoa num "Enfileirando…" que
  // não conta nada além do que a própria lista já mostra.
  const confirmarDisparo = (dados: {
    message: string;
    name: string;
    ritmo: RitmoDoDisparo;
    mediaPath: string | null;
  }) => {
    const alvos = disparoSelecao ?? [];
    setDisparoSelecao(null);
    onOpenChange(false);
    reset();
    toast.info("Enfileirando o disparo…", { duration: 3000 });
    disparoMutation.mutate({ ...dados, alvos });
  };

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
        onConfirm={confirmarDisparo}
      />
    </>
  );
}
