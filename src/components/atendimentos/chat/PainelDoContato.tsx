import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  CircleDollarSign,
  Loader2,
  Megaphone,
  Stethoscope,
  StickyNote,
  Tag as TagIcon,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FotoDoContato } from "@/components/atendimentos/chat/FotoDoContato";
import { SeletorDeTags } from "@/components/tags/SeletorDeTags";
import { CardDoPainel, LinhaDoPainel, NumeroDoPainel } from "./CardDoPainel";
import { useUnitSelection } from "@/lib/settings/unit-context";
import { formatBRL } from "@/lib/finance/format";
import { formatWhatsappNumber } from "@/lib/atendimentos/phone";
import { montarPainel } from "@/lib/atendimentos/painelDoContato";
import {
  createPatient,
  getPatientByCrmContact,
  getPatientDetail,
} from "@/lib/patients/patients.functions";
import { getProntuario } from "@/lib/patients/clinical-record.functions";
import { getRecentRecipients } from "@/lib/atendimentos/broadcast.functions";
import { addDealNote, getDealTimeline } from "@/lib/atendimentos/deals.functions";
import type { ConversationRow } from "@/lib/atendimentos/atendimentos.functions";
import { cn } from "@/lib/utils";

/**
 * O perfil de quem está do outro lado da conversa.
 *
 * ── O que ele resolve ────────────────────────────────────────────────────
 *
 * Quem atende via só nome, telefone e etapa, tudo espremido no cabeçalho. Para
 * saber se a pessoa tem consulta marcada, se deve alguma coisa ou se é alérgica
 * a algo, era preciso sair da conversa, ir em Pacientes e procurar. O
 * `ConversaDoPaciente` já tinha resolvido a direção contrária — trouxe o chat
 * para dentro da ficha; faltava o caminho de volta.
 *
 * ── Um paciente rende muito mais painel do que um lead ───────────────────
 *
 * E isso é a coisa certa. `montarPainel` decide o que existe; aqui só se
 * desenha. Seção sem conteúdo não é renderizada: na referência que originou
 * este painel metade das seções fica vazia com um "+" ao lado, e cada uma custa
 * uma linha de altura em toda conversa.
 *
 * ── Nenhuma consulta nova ────────────────────────────────────────────────
 *
 * `getPatientDetail` já devolve ficha, agenda, tratamento e financeiro numa
 * chamada; `getRecentRecipients` já sabe se o contato está na fila de um
 * disparo; as notas são as MESMAS que o `DealDetailSheet` do funil mostra,
 * porque `addDealNote` aceita a chave da conversa (`conv:<id>`) igual à do card.
 */
export function PainelDoContato({
  conversa,
  chaveDoDesfecho,
  onFechar,
  className,
}: {
  conversa: ConversationRow;
  /** Chave da negociação — card do funil, ou `conv:<id>`. `null` = sem chave,
   *  e aí não há onde pendurar nota. */
  chaveDoDesfecho: string | null;
  onFechar?: () => void;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const buscarPaciente = useServerFn(getPatientByCrmContact);
  const buscarFicha = useServerFn(getPatientDetail);
  const buscarProntuario = useServerFn(getProntuario);
  const buscarCampanhas = useServerFn(getRecentRecipients);
  const buscarNotas = useServerFn(getDealTimeline);
  const criarPaciente = useServerFn(createPatient);
  const escreverNota = useServerFn(addDealNote);
  const { selectedUnitId } = useUnitSelection();

  const contactId = conversa.contactId;
  const nome = conversa.contactName ?? conversa.phone ?? "Contato";

  const vinculo = useQuery({
    queryKey: ["patient-by-crm-contact", contactId],
    queryFn: () => buscarPaciente({ data: { crmContactId: contactId! } }),
    enabled: Boolean(contactId),
    staleTime: 60_000,
  });
  const patientId = vinculo.data?.id ?? null;

  const ficha = useQuery({
    queryKey: ["patient-detail", patientId],
    queryFn: () => buscarFicha({ data: { patientId: patientId! } }),
    enabled: Boolean(patientId),
    staleTime: 30_000,
  });

  // Só depois de saber que é paciente: é a consulta mais pesada do painel e a
  // que menos gente abre.
  const prontuario = useQuery({
    queryKey: ["prontuario", patientId],
    queryFn: () => buscarProntuario({ data: { patientId: patientId! } }),
    enabled: Boolean(patientId),
    staleTime: 60_000,
  });

  const campanhas = useQuery({
    queryKey: ["broadcast-recent-recipients"],
    queryFn: () => buscarCampanhas(),
    staleTime: 60_000,
  });

  const notas = useQuery({
    queryKey: ["deal-timeline", chaveDoDesfecho],
    queryFn: () => buscarNotas({ data: { itemId: chaveDoDesfecho! } }),
    enabled: Boolean(chaveDoDesfecho),
    staleTime: 15_000,
  });

  const [rascunho, setRascunho] = useState("");

  const salvarNota = useMutation({
    mutationFn: () => escreverNota({ data: { itemId: chaveDoDesfecho!, body: rascunho } }),
    onSuccess: () => {
      setRascunho("");
      queryClient.invalidateQueries({ queryKey: ["deal-timeline", chaveDoDesfecho] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Idempotente por `crm_contact_id`: a mesma composição que a Agenda usa em
  // `useSaveAppointment`, então clicar duas vezes reencontra em vez de duplicar.
  const criarFicha = useMutation({
    mutationFn: () =>
      criarPaciente({
        data: {
          name: nome,
          phone: conversa.phone ? formatWhatsappNumber(conversa.phone) : undefined,
          crmContactId: contactId ?? undefined,
          unitId: selectedUnitId ?? undefined,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-by-crm-contact", contactId] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Ficha criada — o painel já mostra o paciente.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const painel = montarPainel({
    contato: { nome: conversa.contactName, telefone: conversa.phone },
    paciente: ficha.data ?? null,
    prontuario: prontuario.data ?? null,
    campanha: contactId
      ? ((campanhas.data ?? []).find((r) => r.contactId === contactId) ?? null)
      : null,
  });

  const carregando = vinculo.isPending || (Boolean(patientId) && ficha.isPending);
  const observacoes = (notas.data ?? []).filter((e) => e.kind === "note").slice(0, 3);

  return (
    <div className={cn("flex min-h-0 flex-col bg-surface", className)}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-white/70 px-5 py-4">
        <h2 className="text-base font-semibold">Perfil</h2>
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            className="press grid h-8 w-8 place-items-center rounded-xl text-muted-foreground hover:bg-muted"
            aria-label="Fechar painel"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </header>

      <div className="custom-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {/* ── Atraso ────────────────────────────────────────────────────────
            Uma faixa, não um card: é a única informação do painel que muda o
            que se escreve na frase seguinte, e precisa ser lida sem rolar.
            A alergia, que é contexto clínico, fica lá embaixo no prontuário. */}
        {painel.atraso !== null && (
          <p className="flex items-center gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span>
              <strong>{formatBRL(painel.atraso)}</strong> em atraso
            </span>
          </p>
        )}

        {/* ── Identidade ──────────────────────────────────────────────────── */}
        <section className="surface-card p-5">
          <div className="flex items-center gap-3.5">
            <FotoDoContato
              nome={nome}
              url={conversa.avatarUrl}
              className="h-14 w-14 shrink-0 bg-coral-soft text-coral"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{nome}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {painel.ehPaciente ? "Paciente da clínica" : "Contato do WhatsApp"}
              </p>
            </div>
          </div>

          {painel.ehPaciente && patientId ? (
            <Button asChild variant="outline" size="sm" className="mt-4 w-full">
              <Link to="/pacientes/$patientId" params={{ patientId }}>
                <UserRound className="h-4 w-4" /> Ver ficha completa
              </Link>
            </Button>
          ) : (
            contactId && (
              <>
                <Button
                  variant="premium"
                  size="sm"
                  className="mt-4 w-full"
                  disabled={criarFicha.isPending}
                  onClick={() => criarFicha.mutate()}
                >
                  {criarFicha.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Criar ficha de paciente
                </Button>
                <p className="mt-2 text-2xs leading-4 text-muted-foreground">
                  Liga esta conversa a um cadastro — é o que abre agenda, prontuário e financeiro
                  para esta pessoa.
                </p>
              </>
            )
          )}
        </section>

        {carregando && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* ── Dados ────────────────────────────────────────────────────────── */}
        <CardDoPainel icone={UserRound} titulo="Dados">
          <div className="divide-y divide-border">
            {painel.dados.map((d) => (
              <LinhaDoPainel key={d.rotulo} rotulo={d.rotulo} valor={d.valor} />
            ))}
          </div>
        </CardDoPainel>

        {/* ── Agenda ───────────────────────────────────────────────────────── */}
        {painel.agenda && (
          <CardDoPainel icone={CalendarDays} titulo="Agenda">
            {!painel.agenda.proxima && !painel.agenda.ultima ? (
              <p className="text-sm text-muted-foreground">Nenhuma consulta registrada.</p>
            ) : (
              <div className="grid gap-3">
                {painel.agenda.proxima && (
                  <Consulta rotulo="Próxima" c={painel.agenda.proxima} destaque />
                )}
                {painel.agenda.ultima && <Consulta rotulo="Última" c={painel.agenda.ultima} />}
              </div>
            )}
          </CardDoPainel>
        )}

        {/* ── Tratamento ───────────────────────────────────────────────────── */}
        {painel.tratamento && (
          <CardDoPainel icone={Stethoscope} titulo="Tratamento">
            <p className="text-sm font-medium">{painel.tratamento.nome}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {painel.tratamento.feitas} de {painel.tratamento.total} sessões
            </p>
            <div
              className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={painel.tratamento.feitas}
              aria-valuemin={0}
              aria-valuemax={painel.tratamento.total}
              aria-label="Sessões concluídas"
            >
              <div
                className="h-full rounded-full bg-gradient-primary"
                style={{
                  width: `${(painel.tratamento.feitas / painel.tratamento.total) * 100}%`,
                }}
              />
            </div>
          </CardDoPainel>
        )}

        {/* ── Financeiro ───────────────────────────────────────────────────── */}
        {painel.financeiro && (
          <CardDoPainel icone={CircleDollarSign} titulo="Financeiro">
            <div className="grid grid-cols-3 gap-3">
              <NumeroDoPainel
                rotulo="Em atraso"
                valor={
                  painel.financeiro.atraso === null ? null : formatBRL(painel.financeiro.atraso)
                }
                tom="atraso"
              />
              <NumeroDoPainel
                rotulo="A receber"
                valor={
                  painel.financeiro.aReceber === null ? null : formatBRL(painel.financeiro.aReceber)
                }
              />
              <NumeroDoPainel
                rotulo="Já pago"
                valor={painel.financeiro.pago === null ? null : formatBRL(painel.financeiro.pago)}
              />
            </div>
          </CardDoPainel>
        )}

        {/* ── Tags ─────────────────────────────────────────────────────────── */}
        <CardDoPainel icone={TagIcon} titulo="Tags">
          <SeletorDeTags
            alvo={patientId ? { patientId } : { crmContactId: contactId ?? null }}
            vazio="Adicionar tag"
          />
        </CardDoPainel>

        {/* ── Campanhas ────────────────────────────────────────────────────── */}
        {painel.campanha && (
          <CardDoPainel icone={Megaphone} titulo="Campanhas">
            <p className="text-sm">
              {painel.campanha.naFila ? (
                <>
                  Na fila para receber um disparo em{" "}
                  <strong>{quando(painel.campanha.quando)}</strong>.
                </>
              ) : (
                <>
                  Recebeu um disparo em <strong>{quando(painel.campanha.quando)}</strong>.
                </>
              )}
            </p>
          </CardDoPainel>
        )}

        {/* ── Notas ────────────────────────────────────────────────────────
            As MESMAS do funil: `addDealNote` aceita a chave da conversa igual
            à do card, então quem escreve aqui e quem abre o card do funil leem
            a mesma coisa. Duas listas de observação da mesma pessoa seria pior
            que nenhuma. */}
        {chaveDoDesfecho && (
          <CardDoPainel icone={StickyNote} titulo="Notas">
            {observacoes.length > 0 && (
              <ul className="mb-3 grid gap-2">
                {observacoes.map((n) => (
                  <li key={n.id} className="rounded-xl bg-muted/60 px-3.5 py-2.5">
                    <p className="whitespace-pre-wrap text-sm leading-5">{n.body}</p>
                    <p className="mt-1 text-2xs text-muted-foreground">{quando(n.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
            <Textarea
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              rows={2}
              className="resize-none bg-white"
              placeholder="Anotar algo sobre esta pessoa"
            />
            <div className="mt-2 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={!rascunho.trim() || salvarNota.isPending}
                onClick={() => salvarNota.mutate()}
              >
                {salvarNota.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Salvar nota
              </Button>
            </div>
          </CardDoPainel>
        )}

        {/* ── Prontuário ───────────────────────────────────────────────────── */}
        {painel.prontuario && (
          <CardDoPainel
            icone={Stethoscope}
            titulo="Prontuário"
            acao={
              patientId && (
                <Link
                  to="/pacientes/$patientId"
                  params={{ patientId }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Abrir
                </Link>
              )
            }
          >
            {painel.prontuario.alergias && (
              <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                <span className="text-foreground">{painel.prontuario.alergias}</span>
              </p>
            )}
            {painel.prontuario.ultimaEvolucao && (
              <div className={cn(painel.prontuario.alergias && "mt-3")}>
                <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                  Última evolução
                </p>
                <p className="mt-1 text-sm leading-5">{painel.prontuario.ultimaEvolucao.texto}</p>
                <p className="mt-1 text-2xs text-muted-foreground">
                  {quando(painel.prontuario.ultimaEvolucao.quando)}
                  {painel.prontuario.ultimaEvolucao.profissional &&
                    ` · ${painel.prontuario.ultimaEvolucao.profissional}`}
                </p>
              </div>
            )}
          </CardDoPainel>
        )}
      </div>
    </div>
  );
}

function Consulta({
  rotulo,
  c,
  destaque,
}: {
  rotulo: string;
  c: { date: string; time: string; procedure: string; professional: string };
  destaque?: boolean;
}) {
  return (
    <div className={cn("rounded-2xl px-4 py-3", destaque ? "bg-coral-soft" : "bg-muted/60")}>
      <p className={cn("text-2xs", destaque ? "text-coral" : "text-muted-foreground")}>{rotulo}</p>
      <p className="mt-0.5 text-sm font-semibold">
        {dia(c.date)} · {c.time}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {c.procedure}
        {c.professional && ` · ${c.professional}`}
      </p>
    </div>
  );
}

function dia(iso: string): string {
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
}

function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
