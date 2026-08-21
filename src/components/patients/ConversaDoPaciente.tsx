import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { getConversations, getMessages } from "@/lib/atendimentos/atendimentos.functions";
import { cn } from "@/lib/utils";

// A conversa de WhatsApp do paciente, dentro da ficha dele.
//
// O chat já existia e o paciente já guardava `crm_contact_id` — mas para ver o
// que foi combinado com alguém era preciso sair da ficha, ir em Atendimentos e
// procurar a pessoa na lista. As duas metades da mesma informação viviam em
// telas diferentes.
//
// Só leitura: responder continua sendo no chat, que é onde estão o anexo, o
// agendamento de mensagem e o histórico completo. Duplicar o compositor aqui
// seria manter duas versões da mesma coisa.

const MAX = 4;

function horaDe(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConversaDoPaciente({ crmContactId }: { crmContactId: string | null }) {
  const buscarConversas = useServerFn(getConversations);
  const buscarMensagens = useServerFn(getMessages);

  const conversas = useQuery({
    queryKey: ["conversations"],
    queryFn: () => buscarConversas({}),
    staleTime: 30_000,
    enabled: !!crmContactId,
  });

  const conversa = conversas.data?.find((c) => c.contactId === crmContactId) ?? null;

  const mensagens = useQuery({
    queryKey: ["messages", conversa?.id],
    queryFn: () => buscarMensagens({ data: { conversationId: conversa!.id } }),
    staleTime: 30_000,
    enabled: !!conversa?.id,
  });

  // Paciente sem CRM ou sem conversa não rende um cartão vazio: some. Um bloco
  // dizendo "nenhuma conversa" ocuparia altura em toda ficha de paciente novo,
  // que é a maioria delas.
  if (!crmContactId || (conversas.isFetched && !conversa)) return null;

  const ultimas = (mensagens.data ?? []).slice(-MAX);

  return (
    <section className="surface-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-success" />
          <p className="text-xs text-muted-foreground">Conversa no WhatsApp</p>
        </div>
        {conversa && (
          <Link
            to="/atendimentos/chat"
            search={{ conversationId: conversa.id }}
            className="shrink-0 rounded text-xs font-semibold text-pink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Abrir conversa
          </Link>
        )}
      </div>

      {mensagens.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Carregando mensagens…</p>
      ) : !ultimas.length ? (
        <p className="mt-3 text-sm text-muted-foreground">Conversa aberta, ainda sem mensagens.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {ultimas.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                m.fromMe
                  ? "ml-auto bg-success-soft text-foreground"
                  : "bg-surface-muted text-foreground",
              )}
            >
              <p className="whitespace-pre-line break-words">{m.body}</p>
              <p className="mt-1 text-2xs text-muted-foreground">{horaDe(m.timestamp)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
