export type AppointmentStatus =
  | "confirmed"
  | "pending"
  | "in_progress"
  | "completed"
  | "missed"
  | "cancelled";

export type AppointmentType =
  | "consultation"
  | "evaluation"
  | "procedure"
  | "return"
  | "emergency";

export type ViewMode = "day" | "week" | "month" | "professionals" | "rooms";

export interface Professional {
  id: string;
  name: string;
  specialty: string;
}

export interface Room {
  id: string;
  name: string;
}

export interface Procedure {
  id: string;
  name: string;
  duration: number;
  price: number;
}

export type NotificationKind = "confirmation" | "reminder_day_before" | "reminder_day_of";
export type NotificationChannel = "email" | "sms";
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
