// Checagens da seção de paciente modelo e harmonização facial.
//
// São as duas coisas em que um preço errado custa mais caro, por motivos opostos.
//
//   **Harmonização direta não tem preço por WhatsApp.** O valor depende do rosto
//   da pessoa. Qualquer número dito aqui é promessa feita sem ter visto ninguém.
//
//   **Paciente modelo tem preço, mas de uma EDIÇÃO com data.** A de agosto foi
//   nos dias 28 e 29, e o anúncio diz "valores exclusivos para essa mentoria".
//   Convidar alguém depois disso não dá erro nenhum: dá uma pessoa chegando na
//   clínica achando que tinha vaga.
//
// E em nenhum dos dois a IA manda dados de pagamento: a chave pix da clínica é o
// CPF pessoal da doutora.
import {
  secaoDePacienteModelo,
  type PacienteModelo,
} from "../supabase/functions/_shared/instrucao-do-agente.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}
const contem = (n: string, t: string, x: string) => conferir(n, t.includes(x), true);
const naoContem = (n: string, t: string, x: string) => conferir(n, t.includes(x), false);

const HOJE = "2026-09-28";
const aberta: PacienteModelo = {
  ate: "2026-10-30",
  texto: "Edição de outubro, dias 29 e 30. Investimento de R$ 150 para reservar.",
};

// ── A regra que vale SEMPRE ─────────────────────────────────────────────
for (const [rotulo, pm] of [
  ["com edição aberta", aberta],
  ["sem edição", null],
] as const) {
  const t = secaoDePacienteModelo(pm, HOJE);
  contem(`harmonização sem preço ${rotulo}`, t, "NUNCA dá valor por aqui");
  // Botox fica FORA da proibição: o NÓS Prevent está na tabela de preços porque
  // a clínica o anuncia em público, e proibir aqui contradiria a tabela.
  conferir(`botox não entra na proibição ${rotulo}`, t.includes("botox"), false);
  contem(`a exceção da tabela é dita ${rotulo}`, t, "é a lista de preços acima");
  contem(`nem faixa ${rotulo}`, t, "nem faixa");
  contem(`nem a partir de ${rotulo}`, t, 'nem "a partir');
  contem(`conduz para avaliação ${rotulo}`, t, "conduza para a avaliação");
  // O pix é CPF pessoal: nunca sai pela IA.
  contem(`nada de pagamento ${rotulo}`, t, "nem pix, nem CPF");
}

// ── Edição aberta ───────────────────────────────────────────────────────
{
  const t = secaoDePacienteModelo(aberta, HOJE);
  contem("diz que há edição", t, "edição de PACIENTE MODELO aberta");
  contem("e traz o texto da clínica", t, "Investimento de R$ 150 para reservar");
  naoContem("e não manda calar", t, "NÃO há edição");
}

// ── Edição aberta: as duas listas de preço, e a agenda ──────────────────
//
// Com edição aberta a instrução passa a ter DOIS preços para o mesmo
// procedimento — o botox de 3 regiões está liberado na tabela da clínica e
// também na mentoria. Sem dizer qual manda onde, o modelo escolhe um ao acaso.
// E "quero a vaga" não pode virar consulta na agenda: a vaga são os dias da
// prática, e a reserva depende dos R$ 150, que a IA não recebe.
{
  const t = secaoDePacienteModelo(aberta, HOJE);
  contem("diz qual preço vale onde", t, "Dois preços para a mesma coisa");
  // A proibição de dar valor é dita no começo; a exceção da mentoria tem de ser
  // dita JUNTO dela, não só quarenta linhas abaixo.
  contem("a exceção é avisada junto da proibição", t, "segunda exceção");
  contem("os da mentoria são exclusivos", t, "EXCLUSIVOS da vaga de paciente modelo");
  contem("e não se misturam", t, "não se");
  contem("na dúvida, pergunta", t, "pergunte em vez de escolher");
  // A regra não cita procedimento nenhum: a clínica renomeia item do catálogo
  // pela tela, e regra que cita nome envelhece calada.
  naoContem("sem nomear procedimento", t, "NÓS Prevent");
  naoContem("nem botox", t, "botox");

  contem("a vaga não é horário de agenda", t, "NÃO é um horário da agenda");
  contem("e não preenche o campo", t, "NÃO");
  contem("não preenche horário fechado", t, "preenche o campo de horário fechado");
  contem("a Dra. finaliza", t, "entra em contato por");

  // O último dia aparece escrito, para não convidar ninguém depois dele.
  contem("a data de fim aparece", t, "vai até 30/10/2026");
}

// ── Sem edição: não mencionar, e não citar valores antigos ──────────────
{
  const t = secaoDePacienteModelo(null, HOJE);
  contem("avisa que não há", t, "NÃO há edição de paciente modelo aberta");
  // Nada da edição aberta vaza para o estado fechado: nem a regra dos dois
  // preços (não há segunda lista) nem a da agenda.
  naoContem("sem a regra dos dois preços", t, "Dois preços");
  naoContem("e sem segunda exceção", t, "segunda exceção");
  naoContem("sem a regra da agenda", t, "NÃO é um horário da agenda");
  contem("proíbe citar valores de mentoria", t, "não cite valores de mentoria");
  // Fragmento curto de propósito: o texto é quebrado em linhas, e uma asserção
  // que atravessa a quebra falha sem o texto estar errado.
  contem("e manda encaminhar", t, "passe a conversa para uma");
}

// ── A data expira sozinha ───────────────────────────────────────────────
// É o ponto inteiro da coluna: quem esquece de desligar não convida ninguém
// para uma mentoria que já passou.
{
  const passada: PacienteModelo = { ate: "2026-08-29", texto: aberta.texto };
  const t = secaoDePacienteModelo(passada, HOJE);
  contem("edição de agosto não abre em setembro", t, "NÃO há edição");
  naoContem("e o texto dela não aparece", t, "Investimento de R$ 150");
}
// O último dia ainda conta como aberto.
contem(
  "o último dia ainda vale",
  secaoDePacienteModelo({ ...aberta, ate: HOJE }, HOJE),
  "edição de PACIENTE MODELO aberta",
);
// Um dia depois, não.
contem(
  "o dia seguinte já não vale",
  secaoDePacienteModelo({ ...aberta, ate: "2026-09-27" }, HOJE),
  "NÃO há edição",
);

// ── Falha fechada ───────────────────────────────────────────────────────
// Data sem texto, e texto sem data: nos dois casos a oferta fica fechada, porque
// metade da informação não dá para convidar ninguém.
contem(
  "data sem texto fica fechada",
  secaoDePacienteModelo({ ate: "2026-10-30", texto: null }, HOJE),
  "NÃO há edição",
);
contem(
  "texto sem data fica fechado",
  secaoDePacienteModelo({ ate: null, texto: aberta.texto }, HOJE),
  "NÃO há edição",
);
contem(
  "texto em branco fica fechado",
  secaoDePacienteModelo({ ate: "2026-10-30", texto: "   " }, HOJE),
  "NÃO há edição",
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens de paciente modelo`);
