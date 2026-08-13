import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, HelpCircle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatWhatsappNumber } from "@/lib/atendimentos/phone";
import { getConversations, getWhatsappInboxes } from "@/lib/atendimentos/atendimentos.functions";
import { daParaSepararPorNumero, montarRetrato } from "@/lib/atendimentos/inboxSnapshot";

/**
 * Quais números já passaram por esta conta do CRM, e quanta conversa cada um
 * deixou.
 *
 * Existe por uma pergunta sem resposta até agora: quando a clínica troca de
 * número, o Wavy **cria uma caixa nova e mantém a antiga**, com todas as
 * conversas dela. Nem `/contacts` nem `/conversations` aceitam filtro de caixa,
 * então tudo o que o sistema lê é da conta inteira — e não havia como saber se
 * um contato veio do número de hoje ou de um anterior.
 *
 * Esta tela é só leitura, e é o que precisa vir antes de qualquer decisão de
 * apagar coisa: apagar "os do número antigo" sem saber quais são apagaria a
 * base do número atual junto.
 */
export function InboxSnapshot() {
  const fetchInboxes = useServerFn(getWhatsappInboxes);
  const fetchConversations = useServerFn(getConversations);

  const inboxesQuery = useQuery({
    queryKey: ["crm-inboxes"],
    queryFn: () => fetchInboxes(),
    staleTime: 5 * 60_000,
  });
  const conversationsQuery = useQuery({
    queryKey: ["atendimentos-conversations"],
    queryFn: () => fetchConversations(),
    staleTime: 60_000,
  });

  const conversas = conversationsQuery.data ?? SEM_CONVERSAS;
  const inboxes = inboxesQuery.data?.inboxes ?? SEM_INBOXES;
  const conectadaId = inboxesQuery.data?.conectadaId ?? null;

  const linhas = useMemo(
    () => montarRetrato(conversas, inboxes, conectadaId),
    [conversas, inboxes, conectadaId],
  );
  const separavel = useMemo(() => daParaSepararPorNumero(conversas), [conversas]);

  const carregando = inboxesQuery.isPending || conversationsQuery.isPending;

  return (
    <div className="surface-card mt-6 p-5 sm:p-6" data-retrato-caixas="">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-coral-soft text-coral">
          <Inbox className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold">Números nesta conta do CRM</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Trocar de número no WhatsApp cria uma caixa nova e mantém a anterior, com
            as conversas dela. Aqui está o que existe hoje na conta.
          </p>
        </div>
      </div>

      {carregando ? (
        <p className="mt-5 text-sm text-muted-foreground">Lendo as caixas do CRM…</p>
      ) : inboxesQuery.isError ? (
        <p className="mt-5 text-sm text-danger">
          Não foi possível ler as caixas: {(inboxesQuery.error as Error).message}
        </p>
      ) : (
        <>
          <ul className="mt-5 divide-y divide-border rounded-2xl border border-border">
            {linhas.map((l) => (
              <li
                key={l.inboxId ?? "sem-caixa"}
                data-caixa={l.inboxId ?? "sem-caixa"}
                className="flex items-center gap-3 px-4 py-3"
              >
                {l.conectada ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" strokeWidth={2} />
                ) : l.indeterminada ? (
                  <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" strokeWidth={2} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.rotulo}</p>
                  {l.phoneNumber && (
                    <p className="truncate font-mono text-2xs text-muted-foreground">
                      {formatWhatsappNumber(l.phoneNumber)}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 tabular-nums text-sm",
                    l.conectada ? "font-semibold text-success" : "text-muted-foreground",
                  )}
                  data-conversas={String(l.conversas)}
                >
                  {l.conversas} conversa{l.conversas === 1 ? "" : "s"}
                </span>
                {l.conectada && (
                  <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-3xs font-semibold text-success">
                    conectada
                  </span>
                )}
              </li>
            ))}
          </ul>

          {/* A conclusão honesta, e não um filtro que finge filtrar. */}
          {!separavel && conversas.length > 0 && (
            <p
              data-sem-separacao=""
              className="mt-4 flex gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-2xs leading-4 text-warning"
            >
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              O CRM não informa a caixa em nenhuma conversa, então <strong>não é
              possível separar por número</strong> — nem para filtrar, nem para
              apagar. Qualquer recorte aqui seria chute. É preciso pedir ao Wavy
              que devolva a caixa na listagem de conversas.
            </p>
          )}

          {separavel && (
            <p className="mt-4 text-2xs leading-4 text-muted-foreground">
              Só a caixa marcada como conectada é do número em uso. As outras são de
              números anteriores — as conversas delas continuam no CRM até serem
              apagadas por lá.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Identidade estável: `?? []` novo a cada render invalidaria os memos. */
const SEM_CONVERSAS: never[] = [];
const SEM_INBOXES: never[] = [];
