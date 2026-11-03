import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { abrirConversaDoPaciente } from "@/lib/atendimentos/atendimentos.functions";

/**
 * Abre o chat do sistema na conversa de um paciente — a que já existe ou uma
 * nova. É o único caminho dos botões "Abrir conversa" da agenda e da ficha:
 * o WhatsApp de fora não é mais oferecido, porque a conversa que importa é a
 * espelhada aqui, onde a assistente e a equipe enxergam o mesmo histórico.
 */
export function useAbrirConversa(patientId: string | undefined) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const abrir = useServerFn(abrirConversaDoPaciente);
  const mutacao = useMutation({
    mutationFn: () => abrir({ data: { patientId: patientId! } }),
    onSuccess: ({ conversationId, nova }) => {
      if (nova) queryClient.invalidateQueries({ queryKey: ["conversations"] });
      navigate({ to: "/atendimentos/chat", search: { conversationId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return {
    abrir: () => patientId && mutacao.mutate(),
    abrindo: mutacao.isPending,
  };
}
