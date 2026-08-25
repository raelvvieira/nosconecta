import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Rocket } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getDailySendUsage } from "@/lib/atendimentos/campaigns.functions";
import type { RitmoDoDisparo } from "@/lib/atendimentos/broadcast.functions";
import { enfileirarDisparo } from "@/lib/atendimentos/enfileiramento";
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
  /** Avisa a página que há um disparo em preparação para acompanhar na lista. */
  onCreated: () => void;
}) {
  const fetchUsage = useServerFn(getDailySendUsage);

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

  // Confirmou: a tela sai de cena na hora e o acompanhamento passa a ser a
  // lista de Campanhas — o enfileiramento vira um cartão de verdade lá, com
  // etapa, percentual e, se der errado, o erro e a retentativa. Esperar o
  // servidor com o diálogo aberto prendia a pessoa num "Enfileirando…" que não
  // contava nada, e um toast de erro levava embora a seleção inteira.
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
    // Classificação pura, instantânea: o vínculo com o CRM acontece em blocos,
    // no servidor, já com a tela fechada.
    const { prontos, aVincular, foraDoDisparo } = classificarSelecao(alvos);
    enfileirarDisparo({
      nome: dados.name,
      message: dados.message,
      ritmo: dados.ritmo,
      mediaPath: dados.mediaPath,
      prontos,
      aVincular,
      foraDoDisparo,
    });
    onCreated();
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
