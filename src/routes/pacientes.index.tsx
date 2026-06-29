import { useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AlertTriangle, CalendarClock, ChevronRight, Search, UserPlus, Users } from "lucide-react";
import { Sidebar } from "@/components/finance/Sidebar";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { PatientFormSheet } from "@/components/patients/PatientFormSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import {
  getPatientsOverview,
  type PatientFilter,
  type PatientStatus,
  type PatientSummary,
  type PatientsOverview,
} from "@/lib/patients/patients.functions";

const searchSchema = z.object({
  q: z.string().optional(),
  status: z
    .enum(["all", "active", "in_treatment", "return_pending", "delinquent", "inactive"])
    .default("all"),
});
type PatientsSearch = z.infer<typeof searchSchema>;
type PatientsFetcher = (args: { data: PatientsSearch }) => Promise<PatientsOverview>;

const patientsQuery = (fetcher: PatientsFetcher, search: PatientsSearch) =>
  queryOptions({
    queryKey: ["patients", search],
    queryFn: () => fetcher({ data: search }),
    staleTime: 15_000,
  });

export const Route = createFileRoute("/pacientes/")({
  head: () => ({
    meta: [
      { title: "Pacientes · NÓS Conecta" },
      { name: "description", content: "Encontre e acompanhe os pacientes da clínica." },
    ],
  }),
  validateSearch: searchSchema,
  errorComponent: () => (
    <ResponsiveRouteState
      title="Não foi possível carregar os pacientes"
      description="Houve uma falha ao buscar a lista de pacientes. Tente novamente em instantes."
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState
      title="Página de pacientes não encontrada"
      description="A página que você tentou acessar não está disponível."
      notFound
    />
  ),
  component: PatientsPage,
});

const FILTERS: { value: PatientFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "in_treatment", label: "Em tratamento" },
  { value: "return_pending", label: "Retorno pendente" },
  { value: "delinquent", label: "Inadimplente" },
];

const STATUS: Record<PatientStatus, { label: string; className: string }> = {
  active: { label: "Ativo", className: "bg-info-soft text-info" },
  in_treatment: { label: "Em tratamento", className: "bg-success-soft text-success" },
  return_pending: { label: "Retorno pendente", className: "bg-warning-soft text-warning" },
  delinquent: { label: "Inadimplente", className: "bg-danger-soft text-danger" },
  inactive: { label: "Inativo", className: "bg-muted text-muted-foreground" },
};

function patientContext(patient: PatientSummary) {
  if (patient.nextAppointment) {
    const today = new Date().toISOString().slice(0, 10);
    const day =
      patient.nextAppointment.date === today
        ? "Hoje"
        : new Date(`${patient.nextAppointment.date}T00:00:00`).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
          });
    return `Próximo: ${day}, ${patient.nextAppointment.time}`;
  }
  if (patient.status === "delinquent")
    return `${formatBRL(patient.overdueAmount || 480)} em atraso`;
  if (patient.lastAppointment)
    return `Última consulta: ${new Date(`${patient.lastAppointment.date}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
  return patient.treatmentName ? `Tratamento: ${patient.treatmentName}` : "Sem agendamento futuro";
}

function PatientsPage() {
  const search = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchPatients = useServerFn(getPatientsOverview);
  const { data } = useQuery({
    ...patientsQuery(fetchPatients as unknown as PatientsFetcher, search),
    initialData: { patients: [], total: 0, attention: { returns: 0, delinquent: 0 } } as PatientsOverview,
  });
  const [formOpen, setFormOpen] = useState(false);

  const setSearch = (patch: Partial<PatientsSearch>) =>
    router.navigate({
      to: "/pacientes",
      search: (previous: PatientsSearch) => ({ ...previous, ...patch }),
    });

  return (
    <div className="min-h-screen app-bg lg:flex">
      <Sidebar />
      <main className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-7 sm:px-6 lg:px-10 lg:pb-10 lg:pt-9">
        <header className="pr-16 lg:flex lg:items-end lg:justify-between lg:gap-6 lg:pr-0">
          <div>
            <h1 className="text-[30px] font-semibold tracking-[-0.035em] text-foreground lg:text-4xl">
              Pacientes
            </h1>
            <p className="mt-1 text-[15px] text-muted-foreground">
              Encontre e acompanhe seus pacientes
            </p>
          </div>
          <Button
            className="mt-5 hidden gap-2 bg-gradient-primary text-white lg:flex"
            onClick={() => setFormOpen(true)}
          >
            <UserPlus className="h-4 w-4" /> Novo paciente
          </Button>
        </header>

        <div className="mt-7 grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Buscar pacientes"
              value={search.q ?? ""}
              onChange={(event) => setSearch({ q: event.target.value || undefined })}
              className="h-14 rounded-[20px] bg-white pl-12 text-[15px] shadow-soft"
              placeholder="Buscar por nome, telefone ou CPF"
            />
          </div>
          <Button
            className="h-14 gap-2 rounded-[20px] bg-gradient-primary text-white lg:hidden"
            onClick={() => setFormOpen(true)}
          >
            <UserPlus className="h-5 w-5" /> Novo paciente
          </Button>
        </div>

        <div className="scrollbar-none -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setSearch({ status: filter.value })}
              className={cn(
                "h-11 shrink-0 rounded-2xl border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                search.status === filter.value
                  ? "border-pink/25 bg-pink-soft text-pink"
                  : "border-border bg-white text-muted-foreground hover:text-foreground",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <section className="surface-card mt-6 overflow-hidden px-5 py-5 sm:px-6">
          <h2 className="text-lg font-semibold tracking-tight">Precisa de atenção</h2>
          <div className="mt-3 divide-y divide-border">
            <AttentionRow
              icon={CalendarClock}
              tone="warning"
              label={`${data.attention.returns} retornos atrasados`}
              onClick={() => setSearch({ status: "return_pending" })}
            />
            <AttentionRow
              icon={AlertTriangle}
              tone="danger"
              label={`${data.attention.delinquent} pacientes inadimplentes`}
              onClick={() => setSearch({ status: "delinquent" })}
            />
          </div>
        </section>

        <section className="mt-7">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">
              {search.status === "all"
                ? "Todos os pacientes"
                : FILTERS.find((item) => item.value === search.status)?.label}
            </h2>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {data.patients.length}
            </span>
          </div>

          {data.patients.length ? (
            <div className="surface-card divide-y divide-border overflow-hidden">
              {data.patients.map((patient, index) => (
                <Link
                  key={patient.id}
                  to="/pacientes/$patientId"
                  params={{ patientId: patient.id }}
                  className="group flex min-h-[106px] items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/25 sm:px-6"
                >
                  <span
                    className={cn(
                      "grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-bold",
                      avatarTone(index),
                    )}
                  >
                    {patient.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[15px] font-semibold">{patient.name}</span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          STATUS[patient.status].className,
                        )}
                      >
                        {STATUS[patient.status].label}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {patient.phone ?? "Telefone não informado"}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {patientContext(patient)}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="surface-card grid min-h-64 place-items-center px-6 text-center">
              <div>
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-coral-soft text-coral">
                  <Users className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold">Nenhum paciente encontrado</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ajuste a busca ou cadastre um novo paciente.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>

      <PatientFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={(id) => {
          queryClient.invalidateQueries({ queryKey: ["patients"] });
          navigate({ to: "/pacientes/$patientId", params: { patientId: id } });
        }}
      />
    </div>
  );
}

function AttentionRow({
  icon: Icon,
  tone,
  label,
  onClick,
}: {
  icon: typeof AlertTriangle;
  tone: "warning" | "danger";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 py-3 text-left hover:text-foreground"
    >
      <span
        className={cn(
          "grid h-10 w-10 place-items-center rounded-2xl",
          tone === "warning" ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function avatarTone(index: number) {
  return [
    "bg-violet-soft text-violet",
    "bg-warning-soft text-warning",
    "bg-pink-soft text-pink",
    "bg-info-soft text-info",
  ][index % 4];
}
