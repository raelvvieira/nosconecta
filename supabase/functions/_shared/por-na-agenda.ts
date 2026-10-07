// Põe na agenda o horário que a IA fechou.
//
// ── Por que isto é um arquivo separado ─────────────────────────────────────
//
// `atendimento.ts` decide o que responder e nunca escreveu em tabela de
// negócio. Dar a ele a escrita na agenda misturaria duas responsabilidades com
// riscos muito diferentes: errar uma resposta é um texto esquisito, errar aqui
// é uma paciente marcada. Em arquivo próprio, `atendimento.ts` só CHAMA — e a
// prévia da tela, que não passa esta função, continua sem poder marcar nada.
//
// ── O que nasce, e com que status ──────────────────────────────────────────
//
// `pending`, por decisão da clínica em 07/10/2026: aparece na agenda na hora,
// no horário certo, com a cor de não-confirmado. É o que "pendente" já
// significa no sistema. Se a Luna errar, alguém vê antes de virar compromisso.
//
// A ficha de paciente é criada junto, a partir do contato do WhatsApp. Sem ela
// o agendamento fica solto: o histórico do paciente não funciona e o Lead da
// Meta vai sem telefone para casar. Aconteceu com a Carla Patricia, cujo
// agendamento está com `patient_id` nulo até hoje.
import { onlyDigits, variantesDoNumero } from "./phone-match.ts";

export interface VagaParaAgendar {
  date: string;
  hora: string;
  unidadeNome: string;
  /** A cadeira que estava livre nesta hora. Ver o comentário em `porNaAgenda`. */
  salaId?: string | null;
  salaNome?: string | null;
  /** A unidade DA CADEIRA, não a padrão da clínica. */
  unidadeId?: string | null;
}

export interface ContatoDoAgendamento {
  /** O JID da Evolution: `554899522191@s.whatsapp.net`. */
  contactId: string;
  nome: string;
}

/** Quanto tempo reservar. O mesmo padrão do catálogo. */
const DURACAO_PADRAO_MIN = 60;

/** "08:00" + 90 → "09:30". Minuto a minuto, sem `Date`: a conta é de relógio e
 *  não de fuso, e trazer `Date` para cá traria o fuso com ele. */
export function somarMinutos(hora: string, minutos: number): string {
  const [h, m] = String(hora ?? "")
    .split(":")
    .map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hora;
  const total = h * 60 + m + minutos;
  // Vira o dia: 23:30 + 90 daria 25:00. A agenda não atende às 25h, então
  // aparar em 23:59 deixa o agendamento visível e visivelmente errado, em vez
  // de gravar uma hora que o Postgres recusa.
  const limitado = Math.min(total, 23 * 60 + 59);
  const hh = Math.floor(limitado / 60);
  const mm = limitado % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * O telefone do JID da Evolution, em dígitos.
 *
 * `554899522191@s.whatsapp.net` → `554899522191`. O `:12` que a Evolution às
 * vezes põe antes do arroba é identificador de dispositivo, não parte do
 * telefone, e por isso é cortado ANTES de tirar os não-dígitos.
 */
export function telefoneDoContato(contactId: string): string {
  const antes = String(contactId ?? "").split("@")[0] ?? "";
  return onlyDigits(antes.split(":")[0] ?? "");
}

export interface Resultado {
  criado: boolean;
  motivo: string;
  appointmentId?: string;
}

/**
 * Cria a ficha (se não houver), o agendamento pendente, e dispara o Lead.
 *
 * Devolve o motivo em vez de lançar: um erro aqui não pode derrubar o envio da
 * resposta, que já aconteceu. O pior caso é a conversa seguir com o
 * agendamento não registrado e o motivo no log — exatamente o que acontecia
 * antes disto existir, e nunca pior.
 */
export async function porNaAgenda(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  vaga: VagaParaAgendar,
  contato: ContatoDoAgendamento,
  procedimento: {
    id: string | null;
    nome: string;
    preco: number | null;
    duracaoMin: number | null;
  },
): Promise<Resultado> {
  const telefone = telefoneDoContato(contato.contactId);
  if (!telefone) return { criado: false, motivo: "contato sem telefone" };

  // ── A unidade vem da VAGA, não do cadastro ──────────────────────────────
  //
  // A vaga foi calculada a partir de uma cadeira, e a cadeira pertence a uma
  // unidade. A clínica tem duas (Florianópolis e Porto Alegre), então pegar "a
  // padrão" acerta metade das vezes — e o endereço que a Luna deu na conversa
  // é o da unidade da vaga, não o da padrão.
  //
  // Cai no padrão só quando a vaga não trouxe unidade, o que hoje não
  // acontece: se acontecer, é melhor um agendamento na unidade errada do que
  // uma paciente que chega e não está marcada.
  let unitId = vaga.unidadeId ? String(vaga.unidadeId) : null;
  if (!unitId) {
    const { data: unidade } = await supabase
      .from("clinic_units")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    unitId = unidade?.id ? String(unidade.id) : null;
  }
  if (!unitId) return { criado: false, motivo: "nenhuma unidade ativa" };

  // ── O profissional, quando há só um ─────────────────────────────────────
  //
  // Não é enfeite: na agenda, sala e profissional são FILTROS. Um agendamento
  // sem profissional desaparece da tela de quem está filtrando pela Dra.
  // Mariane — e ninguém descobre que a Luna marcou alguém.
  //
  // Só preenche quando há exatamente um ativo. Com dois, escolher seria
  // adivinhar qual deles vai atender.
  const { data: profissionais } = await supabase
    .from("professionals")
    .select("id, name")
    .eq("owner_id", ownerId)
    .eq("active", true)
    .limit(2);
  const unico = (profissionais ?? []).length === 1 ? profissionais[0] : null;

  // ── Já existe agendamento desta pessoa neste horário? ───────────────────
  //
  // A guarda que importa. A IA pode responder duas vezes ao mesmo bloco de
  // mensagens (aconteceu em 29/09, três respostas concorrentes), e cada uma
  // devolveria o mesmo código de horário. Sem isto, a paciente apareceria duas
  // ou três vezes na agenda no mesmo minuto.
  const { data: jaTem } = await supabase
    .from("appointments")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("date", vaga.date)
    .eq("start_time", vaga.hora)
    .ilike("patient_name", contato.nome)
    .maybeSingle();
  if (jaTem?.id) {
    return { criado: false, motivo: "já estava na agenda", appointmentId: String(jaTem.id) };
  }

  // A ficha, se ainda não houver uma com este telefone.
  // `variantesDoNumero` e não `.eq`: o JID da Evolution veio com 12 dígitos
  // (554899522191) e as fichas da base têm 13 (5551991931339). É o nono dígito
  // do celular brasileiro. Buscar pelo número cru acharia zero fichas e criaria
  // ficha duplicada para quem já é paciente — e é o mesmo problema que o
  // `meta-capi` resolve com esta função.
  let patientId: string | null = null;
  const { data: paciente } = await supabase
    .from("patients")
    .select("id")
    .eq("owner_id", ownerId)
    .in("phone", variantesDoNumero(telefone))
    .limit(1)
    .maybeSingle();
  if (paciente?.id) {
    patientId = String(paciente.id);
  } else {
    const { data: nova, error } = await supabase
      .from("patients")
      .insert({ owner_id: ownerId, name: contato.nome, phone: telefone })
      .select("id")
      .maybeSingle();
    // Ficha que não nasce não impede o agendamento: melhor a consulta na agenda
    // sem ficha do que a paciente chegando sem nada marcado.
    if (!error && nova?.id) patientId = String(nova.id);
  }

  const duracao = procedimento.duracaoMin ?? DURACAO_PADRAO_MIN;
  const { data: criado, error: erroAg } = await supabase
    .from("appointments")
    .insert({
      owner_id: ownerId,
      unit_id: unitId,
      patient_id: patientId,
      patient_name: contato.nome,
      procedure_id: procedimento.id,
      procedure_name: procedimento.nome,
      // A CADEIRA. Sem ela o horário não fica ocupado no cálculo seguinte, e a
      // próxima pessoa que escrever recebe o mesmo horário que já foi dado —
      // `vagasLivres` trata bloqueio sem sala como "a unidade inteira", mas
      // agendamento sem sala simplesmente não ocupa nada.
      room_id: vaga.salaId ? String(vaga.salaId) : null,
      room_name: vaga.salaNome ? String(vaga.salaNome) : null,
      professional_id: unico?.id ? String(unico.id) : null,
      professional_name: unico?.name ? String(unico.name) : null,
      date: vaga.date,
      start_time: vaga.hora,
      end_time: somarMinutos(vaga.hora, duracao),
      status: "pending",
      type: "consultation",
      expected_revenue: procedimento.preco ?? 0,
      generate_financial: true,
      notes: `Agendado pela Luna na conversa do WhatsApp. Horário ${vaga.hora} de ${vaga.date}, confirmado pela paciente. Confira antes de marcar como confirmado.`,
    })
    .select("id")
    .maybeSingle();
  if (erroAg || !criado?.id) {
    return { criado: false, motivo: `falha ao criar: ${erroAg?.message ?? "sem id"}` };
  }

  // ── O Lead da Meta ──────────────────────────────────────────────────────
  //
  // O app dispara isto ao salvar agendamento (`agenda.functions.ts`), e quem
  // marca aqui não passa por lá. Sem esta chamada, todo agendamento fechado
  // pela Luna — justamente os que vêm de anúncio — ficaria fora do retorno da
  // campanha. É o mesmo POST que o app faz.
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && chave) {
      await fetch(`${url}/functions/v1/meta-capi`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${chave}` },
        body: JSON.stringify({
          ownerId,
          action: "dispatch",
          systemEvent: "appointment.created",
          context: {
            entityId: String(criado.id),
            patientId,
            contactName: contato.nome,
            status: "pending",
          },
        }),
      });
    }
  } catch (e) {
    // Indisponibilidade da Meta não desfaz um agendamento que já existe.
    console.error("[luna] falha ao disparar Lead do agendamento:", e);
  }

  return { criado: true, motivo: "criado", appointmentId: String(criado.id) };
}
