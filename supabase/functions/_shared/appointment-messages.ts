export type NotificationKind = "confirmation" | "reminder_day_before" | "reminder_day_of";

export interface AppointmentMessageInput {
  patientName: string;
  procedureName: string;
  professionalName: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
}

function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export interface AppointmentMessage {
  subject: string;
  html: string;
  sms: string;
  // Params for the Meta-approved WhatsApp template of this kind (see
  // supabase/functions/_shared/brevo.ts and the "Notificações" admin page
  // for the template text these placeholders fill in).
  whatsappParams: Record<string, string>;
}

export function buildAppointmentMessage(
  kind: NotificationKind,
  a: AppointmentMessageInput,
): AppointmentMessage {
  const dateFmt = formatDateBR(a.date);
  const firstName = a.patientName.split(" ")[0] || a.patientName;

  const details = `
    <ul>
      <li><b>Procedimento:</b> ${a.procedureName}</li>
      <li><b>Profissional:</b> ${a.professionalName}</li>
      <li><b>Data:</b> ${dateFmt}</li>
      <li><b>Horário:</b> ${a.startTime}</li>
    </ul>
  `;

  const whatsappParams = {
    FNAME: firstName,
    PROCEDURE: a.procedureName,
    DATE: dateFmt,
    TIME: a.startTime,
  };

  if (kind === "confirmation") {
    return {
      subject: `Agendamento confirmado — ${dateFmt} às ${a.startTime}`,
      html: `<p>Olá, ${firstName}!</p><p>Seu agendamento foi confirmado:</p>${details}<p>Até breve!</p>`,
      sms: `NOS Conecta: agendamento confirmado para ${dateFmt} as ${a.startTime} (${a.procedureName}).`,
      whatsappParams,
    };
  }

  if (kind === "reminder_day_before") {
    return {
      subject: `Lembrete: seu atendimento é amanhã (${dateFmt})`,
      html: `<p>Olá, ${firstName}!</p><p>Passando para lembrar que seu atendimento é amanhã:</p>${details}<p>Até lá!</p>`,
      sms: `NOS Conecta: lembrete - seu atendimento e amanha ${dateFmt} as ${a.startTime}.`,
      whatsappParams,
    };
  }

  return {
    subject: `Hoje é o dia do seu atendimento!`,
    html: `<p>Olá, ${firstName}!</p><p>Hoje é o dia do seu atendimento:</p>${details}<p>Te esperamos!</p>`,
    sms: `NOS Conecta: hoje e o dia do seu atendimento, as ${a.startTime}. Te esperamos!`,
    whatsappParams,
  };
}
