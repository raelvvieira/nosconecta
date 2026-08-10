import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Lock, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/finance/Sidebar";
import { AgendaStatsCards } from "@/components/agenda/AgendaStatsCards";
import { WeeklyCalendar } from "@/components/agenda/WeeklyCalendar";
import { AppointmentDrawer } from "@/components/agenda/AppointmentDrawer";
import { BlockedTimeDrawer } from "@/components/agenda/BlockedTimeDrawer";
import { RightSidebar } from "@/components/agenda/RightSidebar";
import { MobileAgenda } from "@/components/agenda/mobile/MobileAgenda";
import { STATUS_LABEL } from "@/components/agenda/appointment-utils";
import type { Appointment, AgendaFilters, AppointmentStatus } from "@/components/agenda/types";
import {
  professionals as fallbackProfessionals,
  rooms as fallbackRooms,
  procedures as fallbackProcedures,
} from "@/components/agenda/mock-data";
import { getSettings } from "@/lib/settings/settings.functions";
import { useSaveAppointment } from "@/lib/agenda/useSaveAppointment";
import { formatBRL } from "@/lib/finance/format";
import {
  getAgendaOverview,
  updateAppointmentStatus,
  createBlockedTime,
  type AgendaOverview,
} from "@/lib/agenda/agenda.functions";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { RouteSkeleton } from "@/components/layout/RouteSkeleton";

const agendaSearchSchema = z.object({
  patientId: z.string().optional(),
  patientName: z.string().optional(),
  newAppointment: z.boolean().optional(),
});

const agendaOverviewOpts = (fetcher: () => Promise<AgendaOverview>) =>
  queryOptions({
    queryKey: ["agenda-overview"],
    queryFn: () => fetcher(),
    staleTime: 15_000,
  });

export const Route = createFileRoute("/agenda")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Agenda · NÓS Conecta" },
      { name: "description", content: "Gerencie os agendamentos da sua clínica." },
    ],
  }),
  validateSearch: agendaSearchSchema,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(agendaOverviewOpts(getAgendaOverview as any)),
  pendingComponent: () => <RouteSkeleton shape="calendar" />,
  // 150ms evita o piscar em navegação instantânea; 400ms de mínimo
  // evita que o esqueleto apareça e suma num susto.
  pendingMs: 150,
  pendingMinMs: 400,
  errorComponent: () => <ResponsiveRouteState title="Não foi possível carregar a agenda" />,
  notFoundComponent: () => <ResponsiveRouteState title="Agenda não encontrada" notFound />,
  component: AgendaPage,
});

function AgendaPage() {
  const search = Route.useSearch();
  const router = useRouter();
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getSettings);
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => fetchSettings(),
    staleTime: 15_000,
  });
  const professionals =
    settings?.professionals
      .filter((item) => item.active)
      .map((item) => ({ id: item.id, name: item.name, specialty: item.specialty })) ??
    fallbackProfessionals;
  const rooms =
    settings?.chairs
      .filter((item) => item.active)
      .map((item) => ({
        id: item.id,
        name: item.roomName ? `${item.name} · ${item.roomName}` : item.name,
      })) ?? fallbackRooms;
  const procedures =
    settings?.procedures
      .filter((item) => item.active)
      .map((item) => ({
        id: item.id,
        name: item.name,
        duration: item.durationMinutes,
        price: item.price,
      })) ?? fallbackProcedures;

  const fetchOverview = useServerFn(getAgendaOverview);
  const updateStatusFn = useServerFn(updateAppointmentStatus);
  const createBlockFn = useServerFn(createBlockedTime);

  const { data: agenda } = useSuspenseQuery(agendaOverviewOpts(fetchOverview as any));
  const appointments = agenda.appointments;
  const blocked = agenda.blockedTimes;
  const waitingList = agenda.waitingList;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["agenda-overview"] });

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filters, setFilters] = useState<AgendaFilters>({
    professionalId: "",
    roomId: "",
    type: "",
    status: "",
  });

  const [apptDrawerOpen, setApptDrawerOpen] = useState(false);
  const [blockDrawerOpen, setBlockDrawerOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);

  useEffect(() => {
    if (!search.newAppointment) return;
    setSelectedAppt(null);
    setApptDrawerOpen(true);
    router.navigate({
      to: "/agenda",
      search: (previous: Record<string, unknown>) => ({ ...previous, newAppointment: undefined }),
      replace: true,
    });
  }, [search.newAppointment, router]);

  const todayStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;

  // Mesma gravação usada pelo chat (useSaveAppointment) — ver comentário lá
  // sobre por que isso não pode ser duplicado.
  const saveApptMutation = useSaveAppointment({
    onSaved: () => {
      setApptDrawerOpen(false);
      setSelectedAppt(null);
    },
  });

  const saveBlockMutation = useMutation({
    mutationFn: (data: Partial<(typeof blocked)[number]>) =>
      createBlockFn({
        data: {
          professionalId: data.professionalId ?? "",
          roomId: data.roomId || null,
          date: data.date ?? todayStr,
          startTime: data.startTime ?? "12:00",
          endTime: data.endTime ?? "13:00",
          reason: data.reason ?? null,
        },
      }),
    onSuccess: () => {
      toast.success("Horário bloqueado");
      invalidate();
      setBlockDrawerOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao bloquear horário"),
  });

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status,
      actualRevenue,
    }: {
      id: string;
      status: AppointmentStatus;
      actualRevenue?: number;
    }) => updateStatusFn({ data: { id, status, actualRevenue } }),
    onSuccess: (_r, { status, actualRevenue }) => {
      toast.success(
        status === "completed" && actualRevenue !== undefined
          ? `Atendimento confirmado · ${formatBRL(actualRevenue)}`
          : `Status alterado para ${STATUS_LABEL[status]}`,
      );
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao alterar status"),
  });

  const handleSaveAppt = (data: Partial<Appointment>) =>
    saveApptMutation.mutate({ data, existingId: selectedAppt?.id });
  const handleSaveBlock = (data: Partial<(typeof blocked)[number]>) => saveBlockMutation.mutate(data);

  const handleApptClick = (appt: Appointment) => {
    setSelectedAppt(appt);
    setApptDrawerOpen(true);
  };

  // Aqui existia um aviso "Recebimento previsto gerado: <paciente>" que era
  // falso — nada era gerado, nem no banco nem no financeiro. Quem gera o
  // recebimento agora é o servidor, ao confirmar com valor, e o aviso é o da
  // própria mutação.
  const handleStatusChange = (id: string, status: AppointmentStatus, actualRevenue?: number) =>
    statusMutation.mutate({ id, status, actualRevenue });

  const openNewAppointment = () => {
    setSelectedAppt(null);
    setApptDrawerOpen(true);
  };

  return (
    <div className="min-h-dvh flex" style={{ background: "var(--surface)" }}>
      <Sidebar />

      {/* Mobile */}
      <MobileAgenda
        appointments={appointments}
        blockedTimes={blocked}
        selectedDate={selectedDate}
        filters={filters}
        professionals={professionals}
        rooms={rooms}
        onDateChange={setSelectedDate}
        onFiltersChange={setFilters}
        onNewAppointment={openNewAppointment}
        onNewBlock={() => setBlockDrawerOpen(true)}
        onEditAppointment={handleApptClick}
        onStatusChange={handleStatusChange}
      />

      {/* Desktop */}
      <main className="hidden lg:block flex-1 min-w-0 px-4 md:px-6 lg:px-10 py-6 md:py-8 space-y-6 pb-28 lg:pb-8">
        {/* Header */}
        <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground leading-[1.1]">
              Agenda
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
              Gerencie os agendamentos da sua clínica
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                setSelectedAppt(null);
                setApptDrawerOpen(true);
              }}
              className="gap-2 text-white font-semibold rounded-xl"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Agendamento</span>
              <span className="sm:hidden">Agendar</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setBlockDrawerOpen(true)}
              className="gap-2 rounded-xl border-surface-muted text-foreground-secondary hover:bg-surface"
            >
              <Lock className="h-4 w-4" />
              <span className="hidden sm:inline">Bloqueio de Horário</span>
            </Button>
            <Button
              variant="outline"
              className="gap-2 rounded-xl border-surface-muted text-foreground-secondary hover:bg-surface"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Stats */}
        <AgendaStatsCards appointments={appointments} date={todayStr} />

        {/* Main layout */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
          {/* Calendar */}
          <div className="xl:col-span-3">
            <WeeklyCalendar
              appointments={appointments}
              blockedTimes={blocked}
              filters={filters}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              onAppointmentClick={handleApptClick}
              professionals={professionals}
              rooms={rooms}
              onFiltersChange={setFilters}
            />
          </div>

          {/* Right sidebar */}
          <div className="hidden xl:block">
            <RightSidebar
              selectedDate={selectedDate}
              appointments={appointments}
              waitingList={waitingList}
              filters={filters}
              professionals={professionals}
              rooms={rooms}
              onDateChange={setSelectedDate}
              onFiltersChange={setFilters}
            />
          </div>
        </div>
      </main>

      {/* Drawers */}
      <AppointmentDrawer
        open={apptDrawerOpen}
        appointment={selectedAppt}
        defaultDate={todayStr}
        defaultPatient={
          search.patientId && search.patientName
            ? { id: search.patientId, name: search.patientName }
            : null
        }
        catalog={{ professionals, rooms, procedures }}
        isSaving={saveApptMutation.isPending}
        onClose={() => {
          setApptDrawerOpen(false);
          setSelectedAppt(null);
        }}
        onSave={handleSaveAppt}
      />
      <BlockedTimeDrawer
        open={blockDrawerOpen}
        defaultDate={todayStr}
        professionals={professionals}
        rooms={rooms}
        isSaving={saveBlockMutation.isPending}
        onClose={() => setBlockDrawerOpen(false)}
        onSave={handleSaveBlock}
      />
    </div>
  );
}
