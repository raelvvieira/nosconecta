import type { PatientAppointment, PatientDetail } from "@/lib/patients/patients.functions";
import type { ProntuarioDoPaciente } from "@/lib/patients/clinical-record.functions";
import type { RecentRecipient } from "./broadcast.functions";

/**
 * O que o painel do contato mostra — decidido aqui, longe do JSX.
 *
 * ── Por que isto é uma função pura, e não `&&` espalhado na tela ──────────
 *
 * O painel tem nove seções e duas pessoas muito diferentes para atender: um
 * PACIENTE, de quem se sabe agenda, tratamento, financeiro e prontuário; e um
 * LEAD, de quem se sabe um nome e um telefone. Escrever isso como condição
 * dentro do componente daria nove `&&` aninhados, e a regra que mais importa —
 * *o que NÃO aparece* — ficaria impossível de conferir sem abrir o navegador.
 *
 * ── A regra que atravessa tudo: ausência não é zero ──────────────────────
 *
 * Todo número que a clínica não tem vira `null`, e a tela desenha travessão.
 * "R$ 0,00 em atraso" e "não há financeiro registrado" contam histórias
 * opostas: a primeira diz que está tudo pago, a segunda que ninguém lançou
 * nada. Trocar uma pela outra faria a recepção cobrar quem não deve, ou deixar
 * de cobrar quem deve. Mesma regra do `PainelDoFunil`.
 *
 * ── E seção sem conteúdo não é renderizada ───────────────────────────────
 *
 * Na referência que originou este painel, metade das seções fica vazia com um
 * "+" ao lado, e cada uma custa uma linha de altura em toda conversa. Aqui,
 * quando não há o que dizer, a seção não existe: o painel de um lead é curto
 * porque a informação é curta, e não porque foi escondida.
 */

export interface Painel {
  /** Paciente de verdade, ou só um contato do WhatsApp. */
  ehPaciente: boolean;
  /** Faixa no topo. Só existe com valor a vencer já vencido. */
  atraso: number | null;
  /** Telefone, e-mail, nascimento, CPF, paciente desde. Sempre presente —
   *  para um lead vem quase tudo em travessão, e isso é informação. */
  dados: LinhaDeDado[];
  agenda: { proxima: PatientAppointment | null; ultima: PatientAppointment | null } | null;
  tratamento: { nome: string; feitas: number; total: number } | null;
  financeiro: { atraso: number | null; aReceber: number | null; pago: number | null } | null;
  campanha: { quando: string; naFila: boolean } | null;
  prontuario: { alergias: string | null; ultimaEvolucao: EvolucaoResumida | null } | null;
}

export interface LinhaDeDado {
  rotulo: string;
  /** `null` = a clínica não tem esse dado. A tela desenha travessão. */
  valor: string | null;
}

export interface EvolucaoResumida {
  quando: string;
  profissional: string | null;
  texto: string;
}

export interface EntradaDoPainel {
  /** Nome e telefone que o CRM conhece — o que existe mesmo sem paciente. */
  contato: { nome: string | null; telefone: string | null };
  paciente: PatientDetail | null;
  prontuario: ProntuarioDoPaciente | null;
  campanha: RecentRecipient | null;
}

/** Zero é um valor legítimo em quase tudo, menos aqui: `0` significa "nada
 *  lançado", e mostrar "R$ 0,00" o afirmaria como fato. */
const dinheiro = (v: number | null | undefined): number | null =>
  typeof v === "number" && v > 0 ? v : null;

const texto = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

const MAX_EVOLUCAO = 220;

export function montarPainel(entrada: EntradaDoPainel): Painel {
  const p = entrada.paciente;
  const ehPaciente = Boolean(p);

  const dados: LinhaDeDado[] = [
    // O telefone do paciente ganha do telefone do CRM: quem digitou na ficha
    // sabia mais do que o CRM sabe. Mesma precedência de `resolverPacienteDoContato`.
    { rotulo: "Telefone", valor: texto(p?.phone) ?? texto(entrada.contato.telefone) },
    { rotulo: "E-mail", valor: texto(p?.email) },
    { rotulo: "Nascimento", valor: nascimento(p?.birthDate ?? null, p?.age ?? null) },
    { rotulo: "CPF", valor: texto(p?.cpf) },
    { rotulo: "Paciente desde", valor: p?.createdAt ? dia(p.createdAt) : null },
  ];

  return {
    ehPaciente,
    atraso: dinheiro(p?.overdueAmount),
    dados,

    // Agenda e financeiro só existem para paciente. Um card "nenhuma consulta"
    // em toda conversa de lead é ruído que não vira decisão nenhuma.
    agenda: p ? { proxima: p.nextAppointment, ultima: p.lastAppointment } : null,

    // Tratamento sem total de sessões não desenha barra: uma barra sobre um
    // denominador desconhecido mostraria progresso inventado.
    tratamento:
      p && texto(p.treatmentName) && p.totalSessions > 0
        ? {
            nome: p.treatmentName as string,
            feitas: Math.min(p.completedSessions, p.totalSessions),
            total: p.totalSessions,
          }
        : null,

    financeiro: p
      ? {
          atraso: dinheiro(p.overdueAmount),
          aReceber: dinheiro(p.pendingAmount),
          pago: dinheiro(p.receivedAmount),
        }
      : null,

    campanha: entrada.campanha
      ? { quando: entrada.campanha.sentAt, naFila: entrada.campanha.naFila }
      : null,

    prontuario: resumoDoProntuario(p, entrada.prontuario),
  };
}

/**
 * Alergia e a última evolução.
 *
 * `indisponivel` é o caso em que a migration do prontuário ainda não rodou —
 * a lista vem vazia e não significa "não há evolução", significa "não dá para
 * saber". Some, em vez de afirmar o contrário do que se sabe.
 */
function resumoDoProntuario(
  p: PatientDetail | null,
  pr: ProntuarioDoPaciente | null,
): Painel["prontuario"] {
  if (!p) return null;
  const alergias = texto(p.allergyNotes);
  const indisponivel = pr?.indisponivel === true;
  const ultima = !indisponivel ? (pr?.evolucoes?.[0] ?? null) : null;

  const evolucao: EvolucaoResumida | null =
    ultima && texto(ultima.body)
      ? {
          quando: ultima.createdAt,
          profissional: texto(ultima.professionalName),
          texto: cortar(ultima.body.trim(), MAX_EVOLUCAO),
        }
      : null;

  // Sem alergia e sem evolução não sobra card nenhum — só um título.
  if (!alergias && !evolucao) return null;
  return { alergias, ultimaEvolucao: evolucao };
}

/** Corta no fim de palavra, não no meio: "…extração do sisso su…" lido às
 *  pressas vira outra frase. */
export function cortar(t: string, max: number): string {
  if (t.length <= max) return t;
  const bruto = t.slice(0, max);
  const espaco = bruto.lastIndexOf(" ");
  return `${(espaco > max * 0.6 ? bruto.slice(0, espaco) : bruto).trimEnd()}…`;
}

function nascimento(data: string | null, idade: number | null): string | null {
  if (!data) return null;
  const formatada = dia(data);
  return idade === null ? formatada : `${formatada} · ${idade} anos`;
}

function dia(iso: string): string {
  // `T00:00:00` sem fuso: uma data pura interpretada como UTC volta um dia no
  // Brasil, e o aniversário de alguém apareceria na véspera.
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}
