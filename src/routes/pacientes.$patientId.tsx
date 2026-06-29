import { useState } from "react";
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
  ReceiptText,
  Sparkles,
  Stethoscope,
  WalletCards,
} from "lucide-react";
import { Sidebar } from "@/components/finance/Sidebar";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { PatientFormSheet } from "@/components/patients/PatientFormSheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import {
  getPatientDetail,
  type CareEvent,
  type PatientDetail,
} from "@/lib/patients/patients.functions";

type DetailFetcher = (args: { data: { patientId: string } }) => Promise<PatientDetail>;

const detailQuery = (fetcher: DetailFetcher, patientId: string) =>
  queryOptions({
    queryKey: ["patient-detail", patientId],
    queryFn: () => fetcher({ data: { patientId } }),
    staleTime: 15_000,
  });

export const Route = createFileRoute("/pacientes/$patientId")({
  head: () => ({
    meta: [
      { title: "Paciente · NÓS Conecta" },
      { name: "description", content: "Histórico, agenda e financeiro do paciente." },
    ],
  }),
  // No SSR loader: getPatientDetail requires auth not available during prerender.
  errorComponent: () => (
    <ResponsiveRouteState
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

type Tab = "overview" | "history" | "finance";

function PatientDetailPage() {
  const { patientId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getPatientDetail);
  const { data: patient } = useSuspenseQuery(
    detailQuery(fetchDetail as unknown as DetailFetcher, patientId),
  );
  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
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

  return (
    <div className="min-h-screen app-bg lg:flex">
      <Sidebar />
      <main className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-10 lg:pt-8">
        <header className="flex items-center justify-between gap-3">
          <Link
            to="/pacientes"
            search={{ status: "all" }}
            aria-label="Voltar para pacientes"
            className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-white text-foreground shadow-soft transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Paciente</h1>
          <button
            type="button"
            aria-label="Editar paciente"
            onClick={() => setEditOpen(true)}
            className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-white text-muted-foreground shadow-soft hover:text-foreground"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </header>

        <section className="surface-card mt-6 flex items-center gap-4 p-5 sm:gap-5 sm:p-7">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-violet-soft text-xl font-bold text-violet sm:h-20 sm:w-20 sm:text-2xl">
            {patient.initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="truncate text-2xl font-semibold tracking-tight lg:text-3xl">
                {patient.name}
              </h2>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  patient.status === "delinquent" && "bg-danger-soft text-danger",
                  patient.status === "return_pending" && "bg-warning-soft text-warning",
                  patient.status === "inactive" && "bg-muted text-muted-foreground",
                  (patient.status === "active" || patient.status === "in_treatment") &&
                    "bg-success-soft text-success",
                )}
              >
                {patient.status === "delinquent"
                  ? "Inadimplente"
                  : patient.status === "return_pending"
                    ? "Retorno pendente"
                    : patient.status === "inactive"
                      ? "Inativo"
                      : patient.status === "in_treatment"
                        ? "Em tratamento"
                        : "Ativo"}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {patient.age ? `${patient.age} anos` : "Idade não informada"}
            </p>
            <p className="mt-1 text-[15px] text-muted-foreground">
              {patient.phone ?? "Telefone não informado"}
            </p>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <ActionButton icon={CalendarDays} label="Agendar" primary onClick={schedule} />
          {whatsapp ? (
            <a
              href={`https://wa.me/${whatsapp.startsWith("55") ? whatsapp : `55${whatsapp}`}`}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-white px-2 text-xs font-semibold text-muted-foreground shadow-soft hover:text-foreground sm:flex-row sm:text-sm"
            >
              <MessageCircle className="h-5 w-5" />
              <span>WhatsApp</span>
            </a>
          ) : (
            <ActionButton icon={Clock3} label="Sem telefone" disabled />
          )}
          <ActionButton icon={CircleDollarSign} label="Recebimento" onClick={receive} />
        </section>

        {(patient.allergyNotes || patient.overdueAmount > 0) && (
          <section className="mt-5 flex flex-col gap-3 rounded-[22px] border border-warning/25 bg-warning-soft/45 px-4 py-4 text-sm sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 font-semibold text-warning">
              <AlertTriangle className="h-5 w-5" /> Atenção
            </div>
            <div className="flex flex-1 flex-wrap gap-2">
              {patient.allergyNotes && (
                <span className="rounded-full border border-warning/20 bg-white/70 px-3 py-1.5">
                  {patient.allergyNotes}
                </span>
              )}
              {patient.overdueAmount > 0 && (
                <button
                  type="button"
                  onClick={receive}
                  className="rounded-full border border-danger/15 bg-white/70 px-3 py-1.5 text-danger"
                >
                  {formatBRL(patient.overdueAmount)} em atraso
                </button>
              )}
            </div>
          </section>
        )}

        <nav
          className="surface-card mt-5 grid grid-cols-3 overflow-hidden p-1"
          aria-label="Seções do paciente"
        >
          <TabButton
            label="Visão geral"
            active={tab === "overview"}
            onClick={() => setTab("overview")}
          />
          <TabButton
            label="Histórico"
            active={tab === "history"}
            onClick={() => setTab("history")}
          />
          <TabButton
            label="Financeiro"
            active={tab === "finance"}
            onClick={() => setTab("finance")}
          />
        </nav>

        {tab === "overview" && <Overview patient={patient} onSchedule={schedule} />}
        {tab === "history" && <History patient={patient} />}
        {tab === "finance" && <Finance patient={patient} onReceive={receive} />}
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

function Overview({ patient, onSchedule }: { patient: PatientDetail; onSchedule: () => void }) {
  const progress =
    patient.totalSessions > 0
      ? Math.min(100, Math.round((patient.completedSessions / patient.totalSessions) * 100))
      : 0;
  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <CareTimeline events={patient.timeline} />
      <div className="space-y-5">
        <section className="surface-card p-5">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-pink-soft text-pink">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Próximo agendamento</p>
              {patient.nextAppointment ? (
                <>
                  <p className="mt-1 text-xl font-semibold text-pink">
                    {patient.nextAppointment.date === new Date().toISOString().slice(0, 10)
                      ? "Hoje"
                      : formatDate(patient.nextAppointment.date)}
                    , {patient.nextAppointment.time}
                  </p>
                  <p className="mt-1 font-medium">{patient.nextAppointment.procedure}</p>
                  <p className="text-sm text-muted-foreground">
                    {patient.nextAppointment.professional}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 font-medium">Nenhum horário futuro</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={onSchedule}>
                    Agendar agora
                  </Button>
                </>
              )}
            </div>
            <ChevronRight className="mt-3 h-5 w-5 text-muted-foreground" />
          </div>
        </section>

        <section className="surface-card p-5">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Tratamento atual</p>
              <p className="mt-1 font-semibold">
                {patient.treatmentName ?? "Sem tratamento ativo"}
                {patient.totalSessions > 0
                  ? ` · ${patient.completedSessions} de ${patient.totalSessions} sessões`
                  : ""}
              </p>
              {patient.totalSessions > 0 && (
                <>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-primary"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-right text-xs text-muted-foreground">
                    {progress}% concluído
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function CareTimeline({ events }: { events: CareEvent[] }) {
  return (
    <section className="surface-card p-5 sm:p-7">
      <div className="flex items-center gap-2">
        <Stethoscope className="h-5 w-5 text-pink" />
        <h2 className="text-xl font-semibold tracking-tight">Linha de cuidado</h2>
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
                  "rounded-full px-2.5 py-1 text-[10px] font-semibold",
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

function History({ patient }: { patient: PatientDetail }) {
  return (
    <section className="surface-card mt-5 overflow-hidden p-5 sm:p-7">
      <h2 className="text-xl font-semibold tracking-tight">Histórico do paciente</h2>
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

function Finance({ patient, onReceive }: { patient: PatientDetail; onReceive: () => void }) {
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-3">
      <Metric label="Recebido" value={formatBRL(patient.receivedAmount)} tone="success" />
      <Metric label="A receber" value={formatBRL(patient.pendingAmount)} tone="warning" />
      <Metric label="Em atraso" value={formatBRL(patient.overdueAmount)} tone="danger" />
      <section className="surface-card overflow-hidden lg:col-span-3">
        <div className="flex items-center justify-between px-5 py-5 sm:px-7">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Movimentações</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Recebimentos vinculados a este paciente.
            </p>
          </div>
          <Button className="bg-gradient-primary text-white" onClick={onReceive}>
            Novo recebimento
          </Button>
        </div>
        <div className="divide-y divide-border border-t border-border">
          {patient.finances.map((item) => (
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
          {!patient.finances.length && (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhuma movimentação financeira vinculada.
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

function ActionButton({
  icon: Icon,
  label,
  primary,
  onClick,
  disabled,
}: {
  icon: typeof CalendarDays;
  label: string;
  primary?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-2xl border px-2 text-xs font-semibold shadow-soft transition-transform active:scale-[0.98] sm:flex-row sm:text-sm",
        primary
          ? "border-transparent bg-gradient-primary text-white"
          : "border-border bg-white text-muted-foreground hover:text-foreground",
        disabled && "opacity-50",
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </button>
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
        "relative min-h-12 rounded-2xl px-2 text-sm font-medium transition-colors",
        active ? "bg-pink-soft/60 text-pink" : "text-muted-foreground hover:text-foreground",
      )}
      aria-current={active ? "page" : undefined}
    >
      {label}
      {active && (
        <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full bg-pink" />
      )}
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
