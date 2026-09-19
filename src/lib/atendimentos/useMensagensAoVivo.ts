import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * A conversa em tempo real, por WebSocket.
 *
 * ── O que isto substitui ────────────────────────────────────────────────
 *
 * A tela perguntava "chegou algo?" de 5 em 5 segundos (a thread) e de 15 em
 * 15 (a lista). A mensagem entra no banco em cerca de UM segundo — medido:
 * o webhook grava com menos de 800ms de diferença entre a hora do WhatsApp e
 * a da gravação. O atraso todo estava na pergunta, não na chegada.
 *
 * Cinco segundos numa conversa ao vivo é o tempo de a pessoa do outro lado
 * achar que ninguém está lendo.
 *
 * Aqui o banco AVISA. O Postgres empurra a linha nova pelo WebSocket do
 * Supabase e a tela recarrega na hora.
 *
 * ── Por que a consulta continua existindo ───────────────────────────────
 *
 * WebSocket cai: rede de celular trocando de torre, aba dormindo, proxy no
 * meio. Se o tempo real fosse o único caminho, a conversa congelaria sem
 * ninguém perceber — e o modo de falhar silencioso é justamente o que mais
 * deu trabalho neste sistema.
 *
 * Então a consulta periódica continua, como rede de segurança, mas ela
 * DESACELERA quando o tempo real está de pé (5s → 20s). O `aoVivo` que esta
 * função devolve é o que decide isso, e é honesto: só vira `true` depois que
 * o Supabase confirma a inscrição.
 */
export function useMensagensAoVivo(ativo: boolean): boolean {
  const queryClient = useQueryClient();
  const [aoVivo, setAoVivo] = useState(false);

  useEffect(() => {
    if (!ativo) {
      setAoVivo(false);
      return;
    }

    const canal = supabase
      .channel("wa-mensagens-ao-vivo")
      .on(
        "postgres_changes",
        // Sem filtro de dono: a política de acesso da tabela já limita o que
        // o Postgres empurra para cada pessoa (`owner_id = auth.uid()`), e um
        // filtro a mais aqui só criaria um segundo lugar para errar.
        { event: "INSERT", schema: "public", table: "wa_messages" },
        () => {
          // Invalidar em vez de inserir na lista: a mensagem passa pelo
          // mesmo caminho de leitura de sempre — junção das conversas do
          // número, anexos, ordem — em vez de por um segundo caminho que
          // teria de repetir tudo isso e acabaria divergindo.
          queryClient.invalidateQueries({ queryKey: ["atendimentos-messages"] });
          queryClient.invalidateQueries({ queryKey: ["atendimentos-conversations"] });
        },
      )
      .subscribe((status) => {
        const ligado = status === "SUBSCRIBED";
        setAoVivo(ligado);
        if (!ligado && status !== "CLOSED") {
          // Não é fatal — a consulta periódica cobre. Mas não pode passar em
          // silêncio: sem este aviso, "está lento" viraria um mistério.
          console.warn("[tempo real] mensagens sem WebSocket:", status);
        }
      });

    return () => {
      supabase.removeChannel(canal);
    };
  }, [ativo, queryClient]);

  return aoVivo;
}
