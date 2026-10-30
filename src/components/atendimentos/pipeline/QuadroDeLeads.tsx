import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Clock, MessageCircle, Send, Sparkles } from "lucide-react";
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

// ── Peças ──────────────────────────────────────────────────────────────────

/** A cor da nota: verde quente, âmbar morno, cinza frio. */
const COR_DA_FAIXA = {
  quente: "var(--success)",
  morno: "var(--warning)",
  frio: "var(--foreground-subtle, #94A3B8)",
} as const;

function valorCurto(valor: number): string {
  return formatBRL(valor, { compact: true });
}

function valorDoLead(l: LeadNoFunil): string | null {
  if (!l.valor) return null;
  return `${l.valorAPartirDe ? "a partir de " : ""}${valorCurto(l.valor)}`;
}

/** "agora", "5h", "3d" — quanto tempo desde a última mensagem. */
function haQuanto(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return "agora";
  if (horas < 24) return `${horas}h`;
  return `${Math.floor(horas / 24)}d`;
}

function iniciais(nome: string): string {
  const partes = nome
    .normalize("NFKD")
    .replace(/[^\p{L}\s]/gu, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return "·";
  const [a, b] = [partes[0], partes.length > 1 ? partes[partes.length - 1] : ""];
  return (a[0] + (b[0] ?? "")).toUpperCase();
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

function Avatar({ nome, cor, grande }: { nome: string; cor: string; grande?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold tracking-tight text-foreground",
        grande ? "h-12 w-12 text-base" : "h-8 w-8 text-2xs",
      )}
      style={{ background: `color-mix(in srgb, ${cor} 16%, transparent)` }}
    >
      {iniciais(nome)}
    </span>
  );
}

/**
 * A nota como um anel: o número no meio e o arco dizendo quanto falta para
 * 100. Bate o olho e entende, sem precisar de rótulo em cada card.
 */
function AnelDoScore({ lead, tamanho = 34 }: { lead: LeadNoFunil; tamanho?: number }) {
  if (lead.nota === null || !lead.faixa) return null;
  const traco = tamanho >= 56 ? 5 : 3;
  const raio = (tamanho - traco) / 2;
  const volta = 2 * Math.PI * raio;
  const grande = tamanho >= 56;
  return (
    <span
      className="relative grid shrink-0 place-items-center"
      style={{ width: tamanho, height: tamanho }}
      title={`Score ${lead.nota} de 100`}
    >
      <svg width={tamanho} height={tamanho} className="-rotate-90">
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          stroke="var(--border)"
          strokeWidth={traco}
        />
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          stroke={COR_DA_FAIXA[lead.faixa]}
          strokeWidth={traco}
          strokeLinecap="round"
          strokeDasharray={volta}
          strokeDashoffset={volta * (1 - lead.nota / 100)}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center leading-none">
        <span
          className={cn(
            "font-semibold tabular-nums tracking-tight",
            grande ? "text-lg" : "text-2xs",
          )}
        >
          {lead.nota}
        </span>
      </span>
    </span>
  );
}

function Sinal({ lead }: { lead: LeadNoFunil }) {
  if (lead.risco.curto) {
    const alto = lead.risco.nivel === "alto";
    return (
      <span
        className={cn(
          "inline-flex min-w-0 items-center gap-1 truncate rounded-full px-2 py-0.5 text-3xs font-medium",
          alto ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
        )}
        title={lead.risco.motivo ?? undefined}
      >
        <span
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", alto ? "bg-danger" : "bg-warning")}
        />
        <span className="truncate">{lead.risco.curto}</span>
      </span>
    );
  }
  const ha = haQuanto(lead.ultimaMensagem);
  if (!ha) return null;
  return (
    <span className="inline-flex items-center gap-1 text-3xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      {ha}
    </span>
  );
}

/**
 * O card: quem é, quanto vale, quão quente está e se pede atenção.
 *
 * Inspirado nos cards de negócio dos CRMs de venda (Pipedrive, Attio): o
 * nome e o valor são o que se lê primeiro; o score fica no anel à direita;
 * embaixo, um sinal só — o alerta, se houver, ou há quanto tempo falou.
 */
function Card({ lead, cor, onAbrir }: { lead: LeadNoFunil; cor: string; onAbrir: () => void }) {
  const valor = valorDoLead(lead);
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        "press block w-full rounded-2xl border border-border/70 bg-card p-3 text-left shadow-1 transition-[box-shadow,border-color] hover:border-border hover:shadow-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        lead.parado && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2.5">
        <Avatar nome={lead.name} cor={cor} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold tracking-tight text-foreground">
            {lead.name}
          </p>
          <p className="truncate text-2xs text-muted-foreground">
            {lead.procedimento ?? (lead.nota === null ? "Ainda não lido" : "Sem procedimento")}
          </p>
        </div>
        <AnelDoScore lead={lead} />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
        <span
          className={cn(
            "shrink-0 text-[13px] font-semibold tabular-nums tracking-tight",
            valor ? "text-foreground" : "text-muted-foreground/60",
          )}
        >
          {valor ?? "R$ —"}
        </span>
        <Sinal lead={lead} />
      </div>
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
    <div className="flex min-h-0 w-[280px] shrink-0 flex-col">
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

      <div className="custom-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden rounded-2xl bg-surface-subtle p-2">
        {!leads.length ? (
          <p className="py-6 text-center text-2xs text-muted-foreground">Vazio</p>
        ) : (
          <>
            {visiveis.map((l) => (
              <Card key={l.fone} lead={l} cor={regra.cor} onAbrir={() => onAbrir(l)} />
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

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-1 px-2 py-3 text-center">
      {children}
      <span className="text-3xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {rotulo}
      </span>
    </div>
  );
}

/**
 * O painel do lead. Primeiro o que se entende batendo o olho (score, valor,
 * quando falou, o alerta e a próxima ação); a leitura completa e as provas
 * ficam um toque abaixo, para quem quer conferir.
 */
function Detalhe({ lead, etapa }: { lead: LeadNoFunil; etapa: RegraDeFunil | null }) {
  const [aberto, setAberto] = useState(false);
  const buscar = useServerFn(getEvidenciasDoLead);
  const provas = useQuery({
    queryKey: ["evidencias-do-lead", lead.fone],
    queryFn: () => buscar({ data: { fone: lead.fone } }),
    staleTime: 60_000,
    enabled: aberto,
  });
  const cor = etapa?.cor ?? "#94A3B8";
  const valor = lead.valor
    ? `${lead.valorAPartirDe ? "a partir de " : ""}${formatBRL(lead.valor)}`
    : null;
  const ha = haQuanto(lead.ultimaMensagem);

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-5 px-6 pb-6 pt-8">
        {/* Quem é */}
        <div className="flex items-center gap-3.5">
          <Avatar nome={lead.name} cor={cor} grande />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-[-0.01em]">{lead.name}</h2>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />
              <span className="truncate">{etapa?.nome}</span>
              {lead.procedimento && (
                <>
                  <span>·</span>
                  <span className="truncate">{lead.procedimento}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* O que se lê de relance */}
        <div className="grid grid-cols-3 divide-x divide-border rounded-2xl bg-surface-subtle">
          <Dado rotulo="Score">
            {lead.nota === null ? (
              <span className="text-lg font-semibold text-muted-foreground/60">—</span>
            ) : (
              <AnelDoScore lead={lead} tamanho={56} />
            )}
          </Dado>
          <Dado rotulo={lead.valorFonte === "tabela" ? "Valor · tabela" : "Valor"}>
            <span
              className={cn(
                "max-w-full truncate text-lg font-semibold tabular-nums tracking-tight",
                !valor && "text-muted-foreground/60",
              )}
            >
              {valor ?? "—"}
            </span>
          </Dado>
          <Dado rotulo="Última msg">
            <span className="text-lg font-semibold tabular-nums tracking-tight">{ha ?? "—"}</span>
          </Dado>
        </div>

        {lead.risco.motivo && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-medium",
              lead.risco.nivel === "alto"
                ? "bg-danger-soft text-danger"
                : "bg-warning-soft text-warning",
            )}
          >
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                lead.risco.nivel === "alto" ? "bg-danger" : "bg-warning",
              )}
            />
            {lead.risco.motivo}
          </div>
        )}

        {lead.proximaAcao && (
          <div className="rounded-2xl border border-border p-4">
            <p className="flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-[0.06em] text-coral">
              <Sparkles className="h-3.5 w-3.5" />
              Próxima ação
            </p>
            <p className="mt-1.5 text-[15px] font-medium leading-snug tracking-tight">
              {lead.proximaAcao}
            </p>
          </div>
        )}

        {lead.motivos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
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

        {lead.nota === null && (
          <p className="text-sm text-muted-foreground">
            A conversa ainda não foi lida. A etapa vem só da agenda por enquanto.
          </p>
        )}

        {/* A leitura completa, para quem quer conferir */}
        {(lead.porque || lead.nota !== null) && (
          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              className="flex w-full items-center justify-between py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              aria-expanded={aberto}
            >
              Por que este score
              <ChevronDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} />
            </button>
            {aberto && (
              <div className="mt-2 space-y-3">
                {lead.porque && (
                  <p className="text-sm leading-6 text-muted-foreground">{lead.porque}</p>
                )}
                {provas.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
                {!!provas.data?.length && (
                  <ul className="space-y-2.5">
                    {provas.data.map((p, i) => (
                      <li key={i} className="border-l-2 border-border pl-3">
                        <p className="text-xs font-medium">{p.fato}</p>
                        {p.texto && (
                          <p className="mt-0.5 line-clamp-2 text-2xs text-muted-foreground">
                            {p.daClinica ? "Clínica" : "Lead"}
                            {p.em ? ` · ${quando(p.em)}` : ""} — “{p.texto}”
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {lead.conversationId && (
        <div className="sticky bottom-0 border-t border-border/60 bg-card/80 px-6 py-4 backdrop-blur-xl">
          <Button asChild variant="premium" className="h-11 w-full gap-2 rounded-2xl">
            <Link to="/atendimentos/chat" search={{ conversationId: lead.conversationId }}>
              <MessageCircle className="h-4 w-4" />
              Abrir conversa
            </Link>
          </Button>
        </div>
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
  const etapaAberta = aberto ? (colunas.find((c) => c.id === aberto.stage) ?? null) : null;

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

      <div className="custom-scroll mt-3 flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
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
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[420px]">
          {/* O título fica para leitores de tela; o visível é o cabeçalho do painel. */}
          <SheetHeader className="sr-only">
            <SheetTitle>{aberto?.name}</SheetTitle>
          </SheetHeader>
          {aberto && <Detalhe key={aberto.fone} lead={aberto} etapa={etapaAberta} />}
        </SheetContent>
      </Sheet>
    </>
  );
}
