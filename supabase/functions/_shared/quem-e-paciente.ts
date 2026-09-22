// "Essa pessoa já é paciente?" — para o agente, e para o aprendizado.
//
// ── Por que `patients.crm_contact_id`, e não as outras três ─────────────
//
// Há quatro maneiras de responder isso nesta base, e elas não concordam:
//
//   `wa_contacts.patient_id` — a coluna existe exatamente para isto, tem
//   índice e 690 linhas preenchidas. Parece a escolha óbvia. **Nada no código
//   a escreve**: foi um backfill que congelou. Uma ficha criada hoje pelo
//   botão "Criar ficha de paciente" não aparece ali — o filtro deixaria a IA
//   responder justamente os pacientes mais novos, que são os que mais têm
//   assunto em aberto.
//
//   `funnel_cards.patient_id` — só quem tem card. O funil tem zero.
//
//   Telefone normalizado — a rede mais larga e a mais cara: `patients.phone` é
//   texto formatado ("+55 (51) 99335-1821") e `phone_e164` é dígito puro, então
//   exige normalizar os dois lados dentro da consulta.
//
//   **`patients.crm_contact_id`** — é o que `getPatientByCrmContact` usa para
//   escrever "Paciente da clínica" no painel do chat. Escolhido por isso: a
//   tela e o agente enxergam a MESMA pessoa. Se divergissem, alguém veria
//   "Paciente da clínica" no painel enquanto a IA respondia como se fosse um
//   lead, e não haveria como saber qual das duas estava certa.
//
// `createPatient` grava essa coluna de forma idempotente, então a cobertura
// cresce sozinha com o uso: 1.311 pacientes já têm.

/**
 * Essa conversa é de alguém com ficha?
 *
 * **Falha fechada.** Erro de leitura (diferente de "não achou") devolve
 * `true`, ou seja: o agente cala. O estilo do projeto é "erro não vira lista
 * vazia calada" — aqui isso quer dizer que banco instável faz a IA ficar
 * quieta, nunca falar com paciente por engano. Silêncio se conserta; mensagem
 * enviada, não.
 */
export async function ehPacienteDoContato(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  crmContactId: string | null | undefined,
): Promise<boolean> {
  const contato = String(crmContactId ?? "").trim();

  // Sem id de contato não dá para afirmar que é paciente — e não afirmar é o
  // lado certo de errar aqui: quem chega por anúncio é exatamente quem ainda
  // não tem cadastro nenhum.
  if (!contato) return false;

  const { data, error } = await supabase
    .from("patients")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("crm_contact_id", contato)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(`[quem-e-paciente] não deu para conferir ${contato}:`, error.message);
    return true;
  }

  return !!data?.id;
}
