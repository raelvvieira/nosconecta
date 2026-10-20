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
  /** A unidade padrão da clínica — a que atende todos os dias. A tela não
   *  mostra calendário para ela: o que não estiver marcado nas outras é dela. */
  principal: boolean;
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
      principal: u.is_default === true,
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

/** Teto de dias guardados por unidade. Uma viagem tem alguns dias; mil linhas
 *  aqui seria um clique preso ou um engano, e os dois acabam na mesma tela
 *  ilegível. */
const MAXIMO_DE_DIAS = 400;

/**
 * Troca os dias de atendimento de uma unidade pelos que vieram.
 *
 * ── Por que o conjunto inteiro, e não "adiciona" e "remove" ───────────────
 *
 * Porque o que a tela tem é um calendário, e um calendário tem um conjunto de
 * dias selecionados. Mandar o conjunto faz a tela e o banco dizerem a mesma
 * coisa depois de cada clique; mandar diferenças faria dois cliques rápidos
 * chegarem fora de ordem e deixarem um dia marcado que ninguém marcou.
 *
 * Só os dias de HOJE para a frente são trocados. Os que já passaram ficam como
 * estão: são o registro de uma viagem que aconteceu, e a agenda não os olha.
 */
export const definirDiasDaUnidade = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { unitId: string; dates: string[] }) => {
    if (!input.unitId?.trim()) throw new Error("Unidade inválida.");
    const hoje = hojeNaClinica();
    const dates = [...new Set((input.dates ?? []).map((d) => String(d ?? "").trim()))]
      .filter((d) => PADRAO_DE_DATA.test(d))
      // Dia que já passou não entra: a agenda só olha para a frente, e a linha
      // ficaria na tabela sem efeito nenhum.
      .filter((d) => d >= hoje)
      .sort();
    if (dates.length > MAXIMO_DE_DIAS) throw new Error("Dias demais marcados de uma vez.");
    return { unitId: input.unitId.trim(), dates };
  })
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = context.supabase;
    const hoje = hojeNaClinica();

    // Marcar dia é o que DEFINE a unidade como de viagem. Sem esta linha, uma
    // unidade cadastrada aberta de segunda a sábado continuaria com vaga em
    // todo dia do calendário, e os dias marcados não teriam efeito nenhum —
    // que é exatamente o defeito que esta tela existe para fechar.
    const modo = await supabase
      .from("clinic_units")
      .update({ schedule_mode: "by_date", updated_at: new Date().toISOString() })
      .eq("id", data.unitId)
      .eq("owner_id", context.ownerId);
    if (modo.error) throw new Error(modo.error.message);

    const atuais = await supabase
      .from("clinic_unit_dates")
      .select("id, date")
      .eq("owner_id", context.ownerId)
      .eq("unit_id", data.unitId)
      .gte("date", hoje);
    if (atuais.error) throw new Error(atuais.error.message);

    const tem = new Map<string, string>(
      ((atuais.data ?? []) as Record<string, unknown>[]).map((r) => [
        String(r.date).slice(0, 10),
        String(r.id),
      ]),
    );
    const querem = new Set(data.dates);

    const sair = [...tem.entries()].filter(([date]) => !querem.has(date)).map(([, id]) => id);
    const entrar = data.dates.filter((date) => !tem.has(date));

    if (sair.length) {
      // A consulta já marcada naquele dia NÃO sai junto: ela existe, a paciente
      // foi avisada, e desmarcar o dia da viagem não desmarca ninguém. O que
      // muda é a Luna parar de oferecer horário novo ali.
      const { error } = await supabase
        .from("clinic_unit_dates")
        .delete()
        .eq("owner_id", context.ownerId)
        .in("id", sair);
      if (error) throw new Error(error.message);
    }

    if (entrar.length) {
      const { error } = await supabase.from("clinic_unit_dates").insert(
        entrar.map((date) => ({
          owner_id: context.ownerId,
          unit_id: data.unitId,
          date,
        })),
      );
      if (error) throw new Error(error.message);
    }

    return { ok: true, marcados: data.dates.length };
  });
