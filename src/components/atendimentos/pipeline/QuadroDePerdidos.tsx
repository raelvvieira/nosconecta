import { pessoaCasa } from "@/lib/pessoas/busca";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  listarLeadsPerdidos,
  reabrirLeadPerdido,
  type LeadPerdido,
} from "@/lib/atendimentos/leads-perdidos.functions";
import type { PipelineItem } from "@/lib/atendimentos/pipeline.functions";
import { chaveDoTelefone } from "@/lib/atendimentos/funil";
import type { Publico } from "@/lib/atendimentos/publico";
import {
  LOSS_REASONS,
  MOTIVOS_DEFINITIVOS,
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
  /** Chave estável do card (negociação do CRM ou lead pelo telefone). */
  chave: string;
  titulo: string;
  valor: number | null;
  /** Negociação perdida de um card do CRM — reabre abrindo o card. */
  item: PipelineItem | null;
  /** Lead do WhatsApp marcado como perdido — reabre devolvendo ao funil. */
  lead: LeadPerdido | null;
  deal: Deal | null;
  motivo: string;
  etapa: string;
  contactId: string | null;
  conversationId: string | null;
  phone: string | null;
}

/** Os sinais que a regra lê. Só isto — a decisão de qual coluna é da regra,
 *  que a clínica edita, não deste arquivo. */
function sinaisDe(
  deal: { lossReason: string | null; updatedAt: string | null },
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

/** Card perdido no formato que o disparo entende. Sempre origem "whatsapp":
 *  estes contatos nasceram de uma conversa. */
function paraContato(p: Perdido): ContatoSelecionado {
  return {
    id: p.contactId!,
    name: p.titulo || "Sem nome",
    phone: p.phone,
    origem: "whatsapp",
    patientId: null,
    conversationId: p.conversationId,
  };
}

export function QuadroDePerdidos({
  itens,
  deals,
  conversas,
  busca,
  publico,
  publicos,
  onAbrir,
}: {
  itens: PipelineItem[];
  deals: Map<string, Deal>;
  conversas: ConversationRow[];
  busca: string;
  /** O funil (público) visível. */
  publico: Publico;
  /** O público de cada telefone canônico que não é atendimento. */
  publicos: Record<string, Publico>;
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
  const queryClient = useQueryClient();
  const buscarLeads = useServerFn(listarLeadsPerdidos);
  const reabrirLead = useServerFn(reabrirLeadPerdido);
  const leadsPerdidos = useQuery({
    queryKey: ["leads-perdidos"],
    queryFn: () => buscarLeads(),
    staleTime: 30_000,
  });
  const reabrir = async (l: LeadPerdido) => {
    try {
      await reabrirLead({ data: { fone: l.fone } });
      toast.success(`${l.name} voltou para Leads.`);
      queryClient.invalidateQueries({ queryKey: ["leads-perdidos"] });
      queryClient.invalidateQueries({ queryKey: ["funil-leads"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const disparos = useQuery({
    queryKey: ["ultimo-disparo-por-contato"],
    queryFn: () => buscarDisparos(),
    staleTime: 60_000,
  });

  const perdidos = useMemo<Perdido[]>(() => {
    // Card → conversa, pelas duas chaves que um card pode ter. O card de
    // "pessoa" guarda o telefone, então o mapa é por telefone normalizado —
    // a mesma chave que a caixa de entrada usa para juntar as conversas de um
    // número, e por isso ela casa com qualquer thread da pessoa.
    const porTelefone = new Map<string, ConversationRow>();
    const porConversa = new Map<string, ConversationRow>();
    for (const c of conversas) {
      porConversa.set(c.id, c);
      const chave = chaveDoTelefone(c.phone);
      if (chave && !porTelefone.has(chave)) porTelefone.set(chave, c);
    }

    const lista: Perdido[] = [];
    for (const item of itens) {
      const deal = deals.get(item.id);
      if (!deal || deal.status !== "lost") continue;
      const nome = item.title ?? "";
      const foneDoItem =
        item.type === "pessoa" ? item.itemId : (porConversa.get(item.itemId)?.phone ?? null);
      if (!pessoaCasa(busca, { name: nome, phone: foneDoItem })) continue;
      // O público do card, pelo telefone: quem não está no mapa é atendimento.
      const telefoneDoCard =
        item.type === "pessoa" ? item.itemId : (porConversa.get(item.itemId)?.phone ?? null);
      const chaveDoCard = chaveDoTelefone(telefoneDoCard);
      const publicoDoCard = (chaveDoCard && publicos[chaveDoCard]) || "atendimento";
      if (publicoDoCard !== publico) continue;

      const conversa =
        item.type === "pessoa" ? porTelefone.get(item.itemId) : porConversa.get(item.itemId);
      // O contato sai da CONVERSA, não do card: é ele que o histórico de
      // disparos usa como chave, e o card passou a guardar o telefone.
      const contactId = conversa?.contactId ?? null;
      lista.push({
        chave: item.id,
        titulo: item.title || "Sem nome",
        valor: deal.value ?? null,
        lead: null,
        item,
        deal,
        contactId,
        conversationId: conversa?.id ?? null,
        // O telefone do card serve mesmo quando nenhuma conversa casou — é ele
        // que o disparo precisa, e perdê-lo tiraria a pessoa da reativação.
        phone: conversa?.phone ?? (item.type === "pessoa" ? item.itemId : null),
        motivo: motivoNormalizado(deal.lossReason),
        etapa: classificar(
          regras,
          sinaisDe(
            deal,
            contactId ? disparos.data?.[contactId] : undefined,
            conversa?.lastMessageAt,
          ),
        ),
      });
    }

    // Os leads do WhatsApp marcados como perdidos pelo card do funil de Leads.
    for (const l of leadsPerdidos.data ?? []) {
      if (!pessoaCasa(busca, { name: l.name, phone: l.fone })) continue;
      const chave = chaveDoTelefone(l.fone);
      if (((chave && publicos[chave]) || "atendimento") !== publico) continue;
      const conversa = chave ? porTelefone.get(chave) : undefined;
      const contactId = conversa?.contactId ?? l.crmContactId;
      lista.push({
        chave: `lead:${l.fone}`,
        titulo: l.name,
        valor: l.valor,
        item: null,
        deal: null,
        lead: l,
        contactId,
        conversationId: conversa?.id ?? l.conversationId,
        phone: conversa?.phone ?? l.fone,
        motivo: motivoNormalizado(l.motivo),
        etapa: classificar(
          regras,
          sinaisDe(
            { lossReason: l.motivo, updatedAt: l.perdidoEm },
            contactId ? disparos.data?.[contactId] : undefined,
            conversa?.lastMessageAt,
          ),
        ),
      });
    }
    return lista;
  }, [
    itens,
    deals,
    conversas,
    busca,
    disparos.data,
    regras,
    publico,
    publicos,
    leadsPerdidos.data,
  ]);

  const etapaPorId = new Map(regras.map((r) => [r.id, r]));

  if (!perdidos.length) {
    return (
      <section className="surface-card mt-4 p-8 text-center">
        <p className="text-sm font-medium text-foreground">Nenhuma negociação perdida</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {busca
            ? "Ninguém com esse nome por aqui."
            : "Quando um lead ou uma negociação for marcado como perdido, ele entra aqui, na etapa do motivo escolhido."}
        </p>
      </section>
    );
  }

  return (
    <div className="mt-4 flex flex-1 flex-col">
      {/* As etapas deste funil são os MOTIVOS da perda. */}
      <div className="custom-scroll flex flex-1 gap-3 overflow-x-auto pb-2">
        {LOSS_REASONS.map((motivo) => {
          const lista = perdidos.filter((p) => p.motivo === motivo);
          // "Não perturbar" nunca ganha botão: quem pediu para não receber, ou
          // não é perfil, não entra em disparo — vale para o motivo, não para
          // um nome de coluna que alguém possa renomear.
          const definitivo = MOTIVOS_DEFINITIVOS.includes(motivo);
          const comContato = lista.filter((p) => p.contactId);
          return (
            <div key={motivo} className="flex w-[280px] shrink-0 flex-col">
              <div className="flex items-center gap-2 px-1 pb-2">
                <h3 className="truncate text-sm font-semibold">{motivo}</h3>
                <span className="ml-auto text-xs font-semibold text-muted-foreground">
                  {lista.length}
                </span>
              </div>

              {!definitivo && comContato.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mb-2 h-8 w-full gap-1.5 text-2xs"
                  onClick={() => abrir(comContato.map(paraContato))}
                >
                  <Send className="h-3 w-3" />
                  Disparar para {comContato.length}
                </Button>
              )}

              <div className="custom-scroll flex-1 space-y-2 overflow-y-auto overflow-x-hidden rounded-2xl bg-surface-subtle p-2">
                {!lista.length ? (
                  <p className="py-6 text-center text-2xs text-muted-foreground">Vazio</p>
                ) : (
                  lista.map((p) => {
                    const pronto = etapaPorId.get(p.etapa);
                    return (
                      <div key={p.chave} className="surface-card px-3 py-2.5">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {p.titulo || "Sem nome"}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {pronto && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-3xs font-semibold text-muted-foreground">
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: pronto.cor }}
                              />
                              {pronto.nome}
                            </span>
                          )}
                          {p.valor ? (
                            <span className="text-3xs text-muted-foreground">
                              {p.valor.toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </span>
                          ) : null}
                        </div>
                        {p.lead?.observacao && (
                          <p className="mt-1.5 line-clamp-2 text-2xs text-muted-foreground">
                            {p.lead.observacao}
                          </p>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 h-7 w-full gap-1.5 text-2xs"
                          onClick={() => (p.item ? onAbrir(p.item) : p.lead && reabrir(p.lead))}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Reabrir
                        </Button>
                      </div>
                    );
                  })
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
