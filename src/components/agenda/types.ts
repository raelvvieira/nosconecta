export type AppointmentStatus =
  | "confirmed"
  | "pending"
  | "in_progress"
  | "completed"
  | "missed"
  | "cancelled";

export type AppointmentType = "consultation" | "evaluation" | "procedure" | "return" | "emergency";

export type ViewMode = "day" | "week" | "month" | "professionals" | "rooms";

export interface Professional {
  id: string;
  name: string;
  specialty: string;
}

export interface Room {
  id: string;
  name: string;
  /** Unidade a que a cadeira pertence. É por ela que o agendamento descobre
   *  sua unidade: cadeira e unidade são a mesma informação dita de dois
   *  jeitos, e pedir as duas separadas abriria espaço para se contradizerem. */
  unitId?: string | null;
  /** Nome da unidade, para mostrar junto do nome da cadeira na escolha. */
  unitName?: string | null;
  /** Cadeira e sala CRUAS, separadas do `name` — que já vem com as duas
   *  juntas. O seletor precisa das partes soltas para não repetir a unidade
   *  quando a sala tem o nome dela (ver `rotuloDeSala`). */
  chairName?: string | null;
  roomName?: string | null;
}

export interface Procedure {
  id: string;
  name: string;
  duration: number;
  price: number;
}

export type NotificationKind = "confirmation" | "reminder_day_before" | "reminder_day_of";
export type NotificationChannel = "email" | "sms" | "whatsapp";
export type NotificationStatus = "pending" | "sent" | "failed" | "skipped";

export interface AppointmentNotification {
  kind: NotificationKind;
  channel: NotificationChannel;
  status: NotificationStatus;
  sentAt: string | null;
}

export interface Appointment {
  id: string;
  patientId?: string;
  patientName: string;
  procedureName: string;
  professionalId: string;
  professionalName: string;
  roomId: string;
  roomName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  type: AppointmentType;
  expectedRevenue: number;
  /**
   * Valor cobrado no dia. `null` = atendimento ainda não confirmado como
   * realizado; `0` = foi gratuito. É este valor, e não o previsto, que vai
   * como conversão para a Meta.
   */
  actualRevenue?: number | null;
  notes?: string;
  generateFinancial?: boolean;
  notifications?: AppointmentNotification[];
}

export interface BlockedTime {
  id: string;
  professionalId: string;
  roomId: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
}

export interface WaitingListItem {
  id: string;
  patientName: string;
  procedureName: string;
  daysWaiting: number;
}

export interface AgendaFilters {
  professionalId: string;
  roomId: string;
  type: string;
  status: string;
}
