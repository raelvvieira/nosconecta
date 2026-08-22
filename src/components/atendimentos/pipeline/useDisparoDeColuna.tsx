import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { criarDisparo } from "@/lib/atendimentos/broadcast.functions";
import { getDailySendUsage } from "@/lib/atendimentos/campaigns.functions";
import { garantirContatoCrm } from "@/lib/patients/patients.functions";
import { prepararAlvos } from "@/lib/atendimentos/prepararAlvos";
import { BroadcastDialog } from "@/components/atendimentos/contacts/BroadcastDialog";
import type { ContatoSelecionado } from "@/components/atendimentos/contacts/ContactsTab";

// Disparar para uma coluna do funil, sem sair do Pipeline.
//
// A alternativa seria levar a seleção até a tela de Campanhas — o que exigiria
// transportar centenas de ids entre rotas e depois casá-los contra a lista que
// o `ContactsTab` monta por conta própria. `BroadcastDialog` é autossuficiente
// (recebe contatos, cota e um onConfirm), então o caminho curto é também o
// mais confiável: o mesmo diálogo de revisão que a clínica já usa, ali mesmo.
//
// Um gancho só para os três quadros: o disparo não pode se comportar diferente
// dependendo de qual funil a pessoa estava olhando.

export function useDisparoDeColuna() {
  const queryClient = useQueryClient();
  const doDisparar = useServerFn(criarDisparo);
  const doGarantirContato = useServerFn(garantirContatoCrm);
  const fetchUsage = useServerFn(getDailySendUsage);

  const [selecao, setSelecao] = useState<ContatoSelecionado[] | null>(null);

  // Mesma chave da tela de campanhas: reaproveita o cache em vez de pedir de
  // novo, e os dois lugares mostram o mesmo número de cota.
  const usageQuery = useQuery({
    queryKey: ["campaigns-usage"],
    queryFn: () => fetchUsage(),
    enabled: !!selecao,
    staleTime: 15_000,
  });

  const disparo = useMutation({
    mutationFn: async (dados: { message: string; intervalSeconds: number }) => {
      // Tolerante: a lista veio de uma coluna inteira, não escolhida uma a uma.
      // Um paciente sem telefone não pode impedir o envio para os outros —
      // mas também não pode sumir calado, por isso `foraDoDisparo` vira aviso.
      const { alvos, foraDoDisparo } = await prepararAlvos(
        selecao ?? [],
        doGarantirContato,
        true,
      );
      if (!alvos.length) {
        throw new Error("Ninguém desta coluna pode receber disparo agora.");
      }
      const r = await doDisparar({ data: { ...dados, targets: alvos } });
      return { ...r, foraDoDisparo };
    },
    onSuccess: (r) => {
      toast.success(`Fila criada com ${r.total} contatos.`, { duration: 8000 });
      if (r.foraDoDisparo.length) {
        toast.warning(
          `${r.foraDoDisparo.length} ${r.foraDoDisparo.length === 1 ? "pessoa ficou" : "pessoas ficaram"} de fora: ` +
            r.foraDoDisparo.map((f) => f.nome).join(", "),
          { duration: 10000 },
        );
      }
      setSelecao(null);
      queryClient.invalidateQueries({ queryKey: ["campaigns-usage"] });
      queryClient.invalidateQueries({ queryKey: ["ultimo-disparo-por-contato"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const dialogo = (
    <BroadcastDialog
      contatos={selecao}
      usage={usageQuery.data ?? { limit: 200, usedToday: 0 }}
      isPending={disparo.isPending}
      onOpenChange={(open) => !open && setSelecao(null)}
      onConfirm={(dados) => disparo.mutate(dados)}
    />
  );

  return { abrir: setSelecao, dialogo };
}

/** Quantos daquela lista conseguem receber de fato — é o número que o botão
 *  mostra, para ele não prometer mais do que vai acontecer. */
export function quantosPodemReceber(contatos: ContatoSelecionado[]): number {
  return contatos.filter((c) => c.origem === "crm" || !!c.phone).length;
}
