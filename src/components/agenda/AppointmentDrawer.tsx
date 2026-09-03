import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PatientCombobox } from "@/components/patients/PatientCombobox";
import { Combobox } from "@/components/finance/Combobox";
import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  Professional,
  Procedure,
  Room,
} from "./types";
import {
  professionals as fallbackProfessionals,
  procedures as fallbackProcedures,
  rooms as fallbackRooms,
} from "./mock-data";
import { STATUS_LABEL, TYPE_LABEL } from "./appointment-utils";
import { NOTIFICATION_KINDS, NotificationRow } from "./notification-utils";
import { ConfirmCompletion } from "./ConfirmCompletion";
import { formatWhatsappNumber } from "@/lib/atendimentos/phone";
import { localDateStr, durationBetween, endTimeFrom } from "@/lib/date";
import { rotuloDeSala } from "@/lib/agenda/rotuloDeSala";
import { dividirNome, juntarNome } from "@/lib/patients/nome";

interface Props {
  open: boolean;
  appointment?: Appointment | null;
  defaultDate?: string;
  defaultPatient?: { id: string; name: string } | null;
  catalog?: { professionals: Professional[]; procedures: Procedure[]; rooms: Room[] };
  isSaving?: boolean;
  /** Aviso de contexto quando aberto fora da Agenda (ex.: a partir do chat). */
  origin?: string;
  /**
   * Contato de origem, quando o agendamento nasce de uma conversa de WhatsApp.
   *
   * Muda a seção Paciente: o nome vira campo editável (o do WhatsApp costuma
   * ser apelido, emoji ou o próprio número) e o telefone aparece para
   * conferência. Sem isto o formulário se comporta exatamente como na Agenda.
   */
  contact?: { name: string | null; phone: string | null; crmContactId: string | null } | null;
  onClose: () => void;
  /**
   * `retornoEm` só vem quando o atendimento foi confirmado com retorno.
   *
   * `nome` só vem quando o paciente ainda não existe e vai ser criado a partir
   * daqui: são as duas partes como quem preencheu separou. A Meta casa a
   * conversão por `fn` e `ln`, dois hashes distintos, e "Ana Paula Silva"
   * dividido no automático viraria fn "Ana" / ln "Paula Silva" — errado, e
   * errado em silêncio.
   */
  onSave: (
    data: Partial<Appointment>,
    retornoEm?: string | null,
    nome?: { primeiro: string; sobrenome: string },
  ) => void;
  /**
   * Trocar para o formulário de compromisso. Só a Agenda passa: no chat e no
   * funil o agendamento é sempre consulta de um contato, e oferecer
   * "Compromisso" ali seria uma opção sem sentido no contexto.
   */
  onTrocarParaCompromisso?: () => void;
}

// "completed" ficou de fora de propósito: concluir passou a ser uma ação
// própria, que pede o valor cobrado junto. Deixar a opção aqui seria um
// caminho paralelo para concluir sem valor — exatamente o que a regra evita.
const STATUS_OPTIONS: AppointmentStatus[] = [
  "pending",
  "confirmed",
  "in_progress",
  "missed",
  "cancelled",
];
// Durações que a clínica usa na prática. Uma fora da lista (vinda do catálogo
// de procedimentos ou de um agendamento antigo) entra na hora, ordenada.
const DURACOES = [10, 15, 20, 30, 45, 60, 90, 120];

const TYPE_OPTIONS: AppointmentType[] = [
  "consultation",
  "evaluation",
  "procedure",
  "return",
  "emergency",
];

export function AppointmentDrawer({
  open,
  appointment,
  defaultDate,
  defaultPatient,
  catalog,
  isSaving,
  origin,
  contact,
  onClose,
  onSave,
  onTrocarParaCompromisso,
}: Props) {
  const isEdit = !!appointment;

  // Quem clicou em "vincular a um paciente existente" quer o combobox de volta,
  // mesmo sem ter escolhido ninguém ainda.
  const [buscandoPaciente, setBuscandoPaciente] = useState(false);

  const professionals = catalog?.professionals ?? fallbackProfessionals;
  const procedures = catalog?.procedures ?? fallbackProcedures;
  const rooms = catalog?.rooms ?? fallbackRooms;

  const [form, setForm] = useState<Partial<Appointment>>({
    patientId: appointment?.patientId ?? defaultPatient?.id,
    patientName: appointment?.patientName ?? defaultPatient?.name ?? "",
    procedureName: appointment?.procedureName ?? "",
    professionalId: appointment?.professionalId ?? "",
    professionalName: appointment?.professionalName ?? "",
    roomId: appointment?.roomId ?? "",
    roomName: appointment?.roomName ?? "",
    date: appointment?.date ?? defaultDate ?? localDateStr(),
    startTime: appointment?.startTime ?? "09:00",
    endTime: appointment?.endTime ?? "10:00",
    status: appointment?.status ?? "pending",
    type: appointment?.type ?? "consultation",
    expectedRevenue: appointment?.expectedRevenue ?? 0,
    actualRevenue: appointment?.actualRevenue ?? null,
    notes: appointment?.notes ?? "",
    generateFinancial: appointment?.generateFinancial ?? true,
  });

  // Nome editável quando o agendamento nasce de uma conversa e ainda não há
  // paciente de verdade por trás. Vinculando um paciente existente, ou editando
  // um agendamento já salvo, o campo volta a ser o combobox de sempre.
  const modoContato = Boolean(contact) && !isEdit && !form.patientId && !buscandoPaciente;

  // As duas partes do nome, só usadas no modo contato — é o único caminho
  // daqui que CRIA paciente, e é na criação que a separação importa.
  // `form.patientName` continua sendo a junção das duas: é ele que vira o
  // `patient_name` do agendamento e o rótulo no calendário.
  const [partesDoNome, setPartesDoNome] = useState(() =>
    dividirNome(appointment?.patientName ?? defaultPatient?.name ?? contact?.name ?? ""),
  );
  const mudarParte = (parte: "primeiro" | "sobrenome", valor: string) =>
    setPartesDoNome((atual) => {
      const proximo = { ...atual, [parte]: valor };
      const completo = juntarNome(proximo.primeiro, proximo.sobrenome);
      setForm((f) => ({ ...f, patientName: completo }));
      return { ...proximo, completo };
    });

  useEffect(() => {
    if (!open) return;
    setBuscandoPaciente(false);
    setForm({
      patientId: appointment?.patientId ?? defaultPatient?.id,
      patientName: appointment?.patientName ?? defaultPatient?.name ?? "",
      procedureName: appointment?.procedureName ?? "",
      professionalId: appointment?.professionalId ?? "",
      professionalName: appointment?.professionalName ?? "",
      roomId: appointment?.roomId ?? "",
      roomName: appointment?.roomName ?? "",
      date: appointment?.date ?? defaultDate ?? localDateStr(),
      startTime: appointment?.startTime ?? "09:00",
      endTime: appointment?.endTime ?? "10:00",
      status: appointment?.status ?? "pending",
      type: appointment?.type ?? "consultation",
      expectedRevenue: appointment?.expectedRevenue ?? 0,
      actualRevenue: appointment?.actualRevenue ?? null,
      notes: appointment?.notes ?? "",
      generateFinancial: appointment?.generateFinancial ?? true,
    });
    setPartesDoNome(
      dividirNome(appointment?.patientName ?? defaultPatient?.name ?? contact?.name ?? ""),
    );
  }, [open, appointment, defaultDate, defaultPatient?.id, defaultPatient?.name, contact?.name]);

  // A duração é derivada do que está gravado (início e fim), e o fim volta a
  // ser derivado dela sempre que qualquer um dos dois muda. Uma direção só.
  const duracao = durationBetween(form.startTime ?? "09:00", form.endTime ?? "10:00");
  const opcoesDuracao = DURACOES.includes(duracao)
    ? DURACOES
    : [...DURACOES, duracao].sort((a, b) => a - b);

  const mudarDuracao = (min: number) =>
    setForm((f) => ({ ...f, endTime: endTimeFrom(f.startTime ?? "09:00", min) }));

  const mudarInicio = (inicio: string) =>
    setForm((f) => ({ ...f, startTime: inicio, endTime: endTimeFrom(inicio, duracao) }));

  const handleProcedure = (name: string) => {
    const proc = procedures.find((p) => p.name === name);
    if (proc) {
      setForm((f) => ({
        ...f,
        procedureName: name,
        expectedRevenue: proc.price,
        endTime: endTimeFrom(f.startTime ?? "09:00", proc.duration),
      }));
    } else {
      setForm((f) => ({ ...f, procedureName: name }));
    }
  };

  const handleProfessional = (id: string) => {
    const prof = professionals.find((p) => p.id === id);
    setForm((f) => ({ ...f, professionalId: id, professionalName: prof?.name ?? "" }));
  };

  const salaEscolhida = rooms.find((r) => r.id === form.roomId);

  const handleRoom = (id: string) => {
    const room = rooms.find((r) => r.id === id);
    setForm((f) => ({ ...f, roomId: id, roomName: room?.name ?? "" }));
  };

  // "Hoje" pela data local, não por `toISOString`, que usa UTC e faria a
  // agenda considerar o dia seguinte já passado depois das 21h no Brasil.
  const hojeLocal = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const dataNoPassado = Boolean(form.date && form.date < hojeLocal);

  const handleSave = () => {
    if (!form.patientName?.trim()) {
      toast.error("Informe o nome do paciente");
      return;
    }
    // As partes só sobem no modo contato: nos outros o paciente já existe, e
    // reescrever o nome dele a partir de um campo que ninguém editou seria
    // desfazer a separação que o cadastro já tem.
    onSave(form, undefined, modoContato ? partesDoNome : undefined);
  };

  if (!open) return null;

  return (
    // Pop-up centralizado (antes era gaveta lateral): mesmo formulário é
    // aberto tanto pela Agenda quanto pelo chat, e no chat uma gaveta
    // lateral cobriria a conversa que se está lendo pra agendar.
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative flex max-h-[90dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-3xl bg-white"
        style={{ boxShadow: "var(--shadow-4)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5 border-b border-border"
          style={{
            background:
              "linear-gradient(135deg,color-mix(in oklab, var(--pink) 6%, transparent) 0%,color-mix(in oklab, var(--coral) 4%, transparent) 100%)",
          }}
        >
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {isEdit ? "Detalhes do Agendamento" : "Novo Agendamento"}
            </h2>
            {isEdit && (
              <p className="text-sm text-muted-foreground mt-0.5">{appointment?.patientName}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 grid place-items-center rounded-xl text-muted-foreground hover:bg-surface transition-colors"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Consulta ou compromisso — só ao criar pela Agenda. */}
          {!isEdit && onTrocarParaCompromisso && (
            <div className="flex gap-2">
              <Button type="button" variant="premium" className="h-10 flex-1 rounded-full">
                Consulta
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1 rounded-full"
                onClick={onTrocarParaCompromisso}
              >
                Compromisso
              </Button>
            </div>
          )}

          {origin && (
            <p className="rounded-xl bg-coral-soft px-3 py-2 text-xs leading-5 text-coral">
              {origin}
            </p>
          )}

          {/* Data já passada num agendamento novo: é registro retroativo, e a
              tela precisa dizer que ninguém vai ser avisado disso. */}
          {!isEdit && dataNoPassado && (
            <p className="rounded-xl bg-surface px-3 py-2 text-xs leading-5 text-foreground-secondary">
              Esta data já passou. O agendamento entra como registro — o paciente não recebe
              confirmação nem lembretes.
            </p>
          )}

          {/* Confirmar que aconteceu é a ação mais importante deste card, então
              fica no topo — não escondida num select entre outros status.
              Aparece também ao criar com data passada: é assim que se registra
              um atendimento antigo, com o valor cobrado, sem ter de salvar,
              reabrir e confirmar depois. */}
          {(isEdit || dataNoPassado) && (
            <ConfirmCompletion
              expectedRevenue={form.expectedRevenue ?? 0}
              actualRevenue={form.status === "completed" ? (form.actualRevenue ?? 0) : null}
              appointmentDate={form.date ?? localDateStr()}
              generateFinancial={form.generateFinancial ?? true}
              isPending={isSaving}
              onConfirm={({ valor, retornoEm, gerarCobranca }) => {
                // Criando pelo registro retroativo, este é o botão que grava —
                // então a checagem do nome tem de valer aqui também.
                if (!form.patientName?.trim()) {
                  toast.error("Informe o nome do paciente");
                  return;
                }
                onSave(
                  {
                    ...form,
                    status: "completed",
                    actualRevenue: valor,
                    generateFinancial: gerarCobranca,
                  },
                  retornoEm,
                );
              }}
            />
          )}

          {/* Dados do paciente */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Paciente
            </h3>
            <div className="space-y-2">
              <Label htmlFor="patient" className="text-sm text-foreground-secondary">
                Nome do paciente *
              </Label>
              {modoContato ? (
                <>
                  {/* Campos de texto comuns, não o combobox: o nome que veio do
                      WhatsApp quase nunca é o nome da pessoa, e o que se quer
                      aqui é corrigir o que está escrito — não procurar alguém.
                      Separados porque é daqui que a ficha nasce, e a Meta
                      recebe nome e sobrenome como dois hashes distintos. */}
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      id="patient"
                      value={partesDoNome.primeiro}
                      onChange={(e) => mudarParte("primeiro", e.target.value)}
                      placeholder="Nome"
                      className="rounded-xl border-border"
                    />
                    <Input
                      id="patient-sobrenome"
                      aria-label="Sobrenome do paciente"
                      value={partesDoNome.sobrenome}
                      onChange={(e) => mudarParte("sobrenome", e.target.value)}
                      placeholder="Sobrenome"
                      className="rounded-xl border-border"
                    />
                  </div>
                  {/* `relative tap-44` porque o texto sozinho dá 16px de alvo,
                      bem abaixo do mínimo que o resto do app já respeita. */}
                  <button
                    type="button"
                    onClick={() => setBuscandoPaciente(true)}
                    className="relative tap-44 text-xs text-coral underline-offset-2 hover:underline"
                  >
                    Vincular a um paciente existente
                  </button>
                </>
              ) : (
                <PatientCombobox
                  value={form.patientName ?? ""}
                  patientId={form.patientId}
                  onChange={({ id, name }) =>
                    setForm((f) => ({ ...f, patientId: id, patientName: name }))
                  }
                  className="rounded-xl border-border"
                />
              )}
            </div>

            {/* Telefone do WhatsApp, só leitura. É o número da própria conversa,
                então já está correto — aparece para conferência porque é ele que
                vai para a Meta, e um número errado ali é um match perdido. */}
            {!isEdit && contact?.phone && (
              <div className="space-y-1.5 rounded-xl bg-surface px-3 py-2.5">
                <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Telefone do WhatsApp
                </p>
                <p className="font-mono text-sm text-foreground">
                  {formatWhatsappNumber(contact.phone)}
                </p>
                <p className="text-2xs leading-4 text-muted-foreground">
                  Confira antes de salvar: é este número que será enviado à Meta.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="notes_patient" className="text-sm text-foreground-secondary">
                Observações
              </Label>
              <Textarea
                id="notes_patient"
                placeholder="Observações sobre o paciente..."
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="rounded-xl border-border resize-none"
              />
            </div>
          </section>

          {/* Dados do atendimento */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Atendimento
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm text-foreground-secondary">Procedimento</Label>
                <Combobox
                  value={form.procedureName ?? ""}
                  onChange={handleProcedure}
                  options={procedures.map((p) => ({ value: p.name, label: p.name }))}
                  placeholder="Selecionar..."
                  searchPlaceholder="Buscar procedimento..."
                  emptyText="Nenhum procedimento encontrado"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-foreground-secondary">Tipo</Label>
                <select
                  className="w-full text-sm border border-border rounded-xl px-3 py-2 text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-pink/30"
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value as AppointmentType }))
                  }
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-foreground-secondary">Profissional</Label>
                <Combobox
                  value={form.professionalId ?? ""}
                  onChange={handleProfessional}
                  options={professionals.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder="Selecionar..."
                  searchPlaceholder="Buscar profissional..."
                  emptyText="Nenhum profissional encontrado"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="text-sm text-foreground-secondary">Sala</Label>
                <Combobox
                  value={form.roomId ?? ""}
                  onChange={handleRoom}
                  options={rooms.map((r) => ({
                    value: r.id,
                    // A unidade entra no rótulo: é ela que decide a unidade do
                    // agendamento, então precisa estar visível na hora de
                    // escolher — e não escondida no cadastro da cadeira.
                    //
                    // Pelas partes CRUAS, e não concatenando por cima de
                    // `r.name`: quando a sala se chama como a unidade, o nome
                    // saía "Cadeira · NÓS Florianópolis — NÓS Florianópolis".
                    label: rotuloDeSala([r.chairName ?? r.name, r.roomName, r.unitName]),
                  }))}
                  placeholder="Selecionar..."
                  searchPlaceholder="Buscar sala ou unidade..."
                  emptyText="Nenhuma sala encontrada"
                />
                {salaEscolhida?.unitName && (
                  <p className="text-2xs text-muted-foreground">
                    Este agendamento entra na unidade{" "}
                    <span className="font-medium text-foreground-secondary">
                      {salaEscolhida.unitName}
                    </span>
                    .
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Data e horário */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Data e Horário
            </h3>
            {/* Duas colunas no celular, três a partir do tablet.
                Três lado a lado num telefone dá ~95px por campo, e aí duas
                coisas quebram: o Safari reserva uma largura mínima própria
                para `input[type=time]`, que então transborda por cima do
                campo vizinho (a coluna é `minmax(0,1fr)`, então ela não cede),
                e "Confirmado" aparece cortado como "Confirma". O `min-w-0`
                nas células e nos controles é o que autoriza encolher — sem
                ele, item de grade não vai abaixo do próprio conteúdo. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 space-y-2 sm:col-span-3">
                <Label className="text-sm text-foreground-secondary">Data</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full min-w-0 rounded-xl border-border"
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label className="text-sm text-foreground-secondary">Início</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => mudarInicio(e.target.value)}
                  className="w-full min-w-0 rounded-xl border-border"
                />
              </div>
              {/* Duração no lugar do horário de fim. O fim vira consequência,
                  não outro campo para preencher — e é isso que conserta o
                  problema antigo: mudar o início depois de escolher o
                  procedimento mantinha o fim velho, e a consulta encolhia ou
                  esticava sem ninguém ver. */}
              <div className="min-w-0 space-y-2">
                <Label className="text-sm text-foreground-secondary">Duração (min)</Label>
                <select
                  className="w-full min-w-0 text-sm border border-border rounded-xl px-3 py-2 text-foreground bg-white focus:outline-none"
                  value={duracao}
                  onChange={(e) => mudarDuracao(Number(e.target.value))}
                >
                  {opcoesDuracao.map((min) => (
                    <option key={min} value={min}>
                      {min}
                    </option>
                  ))}
                </select>
              </div>
              {/* No celular o Status ocupa a linha inteira: é o rótulo mais
                  longo dos três e o único que perde sentido cortado. */}
              <div className="col-span-2 min-w-0 space-y-2 sm:col-span-1">
                <Label className="text-sm text-foreground-secondary">Status</Label>
                <select
                  className="w-full min-w-0 text-sm border border-border rounded-xl px-3 py-2 text-foreground bg-white focus:outline-none"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as AppointmentStatus }))
                  }
                >
                  {/* Já concluído entra na lista só para o select ter o que
                      exibir — sem isso ele apareceria em branco. Não é uma
                      opção nova: quem ainda não concluiu não a vê. */}
                  {(form.status === "completed"
                    ? [...STATUS_OPTIONS, "completed" as AppointmentStatus]
                    : STATUS_OPTIONS
                  ).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Confirmação e lembretes (Brevo).
              Desceu para o fim: é acompanhamento, não preenchimento. Ficava
              entre o paciente e o atendimento, empurrando para baixo justamente
              o que se vem editar aqui. */}
          {isEdit && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Confirmação e Lembretes
              </h3>
              <div className="rounded-xl border border-border divide-y divide-surface-muted px-3">
                {NOTIFICATION_KINDS.map((k) => (
                  <NotificationRow
                    key={k.value}
                    label={k.label}
                    kind={k.value}
                    notifications={appointment?.notifications}
                  />
                ))}
              </div>
            </section>
          )}

          {/* A seção Financeiro saiu daqui. O valor previsto continua vindo do
              procedimento escolhido (ver `handleProcedure`) e continua servindo
              de sugestão na confirmação — só não é mais um campo para preencher
              semanas antes de existir cobrança. O interruptor de recebimento foi
              junto, para dentro do ConfirmCompletion, onde a decisão cabe. */}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 rounded-xl text-white font-semibold"
            style={{ background: "var(--gradient-primary)" }}
          >
            {isSaving ? "Salvando..." : isEdit ? "Salvar alterações" : "Salvar Agendamento"}
          </Button>
        </div>
      </div>
    </div>
  );
}
