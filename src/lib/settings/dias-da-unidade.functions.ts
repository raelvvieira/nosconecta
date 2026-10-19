import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";

/**
 * Os dias em que uma unidade de viagem atende.
 *
 * ── Por que esta tela existe ──────────────────────────────────────────────
 *
 * A clínica tem duas unidades, e a Dra. Mariane viaja de Florianópolis a Porto
 * Alegre de tempo em tempo para atender lá. As duas estão cadastradas abertas
 * de segunda a sábado — então, para o sistema, havia vaga livre em Porto
 * Alegre em todo dia do calendário.
 *
 * Isso não aparecia em lugar nenhum enquanto a Luna não perguntava a cidade.
 * No dia em que ela passou a perguntar, passou a importar: confirmada "sou de
 * Porto Alegre", ela ofereceria terça às 10h num dia em que ninguém está lá.
 *
 * `clinic_business_hours` não resolve: é por dia da SEMANA, e viagem é por
 * DATA. Daí a tabela `clinic_unit_dates` e a coluna `schedule_mode`.
 *
 * ── Por que é por data e não bloqueio ─────────────────────────────────────
 *
 * Bloquear os dias em que ela NÃO está seria uma linha por dia, para sempre, e
 * um esquecimento vira paciente marcado numa cidade vazia. Marcar os dias em
 * que ela ESTÁ é uma linha por viagem, e o esquecimento erra para o lado
 * seguro: a Luna diz que confirma as próximas datas com a equipe.
 */

export interface DiaDaUnidade {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  note: string;
}

export interface UnidadeComDias {
  id: string;
  nome: string;
  endereco: string;
  /** `true` = só atende nas datas abaixo (`schedule_mode = 'by_date'`). */
  porData: boolean;
  /** As datas de hoje para a frente, em ordem. As passadas não entram: a tela é
   *  para marcar a próxima viagem, e uma lista com dois anos de histórico
   *  esconde justamente o que importa. */
  dias: DiaDaUnidade[];
}

/** Dia no fuso da clínica, "YYYY-MM-DD". `en-CA` porque seu formato de data já
 *  é esse — mesma técnica de `src/lib/date.ts`. */
function hojeNaClinica(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const PADRAO_DE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export const listarDiasDasUnidades = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<UnidadeComDias[]> => {
    // `any` porque `types.ts` só conhece a coluna e a tabela novas depois que o
    // Lovable regenerar a partir da migration — mesmo escape do resto do
    // projeto até lá.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = context.supabase;
    const hoje = hojeNaClinica();

    const [unidades, datas] = await Promise.all([
      supabase
        .from("clinic_units")
        .select("id, name, address, schedule_mode, is_default")
        .eq("owner_id", context.ownerId)
        .eq("active", true)
        .order("is_default", { ascending: false }),
      supabase
        .from("clinic_unit_dates")
        .select("id, unit_id, date, note")
        .eq("owner_id", context.ownerId)
        .gte("date", hoje)
        .order("date"),
    ]);
    if (unidades.error) throw new Error(unidades.error.message);
    if (datas.error) throw new Error(datas.error.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((unidades.data ?? []) as any[]).map((u) => ({
      id: String(u.id),
      nome: String(u.name ?? "").trim(),
      endereco: u.address ?? "",
      porData: String(u.schedule_mode ?? "weekly") === "by_date",
      dias: ((datas.data ?? []) as Record<string, unknown>[])
        .filter((d) => String(d.unit_id) === String(u.id))
        .map((d) => ({
          id: String(d.id),
          date: String(d.date).slice(0, 10),
          note: String(d.note ?? ""),
        })),
    }));
  });

export const definirModoDaUnidade = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { unitId: string; porData: boolean }) => {
    if (!input.unitId?.trim()) throw new Error("Unidade inválida.");
    return { unitId: input.unitId.trim(), porData: input.porData === true };
  })
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("clinic_units")
      .update({
        schedule_mode: data.porData ? "by_date" : "weekly",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.unitId)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adicionarDiaDaUnidade = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { unitId: string; date: string; note?: string | null }) => {
    if (!input.unitId?.trim()) throw new Error("Unidade inválida.");
    const date = String(input.date ?? "").trim();
    if (!PADRAO_DE_DATA.test(date)) throw new Error("Escolha uma data.");
    // Marcar um dia que já passou não faz nada acontecer: a agenda só olha de
    // hoje para a frente. Recusar aqui evita a linha que ninguém entende depois.
    if (date < hojeNaClinica()) throw new Error("Essa data já passou.");
    return {
      unitId: input.unitId.trim(),
      date,
      note: String(input.note ?? "")
        .trim()
        .slice(0, 120),
    };
  })
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = context.supabase;
    const { error } = await supabase.from("clinic_unit_dates").insert({
      owner_id: context.ownerId,
      unit_id: data.unitId,
      date: data.date,
      note: data.note || null,
    });
    if (error) {
      const { ehChaveDuplicada } = await import("@/lib/finance/erro-do-banco");
      // O índice único existe para a mesma data não virar duas linhas iguais na
      // tela. Quem clicou duas vezes não fez nada de errado.
      if (ehChaveDuplicada(error)) throw new Error("Esse dia já está marcado.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const removerDiaDaUnidade = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => {
    if (!input.id?.trim()) throw new Error("Dia inválido.");
    return { id: input.id.trim() };
  })
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = context.supabase;
    // A consulta já marcada naquele dia NÃO sai junto: ela existe, a paciente
    // foi avisada, e apagar o dia da viagem não desmarca ninguém. O que muda é
    // a Luna parar de oferecer horário novo ali.
    const { error } = await supabase
      .from("clinic_unit_dates")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
