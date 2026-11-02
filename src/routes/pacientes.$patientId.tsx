import { useState } from "react";
import { getConfigDoConsultorio } from "@/lib/settings/consultorio.functions";
import { z } from "zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  ReceiptText,
  Sparkles,
  Stethoscope,
  UserRound,
  WalletCards,
} from "lucide-react";
import { SeletorDeTags } from "@/components/tags/SeletorDeTags";
import { Sidebar } from "@/components/finance/Sidebar";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { PatientFormSheet } from "@/components/patients/PatientFormSheet";
import { ConversaDoPaciente } from "@/components/patients/ConversaDoPaciente";
import { Prontuario } from "@/components/patients/Prontuario";
import { Tratamentos } from "@/components/patients/Tratamentos";
import { OdontogramaDoPaciente } from "@/components/patients/OdontogramaDoPaciente";
import { ArquivosDoPaciente } from "@/components/patients/ArquivosDoPaciente";
import { NosClub } from "@/components/patients/NosClub";
import { FotoDoRosto } from "@/components/patients/FotoDoRosto";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import { localDateStr } from "@/lib/date";
import { useUnitSelection } from "@/lib/settings/unit-context";
import {
  getPatientDetail,
  type CareEvent,
  type PatientDetail,
} from "@/lib/patients/patients.functions";
import { getConversations } from "@/lib/atendimentos/atendimentos.functions";
import { chaveDoTelefone } from "@/lib/atendimentos/funil";

// A aba vive na URL, não em estado local.
//
// Estava em `useState`: recarregar a página voltava para "Resumo", e não havia
// como mandar a alguém o link do financeiro de um paciente. `validateSearch`
// com zod é o mesmo padrão da lista de pacientes e do resto das rotas.
const searchSchema = z.object({
  aba: z.enum(["resumo", "clinico", "financeiro", "club", "arquivos"]).default("resumo"),
});

type DetailFetcher = (args: { data: { patientId: string } }) => Promise<PatientDetail>;

const detailQuery = (fetcher: DetailFetcher, patientId: string) =>
  queryOptions({
    queryKey: ["patient-detail", patientId],
    queryFn: () => fetcher({ data: { patientId } }),
    staleTime: 15_000,
  });

export const Route = createFileRoute("/pacientes/$patientId")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Paciente · NÓS Conecta" },
      { name: "description", content: "Histórico, agenda e financeiro do paciente." },
    ],
  }),
  // No SSR loader: getPatientDetail requires auth not available during prerender.
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar este paciente"
      description="Houve uma falha ao buscar os dados do paciente. Tente novamente em instantes."
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState
      title="Paciente não encontrado"
      description="Este cadastro pode ter sido removido ou o endereço está incorreto."
      notFound
    />
  ),
  component: PatientDetailPage,
});

function PatientDetailPage() {
  const { patientId } = Route.useParams();
  const navigate = useNavigate();
  // A aba do Club só existe onde o Club está ligado (hoje, só na NÓS).
  const { recursos } = useUnitSelection();
  const temClub = recursos?.club !== false;
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getPatientDetail);
  const { data: patient, isLoading } = useQuery(
    detailQuery(fetchDetail as unknown as DetailFetcher, patientId),
  );
  const { aba } = Route.useSearch();
  const irParaAba = (nova: typeof aba) =>
    navigate({ to: ".", params: { patientId }, search: { aba: nova }, replace: true });
  const [editOpen, setEditOpen] = useState(false);

  // A conversa desta pessoa no sistema, para o botão abrir o chat daqui em
  // vez do WhatsApp do celular. Mesma consulta e mesma chave do cartão
  // "Conversa" do Resumo, então não busca duas vezes. Casa pelo contato
  // vinculado e, sem vínculo, pelo telefone.
  const buscarConversas = useServerFn(getConversations);
  const conversas = useQuery({
    queryKey: ["conversations"],
    queryFn: () => buscarConversas({}),
    staleTime: 30_000,
    enabled: !!patient,
  });
  const conversaDoPaciente = (() => {
    if (!patient) return null;
    const lista = conversas.data ?? [];
    const porContato = patient.crmContactId
      ? lista.find((c) => c.contactId === patient.crmContactId)
      : null;
    if (porContato) return porContato;
    const chave = chaveDoTelefone(patient.phone);
    return chave ? (lista.find((c) => chaveDoTelefone(c.phone) === chave) ?? null) : null;
  })();

  if (!patient) {
    return (
      <div className="min-h-dvh grid place-items-center text-muted-foreground text-sm">
        {isLoading ? "Carregando paciente…" : "Paciente não encontrado."}
      </div>
    );
  }
  const whatsapp = patient.phone?.replace(/\D/g, "");

  const schedule = () =>
    navigate({
      to: "/agenda",
      search: { patientId: patient.id, patientName: patient.name, newAppointment: true },
    });
  const receive = () =>
    navigate({
      to: "/recebimentos",
      search: { status: "all", patient: patient.id, newReceivable: true },
    });

  const statusDoPaciente =
    patient.status === "delinquent"
      ? { texto: "Inadimplente", classe: "bg-danger-soft text-danger" }
      : patient.status === "return_pending"
        ? { texto: "Retorno pendente", classe: "bg-warning-soft text-warning" }
        : patient.status === "inactive"
          ? { texto: "Inativo", classe: "bg-surface-subtle text-muted-foreground" }
          : patient.status === "in_treatment"
            ? { texto: "Em tratamento", classe: "bg-success-soft text-success" }
            : { texto: "Ativo", classe: "bg-success-soft text-success" };

  return (
    <div className="min-h-dvh app-bg lg:flex">
      <Sidebar />
      {/* Largura máxima de propósito: em Full HD a ficha se esticava por dois
          mil pixels, com três botões gigantes e abas a meio metro uma da
          outra. Uma coluna de leitura é mais fácil de bater o olho. */}
      <main className="mx-auto w-full max-w-[1120px] px-4 pb-nav pt-5 sm:px-6 lg:px-10 lg:pb-10 lg:pt-8">
        <header className="flex items-center gap-3">
          <Link
            to="/pacientes"
            search={{ status: "all" }}
            aria-label="Voltar para pacientes"
            className="press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border/70 bg-card text-foreground shadow-1 transition-colors hover:bg-surface-subtle"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <span className="text-sm font-medium text-muted-foreground">Pacientes</span>
        </header>

        {/* ── Quem é ─────────────────────────────────────────────────── */}
        <section className="mt-5 rounded-3xl border border-border/70 bg-card p-5 shadow-1 sm:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-5">
              <FotoDoRosto patientId={patient.id} iniciais={patient.initials} nome={patient.name} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <h1 className="truncate text-2xl font-semibold tracking-[-0.015em] lg:text-[28px]">
                    {patient.name}
                  </h1>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-2xs font-semibold",
                      statusDoPaciente.classe,
                    )}
                  >
                    {statusDoPaciente.texto}
                  </span>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                  {patient.age ? <span>{patient.age} anos</span> : null}
                  {patient.phone ? (
                    <>
                      {patient.age ? <span aria-hidden>·</span> : null}
                      <span className="tabular-nums">{patient.phone}</span>
                    </>
                  ) : null}
                  {patient.legacyPatientId ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>Nº {patient.legacyPatientId}</span>
                    </>
                  ) : null}
                  {!patient.age && !patient.phone && !patient.legacyPatientId ? (
                    <span>Sem idade nem telefone cadastrados</span>
                  ) : null}
                </p>
                {/* Alertas junto da identificação: alergia e atraso são a
                    primeira coisa a saber de quem acabou de entrar na sala. */}
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {patient.allergyNotes && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-2xs font-medium text-warning">
                      <AlertTriangle className="h-3 w-3" />
                      {patient.allergyNotes}
                    </span>
                  )}
                  {patient.overdueAmount > 0 && (
                    <button
                      type="button"
                      onClick={receive}
                      className="press inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-2xs font-medium text-danger"
                    >
                      {formatBRL(patient.overdueAmount)} em atraso
                    </button>
                  )}
                  <SeletorDeTags alvo={{ patientId: patient.id }} vazio="Adicionar tag" compacto />
                </div>
              </div>
            </div>

            {/* As ações cabem numa linha: eram três botões de 72px de altura
                esticados pela tela inteira. */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
              <Button variant="premium" className="h-10 gap-2 rounded-full px-4" onClick={schedule}>
                <CalendarDays className="h-4 w-4" />
                Agendar
              </Button>
              {conversaDoPaciente ? (
                <Button asChild variant="outline" className="h-10 gap-2 rounded-full px-4">
                  <Link to="/atendimentos/chat" search={{ conversationId: conversaDoPaciente.id }}>
                    <MessageCircle className="h-4 w-4" />
                    Conversa
                  </Link>
                </Button>
              ) : whatsapp ? (
                // Sem conversa no sistema ainda: o WhatsApp do celular é o
                // único jeito de começar uma.
                <Button asChild variant="outline" className="h-10 gap-2 rounded-full px-4">
                  <a
                    href={`https://wa.me/${whatsapp.startsWith("55") ? whatsapp : `55${whatsapp}`}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Conversa
                  </a>
                </Button>
              ) : null}
              <Button variant="outline" className="h-10 gap-2 rounded-full px-4" onClick={receive}>
                <CircleDollarSign className="h-4 w-4" />
                Receber
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full"
                aria-label="Editar paciente"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        {/* Abas como um controle segmentado, do tamanho do que têm dentro. */}
        <nav
          className="custom-scroll mt-5 flex w-full gap-1 overflow-x-auto rounded-full border border-border/70 bg-card p-1 shadow-1 sm:w-fit"
          aria-label="Seções do paciente"
        >
          <TabButton label="Resumo" active={aba === "resumo"} onClick={() => irParaAba("resumo")} />
          <TabButton
            label="Clínico"
            active={aba === "clinico"}
            onClick={() => irParaAba("clinico")}
          />
          <TabButton
            label="Financeiro"
            active={aba === "financeiro"}
            onClick={() => irParaAba("financeiro")}
          />
          {temClub && (
            <TabButton label="Club" active={aba === "club"} onClick={() => irParaAba("club")} />
          )}
          <TabButton
            label="Arquivos"
            active={aba === "arquivos"}
            onClick={() => irParaAba("arquivos")}
          />
        </nav>

        {aba === "resumo" && (
          <Overview patient={patient} onSchedule={schedule} onReceive={receive} />
        )}
        {aba === "clinico" && <Clinico patient={patient} />}
        {aba === "financeiro" && <Finance patient={patient} onReceive={receive} />}
        {aba === "club" && temClub && <NosClub patientId={patient.id} />}
        {aba === "arquivos" && <ArquivosDoPaciente patientId={patient.id} />}
      </main>

      <PatientFormSheet
        open={editOpen}
        patient={patient}
        onOpenChange={setEditOpen}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["patient-detail", patient.id] });
          queryClient.invalidateQueries({ queryKey: ["patients"] });
        }}
      />
    </div>
  );
}

/** Um número de relance, no mesmo molde dos do Agente de IA. */
function Tile({
  rotulo,
  children,
  rodape,
  onClick,
}: {
  rotulo: string;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-border/70 bg-card p-4 text-left shadow-1",
        onClick && "press transition-shadow hover:shadow-2",
      )}
    >
      <span className="text-3xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {rotulo}
      </span>
      <span className="mt-1.5 min-w-0">{children}</span>
      {rodape && <span className="mt-auto pt-2">{rodape}</span>}
    </Tag>
  );
}

function Overview({
  patient,
  onSchedule,
  onReceive,
}: {
  patient: PatientDetail;
  onSchedule: () => void;
  onReceive: () => void;
}) {
  const progress =
    patient.totalSessions > 0
      ? Math.min(100, Math.round((patient.completedSessions / patient.totalSessions) * 100))
      : 0;
  const proximo = patient.nextAppointment;
  return (
    <div className="mt-5 space-y-5">
      {/* O que se quer saber antes de abrir qualquer coisa: quando volta, em
          que pé está o tratamento e se deve. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile rotulo="Próxima consulta" onClick={proximo ? undefined : onSchedule}>
          {proximo ? (
            <>
              <span className="block text-lg font-semibold tracking-tight text-pink">
                {proximo.date === localDateStr() ? "Hoje" : formatDate(proximo.date)} ·{" "}
                {proximo.time}
              </span>
              <span className="block truncate text-2xs text-muted-foreground">
                {proximo.procedure}
                {proximo.professional ? ` · ${proximo.professional}` : ""}
              </span>
            </>
          ) : (
            <>
              <span className="block text-lg font-semibold tracking-tight text-muted-foreground">
                Nenhuma
              </span>
              <span className="block text-2xs text-pink">Agendar agora</span>
            </>
          )}
        </Tile>
        <Tile
          rotulo="Tratamento"
          rodape={
            patient.totalSessions > 0 ? (
              <span className="block h-1 overflow-hidden rounded-full bg-surface-subtle">
                <span
                  className="block h-full rounded-full bg-gradient-primary"
                  style={{ width: `${progress}%` }}
                />
              </span>
            ) : null
          }
        >
          <span className="block truncate text-lg font-semibold tracking-tight">
            {patient.treatmentName ?? <span className="text-muted-foreground">Sem tratamento</span>}
          </span>
          {patient.totalSessions > 0 && (
            <span className="block text-2xs text-muted-foreground">
              {patient.completedSessions} de {patient.totalSessions} sessões · {progress}%
            </span>
          )}
        </Tile>
        <Tile rotulo="Financeiro" onClick={onReceive}>
          <span
            className={cn(
              "block text-lg font-semibold tabular-nums tracking-tight",
              patient.overdueAmount > 0
                ? "text-danger"
                : patient.pendingAmount > 0
                  ? "text-warning"
                  : "text-success",
            )}
          >
            {patient.overdueAmount > 0
              ? `${formatBRL(patient.overdueAmount)} em atraso`
              : patient.pendingAmount > 0
                ? `${formatBRL(patient.pendingAmount)} a receber`
                : "Em dia"}
          </span>
          <span className="block text-2xs text-muted-foreground">
            {formatBRL(patient.receivedAmount)} recebidos
          </span>
        </Tile>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <CareTimeline events={patient.timeline} />
        <div className="space-y-5">
          <ConversaDoPaciente crmContactId={patient.crmContactId} />
          <PersonalInfoCard patient={patient} />
        </div>
      </div>
    </div>
  );
}

/** Uma linha só aparece quando tem valor.
 *
 *  O contrário — mostrar "não informado" em toda linha vazia — enche a ficha
 *  de ruído justamente no paciente sobre quem se sabe menos, que é quando ela
 *  precisa ser mais fácil de ler. */
function Linha({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  if (!valor) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{rotulo}</span>
      <span className="min-w-0 truncate text-sm font-medium text-right">{valor}</span>
    </div>
  );
}

function PersonalInfoCard({ patient }: { patient: PatientDetail }) {
  const addressLine = [patient.address, patient.addressComplement].filter(Boolean).join(", ");
  const cityLine = [
    patient.neighborhood,
    patient.city && patient.state ? `${patient.city}/${patient.state}` : patient.city,
  ]
    .filter(Boolean)
    .join(" · ");
  const hasAddress = !!(addressLine || cityLine || patient.zipCode);
  const hasGuardian = !!(patient.guardianName || patient.guardianCpf);
  const genderLabel =
    patient.gender === "F" ? "Feminino" : patient.gender === "M" ? "Masculino" : null;

  // CPF, e-mail, data de nascimento, profissional responsável e observações
  // vinham do servidor a cada abertura e não eram desenhados em lugar nenhum.
  const identificacao = !!(patient.cpf || patient.birthDate || genderLabel);
  const contato = !!patient.email;
  const cuidado = !!patient.professionalName;

  if (!identificacao && !contato && !cuidado && !hasAddress && !hasGuardian && !patient.notes) {
    return null;
  }

  return (
    <section className="surface-card p-5">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-info-soft text-info">
          <UserRound className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Dados do paciente</p>

          <div className="mt-3 divide-y divide-border">
            <Linha rotulo="CPF" valor={patient.cpf} />
            <Linha
              rotulo="Nascimento"
              valor={patient.birthDate ? formatDate(patient.birthDate) : null}
            />
            <Linha rotulo="Sexo" valor={genderLabel} />
            <Linha rotulo="E-mail" valor={patient.email} />
            <Linha rotulo="Dentista responsável" valor={patient.professionalName} />
          </div>

          {hasAddress && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">Endereço</p>
              {addressLine && <p className="mt-1 text-sm font-medium">{addressLine}</p>}
              {cityLine && <p className="text-sm text-muted-foreground">{cityLine}</p>}
              {patient.zipCode && (
                <p className="text-sm text-muted-foreground">CEP {patient.zipCode}</p>
              )}
            </div>
          )}

          {hasGuardian && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">Responsável</p>
              {patient.guardianName && (
                <p className="mt-1 text-sm font-medium">{patient.guardianName}</p>
              )}
              {patient.guardianCpf && (
                <p className="text-sm text-muted-foreground">CPF {patient.guardianCpf}</p>
              )}
            </div>
          )}

          {patient.notes && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">Observações</p>
              <p className="mt-1 whitespace-pre-line text-sm text-foreground-secondary">
                {patient.notes}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CareTimeline({ events }: { events: CareEvent[] }) {
  return (
    <section className="surface-card p-5 sm:p-7">
      <div className="flex items-center gap-2">
        <Stethoscope className="h-5 w-5 text-pink" />
        <h2 className="text-xl font-semibold">Linha de cuidado</h2>
      </div>
      {events.length ? (
        <div className="relative mt-6 space-y-0">
          <div className="absolute bottom-7 left-[18px] top-7 w-px bg-gradient-to-b from-warning via-pink to-border" />
          {events.map((event) => (
            <div key={event.id} className="relative flex min-h-[76px] items-center gap-4 pl-0">
              <span
                className={cn(
                  "relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 bg-white",
                  event.status === "completed"
                    ? "border-warning text-warning"
                    : event.status === "current"
                      ? "border-pink text-pink"
                      : "border-muted-foreground/40 text-muted-foreground",
                )}
              >
                {event.status === "completed" ? (
                  <Check className="h-4 w-4" />
                ) : event.status === "current" ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-pink" />
                ) : (
                  <Clock3 className="h-4 w-4" />
                )}
              </span>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                {event.type === "procedure" ? (
                  <Sparkles className="h-4 w-4" />
                ) : event.type === "evaluation" ? (
                  <ClipboardList className="h-4 w-4" />
                ) : (
                  <CalendarDays className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {formatEventDate(event.date)} · {event.title}
                </span>
                {event.description && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {event.description}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-3xs font-semibold",
                  event.status === "completed"
                    ? "bg-success-soft text-success"
                    : event.status === "current"
                      ? "bg-warning-soft text-warning"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {event.status === "completed"
                  ? "Concluído"
                  : event.status === "current"
                    ? "Hoje"
                    : "Agendado"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          A linha de cuidado começa quando o primeiro atendimento é registrado.
        </p>
      )}
    </section>
  );
}

/** A aba Clínico: prontuário em cima, histórico de consultas embaixo.
 *
 *  Nesta ordem porque a evolução é o que a dentista escreve todo dia, e o
 *  histórico é consulta ocasional. Orçamentos e tratamentos entram aqui na
 *  Onda 4 — a narrativa é uma só (orçar, tratar, evoluir) e não merece três
 *  abas separadas. */
function Clinico({ patient }: { patient: PatientDetail }) {
  // O odontograma é só de odontologia: consultório só de estética ou de outra
  // área não vê um mapa de dentes que não usa.
  const buscarConfig = useServerFn(getConfigDoConsultorio);
  const { data: config } = useQuery({
    queryKey: ["config-do-consultorio"],
    queryFn: () => buscarConfig(),
    staleTime: 5 * 60_000,
  });
  const comOdonto = !config || config.area === "odonto" || config.area === "odonto_estetica";
  return (
    <div className="mt-5 space-y-5">
      {/* Orçar → tratar → evoluir → histórico: a ordem em que a coisa acontece,
          e por isso a ordem em que aparece. */}
      {comOdonto && <OdontogramaDoPaciente patientId={patient.id} />}
      <Tratamentos patientId={patient.id} />
      <Prontuario patientId={patient.id} />
      <History patient={patient} />
    </div>
  );
}

function History({ patient }: { patient: PatientDetail }) {
  return (
    <section className="surface-card overflow-hidden p-5 sm:p-7">
      <h2 className="text-xl font-semibold">Histórico do paciente</h2>
      <div className="mt-5 divide-y divide-border">
        {patient.timeline.map((event) => (
          <div key={event.id} className="flex gap-4 py-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-coral-soft text-coral">
              <ClipboardList className="h-4 w-4" />
            </span>
            <div>
              <p className="font-medium">{event.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDateTime(event.date)}
                {event.description ? ` · ${event.description}` : ""}
              </p>
            </div>
          </div>
        ))}
        {!patient.timeline.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum evento registrado.
          </p>
        )}
      </div>
    </section>
  );
}

const PERIODOS = [
  { id: "todos", label: "Todos" },
  { id: "12m", label: "12 meses" },
  { id: "ano", label: "Este ano" },
] as const;
type Periodo = (typeof PERIODOS)[number]["id"];

function Finance({ patient, onReceive }: { patient: PatientDetail; onReceive: () => void }) {
  const [periodo, setPeriodo] = useState<Periodo>("todos");

  // O filtro só aparece quando há o que filtrar. Um controle que, na prática,
  // devolve sempre a mesma lista é ruído — e a maioria das fichas tem duas ou
  // três movimentações.
  const vale = patient.finances.length > 6;

  const movimentacoes =
    !vale || periodo === "todos"
      ? patient.finances
      : patient.finances.filter((item) => {
          const corte =
            periodo === "ano"
              ? `${new Date().getFullYear()}-01-01`
              : localDateStr(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));
          return item.dueDate >= corte;
        });

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-3">
      <Metric label="Recebido" value={formatBRL(patient.receivedAmount)} tone="success" />
      <Metric label="A receber" value={formatBRL(patient.pendingAmount)} tone="warning" />
      <Metric label="Em atraso" value={formatBRL(patient.overdueAmount)} tone="danger" />
      <section className="surface-card overflow-hidden lg:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">Movimentações</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Recebimentos vinculados a este paciente.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {vale && (
              <div
                className="flex rounded-xl border border-border p-0.5"
                role="group"
                aria-label="Período"
              >
                {PERIODOS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriodo(p.id)}
                    aria-pressed={periodo === p.id}
                    className={cn(
                      "press rounded-lg px-2.5 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      periodo === p.id
                        ? "bg-foreground text-white"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <Button className="bg-gradient-primary text-white" onClick={onReceive}>
              Novo recebimento
            </Button>
          </div>
        </div>
        <div className="divide-y divide-border border-t border-border">
          {movimentacoes.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-5 py-4 sm:px-7">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-info-soft text-info">
                <ReceiptText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Vencimento {formatDate(item.dueDate)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">{formatBRL(item.amount)}</p>
                <p
                  className={cn(
                    "mt-1 text-xs",
                    item.status === "paid"
                      ? "text-success"
                      : item.status === "overdue"
                        ? "text-danger"
                        : "text-warning",
                  )}
                >
                  {item.status === "paid"
                    ? "Recebido"
                    : item.status === "overdue"
                      ? "Atrasado"
                      : "Pendente"}
                </p>
              </div>
            </div>
          ))}
          {!movimentacoes.length && (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {patient.finances.length
                ? "Nenhuma movimentação neste período."
                : "Nenhuma movimentação financeira vinculada."}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger";
}) {
  const Icon = tone === "success" ? WalletCards : tone === "warning" ? Clock3 : AlertTriangle;
  return (
    <div className="surface-card flex items-center gap-4 p-5">
      <span
        className={cn(
          "grid h-11 w-11 place-items-center rounded-2xl",
          tone === "success"
            ? "bg-success-soft text-success"
            : tone === "warning"
              ? "bg-warning-soft text-warning"
              : "bg-danger-soft text-danger",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-foreground text-white" : "text-muted-foreground hover:text-foreground",
      )}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </button>
  );
}

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const formatDateTime = (date: string) =>
  new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const formatEventDate = (date: string) => {
  const event = new Date(date);
  const now = new Date();
  return event.toDateString() === now.toDateString()
    ? "Hoje"
    : event.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};
