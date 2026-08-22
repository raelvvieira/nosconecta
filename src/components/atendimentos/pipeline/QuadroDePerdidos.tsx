import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw, Send } from "lucide-react";
import type { PipelineItem } from "@/lib/atendimentos/pipeline.functions";
import {
  LOSS_REASONS,
  motivoEhDefinitivo,
  motivoNormalizado,
  type Deal,
} from "@/lib/atendimentos/deals.functions";
import { getUltimoDisparoPorContato } from "@/lib/atendimentos/broadcast.functions";
import { getRegrasDosFunis } from "@/lib/atendimentos/funis.functions";
import {
  REGRAS_PERDIDOS_PADRAO,
  classificar,
  type SinaisDoPerdido,
} from "@/lib/atendimentos/funnelRules";
import type { ConversationRow } from "@/lib/atendimentos/atendimentos.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ContatoSelecionado } from "@/components/atendimentos/contacts/ContactsTab";
import { useDisparoDeColuna } from "@/components/atendimentos/pipeline/useDisparoDeColuna";

// O funil de recuperação.
//
// A primeira versão agrupava pelo MOTIVO da perda. Motivo é taxonomia: nada
// nunca se move entre as colunas, e um quadro onde nada anda é relatório, não
// funil. Como o destino destes contatos é disparo, a pergunta que importa não é
// por que a pessoa saiu — é se já dá para abordar de novo e se já tentamos.
//
// O motivo continua existindo, como etiqueta e filtro. É a combinação dos dois
// que dá público preciso: "pronto para reativar" + "saiu por preço" é um grupo
// com uma mensagem óbvia.

/** Perdido classificado pela regra da clínica. */
interface Perdido {
  item: PipelineItem;
  deal: Deal;
  motivo: string;
  etapa: string;
  contactId: string | null;
  conversationId: string | null;
  phone: string | null;
}

/** Os sinais que a regra lê. Só isto — a decisão de qual coluna é da regra,
 *  que a clínica edita, não deste arquivo. */
function sinaisDe(
  deal: Deal,
  ultimoDisparo: string | undefined,
  ultimaMensagem: string | null | undefined,
): SinaisDoPerdido {
  const perdidoEm = deal.updatedAt;
  // Disparo ANTERIOR à perda não conta como tentativa de reativação — era a
  // campanha que talvez tenha originado o contato.
  const tentativa = ultimoDisparo && perdidoEm && ultimoDisparo > perdidoEm ? ultimoDisparo : null;
  return {
    motivoDefinitivo: motivoEhDefinitivo(deal.lossReason),
    diasDesdePerda: perdidoEm ? (Date.now() - new Date(perdidoEm).getTime()) / 864e5 : null,
    recebeuDisparoAposPerda: !!tentativa,
    // Comparado por data e não por "não lidas" porque a resposta continua
    // valendo depois de alguém da clínica abrir a conversa — e é justamente a
    // já lida que corre risco de ser esquecida.
    respondeuAposDisparo: !!tentativa && !!ultimaMensagem && ultimaMensagem > tentativa,
  };
}

/** Card perdido no formato que o disparo entende. Sempre origem "crm": estes
 *  contatos nasceram de uma conversa no WhatsApp, então já existem lá. */
function paraContato(p: Perdido): ContatoSelecionado {
  return {
    id: p.contactId!,
    name: p.item.title || "Sem nome",
    phone: p.phone,
    origem: "crm",
    patientId: null,
    conversationId: p.conversationId,
  };
}

export function QuadroDePerdidos({
  itens,
  deals,
  conversas,
  busca,
  onAbrir,
}: {
  itens: PipelineItem[];
  deals: Map<string, Deal>;
  conversas: ConversationRow[];
  busca: string;
  onAbrir: (item: PipelineItem) => void;
}) {
  const { abrir, dialogo } = useDisparoDeColuna();
  const buscarDisparos = useServerFn(getUltimoDisparoPorContato);
  const buscarRegras = useServerFn(getRegrasDosFunis);

  const regrasQuery = useQuery({
    queryKey: ["regras-dos-funis"],
    queryFn: () => buscarRegras(),
    staleTime: 5 * 60_000,
  });
  const regras = regrasQuery.data?.perdidos ?? REGRAS_PERDIDOS_PADRAO;
  const [motivoFiltro, setMotivoFiltro] = useState<string | null>(null);

  const disparos = useQuery({
    queryKey: ["ultimo-disparo-por-contato"],
    queryFn: () => buscarDisparos(),
    staleTime: 60_000,
  });

  const perdidos = useMemo<Perdido[]>(() => {
    const termo = busca.trim().toLowerCase();
    const porContato = new Map<string, ConversationRow>();
    for (const c of conversas) if (c.contactId) porContato.set(c.contactId, c);

    const lista: Perdido[] = [];
    for (const item of itens) {
      const deal = deals.get(item.id);
      if (!deal || deal.status !== "lost") continue;
      const nome = item.title ?? "";
      if (termo && !nome.toLowerCase().includes(termo)) continue;

      const contactId = item.type === "contact" ? item.itemId : null;
      const conversa = contactId ? porContato.get(contactId) : undefined;
      lista.push({
        item,
        deal,
        contactId,
        conversationId: conversa?.id ?? null,
        phone: conversa?.phone ?? null,
        motivo: motivoNormalizado(deal.lossReason),
        etapa: classificar(
          regras,
          sinaisDe(deal, contactId ? disparos.data?.[contactId] : undefined, conversa?.lastMessageAt),
        ),
      });
    }
    return lista;
  }, [itens, deals, conversas, busca, disparos.data, regras]);

  const filtrados = motivoFiltro ? perdidos.filter((p) => p.motivo === motivoFiltro) : perdidos;
  // Só os motivos que de fato aparecem — chip de filtro que devolve zero é
  // ruído, e a lista de motivos é grande o bastante para incomodar.
  const motivosPresentes = [...new Set(perdidos.map((p) => p.motivo))].sort();

  if (!perdidos.length) {
    return (
      <section className="surface-card mt-4 p-8 text-center">
        <p className="text-sm font-medium text-foreground">Nenhuma negociação perdida</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {busca
            ? "Ninguém com esse nome por aqui."
            : "Quando uma negociação for marcada como perdida, ela entra aqui — e o quadro mostra quando já dá para tentar de novo."}
        </p>
      </section>
    );
  }

  return (
    <div className="mt-4 flex flex-1 flex-col">
      {motivosPresentes.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 pb-3">
          <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Motivo
          </span>
          <button
            type="button"
            onClick={() => setMotivoFiltro(null)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-2xs transition-colors",
              !motivoFiltro ? "border-transparent bg-foreground text-white" : "border-border hover:bg-muted/50",
            )}
          >
            Todos
          </button>
          {motivosPresentes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMotivoFiltro(m === motivoFiltro ? null : m)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-2xs transition-colors",
                m === motivoFiltro
                  ? "border-transparent bg-foreground text-white"
                  : "border-border hover:bg-muted/50",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      <div className="custom-scroll flex flex-1 gap-3 overflow-x-auto pb-2">
        {regras.filter((r) => r.ativa).map((regra) => {
          const etapa = regra.id;
          const lista = filtrados.filter((p) => p.etapa === etapa);
          return (
            <div key={etapa} className="flex w-[280px] shrink-0 flex-col">
              <div className="flex items-center gap-2 px-1 pb-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: regra.cor }} />
                <h3 className="truncate text-sm font-semibold">{regra.nome}</h3>
                <span className="ml-auto text-xs font-semibold text-muted-foreground">
                  {lista.length}
                </span>
              </div>
              <p className="px-1 pb-2 text-3xs leading-snug text-muted-foreground">{regra.explica}</p>

              {/* "Não perturbar" nunca ganha botão, e isso não é configurável:
                  a coluna existe exatamente para essas pessoas NÃO receberem.
                  Um botão ali seria um pedido de erro. */}
              {/* A trava é pela CONDIÇÃO, não pelo id da etapa: coluna cujo
                  critério é "motivo definitivo" existe exatamente para essas
                  pessoas não receberem. Amarrar ao id "nao_perturbar" quebraria
                  assim que a clínica renomeasse a etapa ou criasse outra com o
                  mesmo critério — e é essa edição que estamos abrindo. */}
              {regra.condicao !== "motivo_definitivo" && lista.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mb-2 h-8 w-full gap-1.5 text-2xs"
                  onClick={() => abrir(lista.filter((p) => p.contactId).map(paraContato))}
                >
                  <Send className="h-3 w-3" />
                  Disparar para {lista.filter((p) => p.contactId).length}
                </Button>
              )}

              <div className="custom-scroll flex-1 space-y-2 overflow-y-auto overflow-x-hidden rounded-2xl bg-surface-subtle p-2">
                {!lista.length ? (
                  <p className="py-6 text-center text-2xs text-muted-foreground">Vazio</p>
                ) : (
                  lista.map(({ item, deal, motivo }) => (
                    <div key={item.id} className="surface-card px-3 py-2.5">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {item.title || "Sem nome"}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-3xs font-semibold text-muted-foreground">
                          {motivo}
                        </span>
                        {deal.value ? (
                          <span className="text-3xs text-muted-foreground">
                            {deal.value.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                          </span>
                        ) : null}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 w-full gap-1.5 text-2xs"
                        onClick={() => onAbrir(item)}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reabrir
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      {dialogo}
    </div>
  );
}
