// A agenda, do banco para a instrução do agente.
//
// O cálculo puro mora em `vagas.ts`. Aqui fica só o I/O: quatro leituras, uma
// chamada e o resultado no formato que a instrução espera. A separação é o que
// permite exercitar os casos que doem sem banco nenhum — ver `tests/vagas.ts`.
import {
  escolherMomentos,
  somarDias,
  vagasLivres,
  type Jornada,
  type ModoDoDia,
  type Ocupado,
  type Sala,
} from "./vagas.ts";
import type { HorariosParaOferecer } from "./instrucao-do-agente.ts";

/**
 * Quanto tempo reservar para uma avaliação.
 *
 * Constante, e é uma decisão pendente: o manual da Luna lista "duração de cada
 * avaliação" entre os itens que a clínica ainda não definiu. Sessenta minutos é
 * o mesmo padrão de `clinic_procedures.duration_minutes`, então erra junto com o
 * resto do sistema em vez de inventar um número novo.
 */
export const DURACAO_DA_AVALIACAO = 60;

/** De quanto em quanto tempo uma vaga pode começar. */
const PASSO_MIN = 30;

/** Até onde olhar. É a última faixa de preferência da clínica. */
const DIAS_A_FRENTE = 15;

/**
 * Antecedência mínima. Uma hora.
 *
 * "Tenho hoje às 15h" mandado às 14h50 não é oferta: é um horário que a pessoa
 * não tem como cumprir, e a falta que vem depois parece culpa dela.
 */
const ANTECEDENCIA_MIN = 60;

/** Quantos horários a IA propõe de uma vez. Regra do manual: dois. */
const QUANTOS_OFERECER = 2;

const TZ = "America/Sao_Paulo";

/** Data e hora AGORA no fuso da clínica. `en-CA` porque seu formato de data já é
 *  YYYY-MM-DD — mesma técnica de `automation-scheduled` e de `src/lib/date.ts`. */
export function agoraNaClinica(quando: Date = new Date()): { date: string; hora: string } {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(quando);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(quando);
  return { date, hora };
}

/**
 * Os horários que a IA pode oferecer nesta conversa.
 *
 * **Falha fechada.** Qualquer erro de leitura devolve `null`, e `null` na
 * instrução significa "não consultei a agenda, não fale de horário" — nunca
 * "não há vaga". Um banco instável não pode virar "estamos sem horário" na cara
 * de quem quer marcar.
 */
export async function horariosParaOferecer(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  quando: Date = new Date(),
): Promise<HorariosParaOferecer | null> {
  const agora = agoraNaClinica(quando);
  const ate = somarDias(agora.date, DIAS_A_FRENTE);

  try {
    const [jornada, cadeiras, consultas, bloqueios] = await Promise.all([
      supabase
        .from("clinic_business_hours")
        .select("unit_id, weekday, modo, opens_at, closes_at")
        .eq("owner_id", ownerId),
      supabase
        .from("clinic_chairs")
        .select("id, name, unit_id, active, clinic_units(name, active)")
        .eq("owner_id", ownerId)
        .eq("active", true),
      supabase
        .from("appointments")
        .select("date, start_time, end_time, room_id, unit_id, status")
        .eq("owner_id", ownerId)
        .neq("status", "cancelled")
        .gte("date", agora.date)
        .lte("date", ate),
      supabase
        .from("blocked_times")
        .select("date, start_time, end_time, room_id, unit_id")
        .eq("owner_id", ownerId)
        .gte("date", agora.date)
        .lte("date", ate),
    ]);

    const erro = jornada.error ?? cadeiras.error ?? consultas.error ?? bloqueios.error;
    if (erro) {
      console.warn("[agenda-da-clinica] não deu para ler a agenda:", erro.message);
      return null;
    }

    // Sem jornada configurada não há como saber o que é horário de atendimento,
    // e `vagasLivres` trataria todo dia como fechado — devolvendo "não há vaga",
    // que é uma afirmação forte demais para uma configuração que falta.
    const jornadas: Jornada[] = (jornada.data ?? []).map((j: Record<string, unknown>) => ({
      unidadeId: String(j.unit_id),
      weekday: Number(j.weekday),
      modo: String(j.modo) as ModoDoDia,
      abre: j.opens_at ? String(j.opens_at) : null,
      fecha: j.closes_at ? String(j.closes_at) : null,
    }));
    if (!jornadas.length) {
      console.warn("[agenda-da-clinica] jornada não configurada; agenda tratada como desconhecida");
      return null;
    }

    const salas: Sala[] = (cadeiras.data ?? [])
      // Cadeira de unidade desativada sai: ela existe no cadastro e não atende.
      .filter((c: Record<string, any>) => c.clinic_units?.active !== false)
      .map((c: Record<string, any>) => ({
        id: String(c.id),
        nome: String(c.name ?? "Cadeira"),
        unidadeId: String(c.unit_id),
        unidadeNome: String(c.clinic_units?.name ?? "").trim() || "a clínica",
      }));
    if (!salas.length) return null;

    const ocupados: Ocupado[] = [...(consultas.data ?? []), ...(bloqueios.data ?? [])].map(
      (o: Record<string, unknown>) => ({
        date: String(o.date),
        inicio: String(o.start_time ?? "00:00").slice(0, 5),
        fim: String(o.end_time ?? "23:59").slice(0, 5),
        salaId: o.room_id ? String(o.room_id) : null,
        unidadeId: o.unit_id ? String(o.unit_id) : null,
      }),
    );

    const { vagas, diasSobConsulta } = vagasLivres({
      jornadas,
      salas,
      ocupados,
      duracaoMin: DURACAO_DA_AVALIACAO,
      de: agora.date,
      dias: DIAS_A_FRENTE,
      passoMin: PASSO_MIN,
      // Teto generoso: o corte de verdade é `escolherMomentos`, e cortar antes
      // esconderia os dias mais distantes justamente quando são os únicos.
      maximo: 4000,
      agoraNoPrimeiroDia: agora.hora,
      antecedenciaMin: ANTECEDENCIA_MIN,
    });

    const escolha = escolherMomentos(vagas, agora, QUANTOS_OFERECER);

    // A CADEIRA vai junto, e a unidade também.
    //
    // `vagas.ts` diz, no comentário de `vagasLivres`: "uma vaga por (dia, hora,
    // sala) […] quem grava usa a sala que veio junto". A primeira versão desta
    // função jogava as duas fora e devolvia só data, hora e nome da unidade —
    // o que bastava para a IA OFERECER e não para o sistema GRAVAR.
    //
    // Sem a sala, um agendamento criado pela IA não ocupa cadeira nenhuma: a
    // vaga continua livre no cálculo seguinte e a próxima pessoa recebe o mesmo
    // horário. Sem a unidade, ele cai na unidade padrão — e são duas, então
    // metade das vezes na errada.
    const simples = (m: {
      date: string;
      hora: string;
      vagas: { salaId: string; salaNome: string; unidadeId: string; unidadeNome: string }[];
    }) => {
      // A primeira cadeira livre. Quando há duas, qualquer uma serve; o que não
      // serve é nenhuma.
      const v = m.vagas[0];
      return {
        date: m.date,
        hora: m.hora,
        unidadeNome: v?.unidadeNome ?? "a clínica",
        salaId: v?.salaId ?? null,
        salaNome: v?.salaNome ?? null,
        unidadeId: v?.unidadeId ?? null,
      };
    };

    return {
      paraOferecer: escolha.paraOferecer.map(simples),
      reserva: escolha.reserva.map(simples),
      faixa: escolha.faixa,
      diasSobConsulta,
    };
  } catch (e) {
    console.warn("[agenda-da-clinica] falhou:", e instanceof Error ? e.message : e);
    return null;
  }
}
