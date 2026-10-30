import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, MessageCircle, Send, Sparkles } from "lucide-react";
import {
  POR_COLUNA,
  getEvidenciasDoLead,
  getFunilDeLeads,
  type LeadNoFunil,
  type ResumoDaColuna,
} from "@/lib/atendimentos/funis.functions";
import type { RegraDeFunil } from "@/lib/atendimentos/funnelRules";
import { formatBRL } from "@/lib/finance/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ContatoSelecionado } from "@/components/atendimentos/contacts/ContactsTab";
import {
  quantosPodemReceber,
  useDisparoDeColuna,
} from "@/components/atendimentos/pipeline/useDisparoDeColuna";

// O quadro de Leads: o funil que se organiza sozinho.
//
// Sem arrastar, como Clientes: a coluna sai do ponto da conversa (lido pela
// Inteligência do Lead) e da agenda. Quem sumiu fica na coluna onde parou,
// escondido até alguém pedir "ver parados" — o valor dele continua somando no
// topo, que é o que diz quanto ficou para trás.

const COR_DA_FAIXA = {
  quente: "bg-success-soft text-success",
  morno: "bg-warning-soft text-warning",
  frio: "bg-surface-subtle text-muted-foreground",
} as const;

function valorCurto(valor: number): string {
  return formatBRL(valor, { compact: true });
}

function paraContato(l: LeadNoFunil): ContatoSelecionado {
  return {
    id: l.crmContactId ?? l.fone,
    name: l.name,
    phone: l.fone,
    origem: "whatsapp",
    patientId: null,
    conversationId: l.conversationId,
  };
}

function Nota({ lead, grande }: { lead: LeadNoFunil; grande?: boolean }) {
  if (lead.nota === null || !lead.faixa) return null;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full font-semibold tabular-nums",
        grande ? "px-3 py-1 text-base" : "px-2 py-0.5 text-2xs",
        COR_DA_FAIXA[lead.faixa],
      )}
      title="Nota do lead, de 0 a 100"
    >
      {lead.nota}
    </span>
  );
}

function Card({ lead, onAbrir }: { lead: LeadNoFunil; onAbrir: () => void }) {
  const detalhe = [
    lead.procedimento,
    lead.valor ? `${lead.valorAPartirDe ? "a partir de " : ""}${formatBRL(lead.valor)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        "press surface-card block w-full px-3 py-2.5 text-left transition-colors hover:border-coral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        lead.parado && "opacity-70",
      )}
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{lead.name}</p>
        <Nota lead={lead} />
      </div>
      {detalhe && <p className="mt-0.5 truncate text-2xs text-muted-foreground">{detalhe}</p>}
      {lead.risco.motivo ? (
        <p
          className={cn(
            "mt-1 flex items-center gap-1.5 truncate text-2xs font-medium",
            lead.risco.nivel === "alto" ? "text-danger" : "text-warning",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              lead.risco.nivel === "alto" ? "bg-danger" : "bg-warning",
            )}
          />
          {lead.risco.motivo}
        </p>
      ) : lead.parado && lead.diasEmSilencio !== null ? (
        <p className="mt-1 truncate text-2xs text-muted-foreground">
          Parado há {lead.diasEmSilencio} dias
        </p>
      ) : null}
    </button>
  );
}

function Coluna({
  regra,
  leads,
  resumo,
  onAbrir,
  onDisparar,
}: {
  regra: RegraDeFunil;
  leads: LeadNoFunil[];
  resumo: ResumoDaColuna | undefined;
  onAbrir: (lead: LeadNoFunil) => void;
  onDisparar: (contatos: ContatoSelecionado[]) => void;
}) {
  const [paginas, setPaginas] = useState(1);
  const visiveis = leads.slice(0, paginas * POR_COLUNA);
  const podemReceber = quantosPodemReceber(leads.map(paraContato));

  return (
    <div className="flex w-[280px] shrink-0 flex-col">
      <div className="flex items-center gap-2 px-1 pb-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: regra.cor }} />
        <h3 className="truncate text-sm font-semibold">{regra.nome}</h3>
        {/* Ativos e o valor de tudo o que está na coluna, parados inclusive:
            é o número que diz quanto está em jogo ali. */}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{resumo?.ativos ?? 0}</span> ativos
          {resumo && resumo.valor > 0 && ` · ${valorCurto(resumo.valor)}`}
        </span>
      </div>

      {podemReceber > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="mb-2 h-8 w-full gap-1.5 text-2xs"
          onClick={() => onDisparar(leads.map(paraContato))}
        >
          <Send className="h-3 w-3" />
          Disparar para {podemReceber}
        </Button>
      )}

      <div className="custom-scroll flex-1 space-y-2 overflow-y-auto overflow-x-hidden rounded-2xl bg-surface-subtle p-2">
        {!leads.length ? (
          <p className="py-6 text-center text-2xs text-muted-foreground">Vazio</p>
        ) : (
          <>
            {visiveis.map((l) => (
              <Card key={l.fone} lead={l} onAbrir={() => onAbrir(l)} />
            ))}
            {visiveis.length < leads.length && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setPaginas((n) => n + 1)}
              >
                Ver mais {Math.min(POR_COLUNA, leads.length - visiveis.length)}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function quando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function Detalhe({ lead, etapa }: { lead: LeadNoFunil; etapa: string | null }) {
  const buscar = useServerFn(getEvidenciasDoLead);
  const provas = useQuery({
    queryKey: ["evidencias-do-lead", lead.fone],
    queryFn: () => buscar({ data: { fone: lead.fone } }),
    staleTime: 60_000,
  });

  return (
    <div className="mt-4 space-y-5">
      <div className="flex items-center gap-3">
        <Nota lead={lead} grande />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{etapa}</p>
          <p className="text-2xs text-muted-foreground">
            {lead.parado && lead.diasEmSilencio !== null
              ? `Parado há ${lead.diasEmSilencio} dias`
              : lead.diasEmSilencio === 0
                ? "Falou hoje"
                : lead.diasEmSilencio !== null
                  ? `Última mensagem há ${lead.diasEmSilencio} dias`
                  : ""}
          </p>
        </div>
      </div>

      {lead.nota === null && (
        <p className="rounded-2xl bg-surface-subtle p-3 text-sm text-muted-foreground">
          Esta conversa ainda não foi lida pela assistente. A coluna vem só da agenda.
        </p>
      )}

      {lead.risco.motivo && (
        <p
          className={cn(
            "rounded-2xl p-3 text-sm font-medium",
            lead.risco.nivel === "alto"
              ? "bg-danger-soft text-danger"
              : "bg-warning-soft text-warning",
          )}
        >
          {lead.risco.motivo}
        </p>
      )}

      {(lead.procedimento || lead.valor) && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-2xs text-muted-foreground">Procedimento</p>
            <p className="text-sm font-medium">{lead.procedimento ?? "—"}</p>
          </div>
          <div>
            <p className="text-2xs text-muted-foreground">
              {lead.valorFonte === "conversa" ? "Valor dito na conversa" : "Valor da tabela"}
            </p>
            <p className="text-sm font-medium">
              {lead.valor
                ? `${lead.valorAPartirDe ? "a partir de " : ""}${formatBRL(lead.valor)}`
                : "—"}
            </p>
          </div>
        </div>
      )}

      {lead.porque && (
        <div>
          <p className="text-2xs text-muted-foreground">Por quê</p>
          <p className="mt-1 text-sm leading-6">{lead.porque}</p>
          {lead.motivos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {lead.motivos.map((m) => (
                <span
                  key={m}
                  className="rounded-full bg-surface-subtle px-2.5 py-1 text-2xs text-muted-foreground"
                >
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {lead.proximaAcao && (
        <div className="flex items-start gap-2 rounded-2xl bg-coral-soft p-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
          <div>
            <p className="text-2xs font-semibold text-coral">Próxima ação</p>
            <p className="text-sm">{lead.proximaAcao}</p>
          </div>
        </div>
      )}

      {!!provas.data?.length && (
        <div>
          <p className="text-2xs text-muted-foreground">O que comprova</p>
          <ul className="mt-2 space-y-2">
            {provas.data.map((p, i) => (
              <li key={i} className="rounded-2xl border border-border p-3">
                <p className="text-2xs font-semibold">{p.fato}</p>
                {p.texto && (
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                    <span className="font-medium">{p.daClinica ? "Clínica" : "Lead"}</span>
                    {p.em ? ` · ${quando(p.em)}` : ""}: “{p.texto}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lead.conversationId && (
        <Button asChild variant="premium" className="w-full gap-2">
          <Link to="/atendimentos/chat" search={{ conversationId: lead.conversationId }}>
            <MessageCircle className="h-4 w-4" />
            Abrir conversa
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      )}
    </div>
  );
}

export function QuadroDeLeads({ busca }: { busca: string }) {
  const { abrir, dialogo } = useDisparoDeColuna();
  const buscarFunil = useServerFn(getFunilDeLeads);
  const [verParados, setVerParados] = useState(false);
  const [aberto, setAberto] = useState<LeadNoFunil | null>(null);

  const funil = useQuery({
    queryKey: ["funil-leads"],
    queryFn: () => buscarFunil(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const { porEtapa, parados } = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const mapa = new Map<string, LeadNoFunil[]>();
    let parados = 0;
    for (const l of funil.data?.leads ?? []) {
      if (termo && !l.name.toLowerCase().includes(termo) && !l.fone.includes(termo)) continue;
      if (l.parado) {
        parados++;
        if (!verParados) continue;
      }
      mapa.set(l.stage, [...(mapa.get(l.stage) ?? []), l]);
    }
    return { porEtapa: mapa, parados };
  }, [funil.data, busca, verParados]);

  if (funil.data?.indisponivel) {
    return (
      <section className="surface-card mt-4 p-5">
        <p className="text-sm font-medium text-foreground">Funil de leads ainda não ativado</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Falta aplicar a migration que cria os sinais que as regras leem.
        </p>
      </section>
    );
  }

  if (funil.isLoading) {
    return <p className="mt-4 text-sm text-muted-foreground">Carregando leads…</p>;
  }

  const colunas = funil.data?.colunas ?? [];
  const etapaAberta = aberto ? (colunas.find((c) => c.id === aberto.stage)?.nome ?? null) : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => setVerParados((v) => !v)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            verParados
              ? "border-foreground bg-foreground text-white"
              : "border-border bg-white text-muted-foreground hover:text-foreground",
          )}
        >
          {verParados ? "Esconder parados" : `Ver parados (${parados})`}
        </button>
      </div>

      <div className="custom-scroll mt-3 flex flex-1 gap-3 overflow-x-auto pb-2">
        {colunas.map((regra) => (
          <Coluna
            key={regra.id}
            regra={regra}
            leads={porEtapa.get(regra.id) ?? []}
            resumo={funil.data?.resumo[regra.id]}
            onAbrir={setAberto}
            onDisparar={abrir}
          />
        ))}
      </div>
      {dialogo}

      <Sheet open={!!aberto} onOpenChange={(open) => !open && setAberto(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="truncate">{aberto?.name}</SheetTitle>
          </SheetHeader>
          {aberto && <Detalhe lead={aberto} etapa={etapaAberta} />}
        </SheetContent>
      </Sheet>
    </>
  );
}
