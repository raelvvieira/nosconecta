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
import { CommitmentDrawer } from "@/components/agenda/CommitmentDrawer";
import { RightSidebar } from "@/components/agenda/RightSidebar";
import { MobileAgenda } from "@/components/agenda/mobile/MobileAgenda";
import { STATUS_LABEL } from "@/components/agenda/appointment-utils";
import type { Appointment, AgendaFilters, AppointmentStatus, BlockedTime } from "@/components/agenda/types";
import {
  professionals as fallbackProfessionals,
  rooms as fallbackRooms,
  procedures as fallbackProcedures,
} from "@/components/agenda/mock-data";
import { getSettings } from "@/lib/settings/settings.functions";
import { useUnitSelection } from "@/lib/settings/unit-context";
import { appointmentPayload, useSaveAppointment } from "@/lib/agenda/useSaveAppointment";
import { acharSobreposicoes, type Sobreposicao } from "@/lib/agenda/conflicts";
import { OverlapDialog } from "@/components/agenda/OverlapDialog";
import type { AlvoArraste, ItemArrastavel } from "@/components/agenda/useCalendarDrag";
import { formatBRL } from "@/lib/finance/format";
import {
  getAgendaOverview,
  updateAppointment,
  updateAppointmentStatus,
  createBlockedTime,
  updateBlockedTime,
  deleteBlockedTime,
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
  errorComponent: ({ error }) => <ResponsiveRouteState error={error} title="Não foi possível carregar a agenda" />,
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
  const updateApptFn = useServerFn(updateAppointment);
  const createBlockFn = useServerFn(createBlockedTime);
  const { selectedUnitId } = useUnitSelection();
  const updateBlockFn = useServerFn(updateBlockedTime);
  const deleteBlockFn = useServerFn(deleteBlockedTime);

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
  const [selectedBlock, setSelectedBlock] = useState<BlockedTime | null>(null);

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
    mutationFn: (data: Partial<(typeof blocked)[number]>) => {
      const payload = {
        professionalId: data.professionalId ?? "",
        roomId: data.roomId || null,
        date: data.date ?? todayStr,
        startTime: data.startTime ?? "12:00",
        endTime: data.endTime ?? "13:00",
        reason: data.reason ?? null,
      };
      // Criar devolve { id }, editar devolve { ok } — o retorno não é usado.
      if (data.id) return updateBlockFn({ data: { ...payload, id: data.id } }).then(() => undefined);
      return createBlockFn({ data: { ...payload, unitId: selectedUnitId ?? undefined } }).then(() => undefined);
    },
    onSuccess: (_r, data) => {
      toast.success(data.id ? "Compromisso atualizado" : "Compromisso criado");
      invalidate();
      setBlockDrawerOpen(false);
      setSelectedBlock(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar compromisso"),
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (id: string) => deleteBlockFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Compromisso excluído");
      invalidate();
      setBlockDrawerOpen(false);
      setSelectedBlock(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao excluir compromisso"),
  });

  /**
   * O retorno é criado mesmo havendo choque de horário — o aviso existe porque
   * o calendário empilha cards sobrepostos com o mesmo z-index, sem sinalizar
   * conflito nenhum. Sem esta mensagem, o retorno ficaria escondido atrás de
   * outro atendimento e ninguém saberia.
   */
  const avisarRetorno = (
    retornoEm: string,
    conflitos: { patientName: string; startTime: string }[],
  ) => {
    const quando = retornoEm.split("-").reverse().join("/");
    if (conflitos.length) {
      toast.warning(
        `Retorno criado em ${quando}, mas ${conflitos[0].patientName} já tem atendimento às ${conflitos[0].startTime}.`,
      );
    } else {
      toast.success(`Retorno pré-agendado para ${quando}`);
    }
  };

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status,
      actualRevenue,
      retornoEm,
      generateFinancial,
    }: {
      id: string;
      status: AppointmentStatus;
      actualRevenue?: number;
      retornoEm?: string | null;
      generateFinancial?: boolean;
    }) => updateStatusFn({ data: { id, status, actualRevenue, retornoEm, generateFinancial } }),
    onSuccess: (r, { status, actualRevenue, retornoEm }) => {
      toast.success(
        status === "completed" && actualRevenue !== undefined
          ? `Atendimento confirmado · ${formatBRL(actualRevenue)}`
          : `Status alterado para ${STATUS_LABEL[status]}`,
      );
      if (retornoEm) avisarRetorno(retornoEm, r?.conflitos ?? []);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao alterar status"),
  });

  const handleSaveAppt = (data: Partial<Appointment>, retornoEm?: string | null) =>
    saveApptMutation.mutate({ data, existingId: selectedAppt?.id, retornoEm });
  const handleSaveBlock = (data: Partial<(typeof blocked)[number]>) => saveBlockMutation.mutate(data);

  const handleApptClick = (appt: Appointment) => {
    setSelectedAppt(appt);
    setApptDrawerOpen(true);
  };

  // Aqui existia um aviso "Recebimento previsto gerado: <paciente>" que era
  // falso — nada era gerado, nem no banco nem no financeiro. Quem gera o
  // recebimento agora é o servidor, ao confirmar com valor, e o aviso é o da
  // própria mutação.
  const handleStatusChange = (
    id: string,
    status: AppointmentStatus,
    actualRevenue?: number,
    retornoEm?: string | null,
    generateFinancial?: boolean,
  ) => statusMutation.mutate({ id, status, actualRevenue, retornoEm, generateFinancial });

  // ─── Arrastar na agenda ────────────────────────────────────────────────
  //
  // O que a gente move fica guardado até a confirmação: havendo sobreposição, o
  // diálogo abre e a gravação só acontece se a pessoa insistir. O card volta
  // sozinho para o lugar de origem enquanto isso — o hook limpa o `transform`
  // ao soltar, e a lista continua sendo a do servidor.
  const [pendente, setPendente] = useState<{
    item: ItemArrastavel;
    alvo: AlvoArraste;
    tipo: "consulta" | "compromisso";
    conflitos: Sobreposicao[];
  } | null>(null);

  const moverMutation = useMutation({
    mutationFn: async ({
      item,
      alvo,
      tipo,
    }: {
      item: ItemArrastavel;
      alvo: AlvoArraste;
      tipo: "consulta" | "compromisso";
    }) => {
      if (tipo === "compromisso") {
        const b = blocked.find((x) => x.id === item.id);
        if (!b) throw new Error("Compromisso não encontrado");
        await updateBlockFn({
          data: {
            id: b.id,
            professionalId: b.professionalId ?? "",
            roomId: b.roomId || null,
            date: alvo.date,
            startTime: alvo.startTime,
            endTime: alvo.endTime,
            reason: b.reason ?? null,
          },
        });
        return;
      }

      const a = appointments.find((x) => x.id === item.id);
      if (!a) throw new Error("Agendamento não encontrado");
      // O agendamento inteiro, não só os campos que mudaram: o servidor grava a
      // linha toda, e um payload parcial apagaria paciente, valores e notas.
      await updateApptFn({
        data: {
          id: a.id,
          ...appointmentPayload(
            { ...a, date: alvo.date, startTime: alvo.startTime, endTime: alvo.endTime },
            a.patientId ?? null,
          ),
        },
      });
    },
    onSuccess: (_r, { alvo }) => {
      toast.success(
        `Movido para ${alvo.date.split("-").reverse().join("/")} às ${alvo.startTime}`,
      );
      setPendente(null);
      invalidate();
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Erro ao mover");
      setPendente(null);
    },
  });

  const handleMove = (
    item: ItemArrastavel,
    alvo: AlvoArraste,
    tipo: "consulta" | "compromisso",
  ) => {
    const conflitos = acharSobreposicoes(
      { ...alvo, ignorarId: item.id },
      appointments,
      blocked,
    );
    if (conflitos.length) {
      setPendente({ item, alvo, tipo, conflitos });
      return;
    }
    moverMutation.mutate({ item, alvo, tipo });
  };

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
            <h1 className="text-2xl md:text-3xl font-semibold text-foreground leading-[1.1]">
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
              onBlockClick={(b) => {
                setSelectedBlock(b);
                setBlockDrawerOpen(true);
              }}
              onMove={handleMove}
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
        onTrocarParaCompromisso={() => {
          setApptDrawerOpen(false);
          setSelectedAppt(null);
          setSelectedBlock(null);
          setBlockDrawerOpen(true);
        }}
      />
      <CommitmentDrawer
        open={blockDrawerOpen}
        commitment={selectedBlock}
        defaultDate={todayStr}
        professionals={professionals}
        rooms={rooms}
        isSaving={saveBlockMutation.isPending || deleteBlockMutation.isPending}
        onClose={() => {
          setBlockDrawerOpen(false);
          setSelectedBlock(null);
        }}
        onSave={handleSaveBlock}
        onDelete={(id) => deleteBlockMutation.mutate(id)}
        onTrocarParaConsulta={() => {
          setBlockDrawerOpen(false);
          setSelectedBlock(null);
          openNewAppointment();
        }}
      />

      <OverlapDialog
        conflitos={pendente?.conflitos ?? null}
        destino={pendente?.alvo ?? null}
        isPending={moverMutation.isPending}
        onCancel={() => setPendente(null)}
        onConfirm={() => pendente && moverMutation.mutate(pendente)}
      />
    </div>
  );
}
