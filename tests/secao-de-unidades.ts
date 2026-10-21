// Checagens da seção "Onde a clínica fica".
//
// ── Por que ela existe ──────────────────────────────────────────────────
//
// Em 29/09 uma pessoa perguntou o endereço e a Luna respondeu "vou confirmar o
// endereço certinho com a equipe". A Dra. Mariane entrou na conversa e colou o
// endereço à mão. A IA não errou: a regra nº 2 manda nunca inventar endereço, e
// o endereço nunca chegava até a instrução — estava no cadastro das unidades o
// tempo todo.
//
// Os modos de errar:
//
//   **Escolher a cidade sozinha.** São duas unidades. Dar o endereço de Porto
//   Alegre para quem marcou em Florianópolis manda a pessoa para outro estado.
//
//   **Inventar quando não há cadastro.** Sem endereço, o certo é passar para
//   uma pessoa — não chutar rua.
//
//   **Despejar o endereço sem que perguntem.** Faz parte do atropelo que a
//   clínica já reclamou.
import {
  montarInstrucao,
  secaoDeUnidades,
} from "../supabase/functions/_shared/instrucao-do-agente.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// As duas unidades reais da clínica, como estão no cadastro.
const FLORIPA = {
  nome: "NÓS Florianópolis",
  endereco: "R. José Brognoli, 117 - Saco dos Limões, Florianópolis - Sala 612",
  principal: true,
};
const POA = {
  nome: "NÓS Porto Alegre",
  endereco: "Av. Osvaldo Aranha, 1022 - Sl 504 - Bom Fim, Porto Alegre - RS, 90035-191",
  principal: false,
};

// ── O caso real ──────────────────────────────────────────────────────────
{
  const t = secaoDeUnidades([FLORIPA, POA]);
  conferir("traz o endereço de Floripa", t.includes("R. José Brognoli, 117"), true);
  conferir("e o de Porto Alegre", t.includes("Av. Osvaldo Aranha, 1022"), true);
  conferir("diz que são os únicos", t.includes("são os únicos"), true);
  // Com duas cidades, ela precisa saber qual usar.
  conferir("manda seguir a unidade do horário", t.includes("unidade do horário"), true);
  // Sem DDD que diga algo, ela pergunta — não cai mais na principal.
  conferir("sem pista, pergunta a cidade", t.includes("pergunte antes"), true);
  conferir(
    "com as duas cidades na pergunta",
    t.includes("você é de Florianópolis ou de Porto Alegre?"),
    true,
  );
  conferir("e não escolhe por ela", t.includes("Não escolha por ela"), true);
  conferir("nunca mais 'a unidade é a principal'", t.includes("a unidade é a NÓS"), false);
}

// ── O caso de 21/10: DDD 51 pergunta o endereço antes de confirmar ──────
//
// A seção da cidade dizia "o DDD é de Porto Alegre"; esta dizia "sem horário,
// a unidade é Florianópolis". A Luna seguiu esta. A Dra. Mariane colou o
// endereço de Porto Alegre à mão.
{
  const t = secaoDeUnidades([FLORIPA, POA], null, "NÓS Porto Alegre");
  conferir("o palpite manda no endereço", t.includes("dê o endereço da NÓS Porto Alegre"), true);
  conferir("e confirma na mesma frase", t.includes("você é de Porto Alegre, né?"), true);
  conferir("sem cair na principal", t.includes("a unidade é a NÓS"), false);
  conferir("o horário combinado ainda vem antes", t.includes("unidade do horário"), true);
  conferir("e a outra cidade continua possível", t.includes("Se ela disser que é da outra"), true);
}

// ── Cidade confirmada vence o palpite ────────────────────────────────────
{
  const t = secaoDeUnidades([FLORIPA, POA], "NÓS Florianópolis", "NÓS Porto Alegre");
  conferir("confirmada manda", t.includes("Esta pessoa é de NÓS Florianópolis"), true);
  conferir("e o palpite some", t.includes("dê o endereço da NÓS Porto Alegre"), false);
}

// ── Palpite de unidade que não está na lista: igual a sem palpite ────────
{
  const t = secaoDeUnidades([FLORIPA, POA], null, "NÓS Curitiba");
  conferir("palpite desconhecido vira pergunta", t.includes("pergunte antes"), true);
  conferir("sem endereço inventado", t.includes("Curitiba"), false);
  conferir(
    "não despeja sem perguntarem",
    t.includes("Só diga o endereço quando perguntarem"),
    true,
  );
}

// ── Uma unidade só: sem a escolha entre cidades ──────────────────────────
{
  const t = secaoDeUnidades([FLORIPA]);
  conferir("uma unidade traz o endereço", t.includes("R. José Brognoli, 117"), true);
  conferir("e não fala em escolher unidade", t.includes("unidade do horário"), false);
}

// ── Sem cadastro, não inventa ────────────────────────────────────────────
{
  const t = secaoDeUnidades([{ nome: "NÓS Floripa", endereco: null, principal: true }]);
  conferir("diz que não está cadastrado", t.includes("não está cadastrado"), true);
  conferir("e manda passar para uma pessoa", t.includes("passe a conversa para uma pessoa"), true);
  conferir("sem inventar rua", t.includes("Não invente rua"), true);
}
// Uma com endereço e outra sem: a com endereço vale, a outra vira ressalva.
{
  const t = secaoDeUnidades([FLORIPA, { nome: "NÓS Nova", endereco: "  ", principal: false }]);
  conferir("usa a que tem", t.includes("R. José Brognoli, 117"), true);
  conferir("e avisa da que não tem", t.includes("Não tem endereço cadastrado: NÓS Nova"), true);
}

// ── Nada informado, nenhuma seção ────────────────────────────────────────
conferir("sem unidades, seção vazia", secaoDeUnidades([]), "");
conferir("nulo, seção vazia", secaoDeUnidades(null), "");
conferir(
  "unidade sem nome não conta",
  secaoDeUnidades([{ nome: "  ", endereco: "x", principal: true }]),
  "",
);

// ── E chega na instrução montada ─────────────────────────────────────────
{
  const base = {
    clinica: "NÓS Odontologia",
    manual: {
      tom: "",
      saudacao: "",
      etapas: [],
      descoberta: "",
      duvidas_de_procedimento: "",
      apresentacao_preco: "",
      objecoes: [],
      agendamento: "",
      fechamento: "",
      observacoes: "",
    },
    instrucaoBase: "Atenda com carinho.",
    procedimentos: [],
    hoje: "2026-09-29",
  };
  const com = montarInstrucao({ ...base, unidades: [FLORIPA, POA] });
  conferir("a instrução leva o endereço", com.includes("R. José Brognoli, 117"), true);
  conferir(
    "sem unidades, nenhuma seção de endereço",
    montarInstrucao(base).includes("Onde a clínica fica"),
    false,
  );
}

// ── O limite da regra da unidade padrão ────────────────────────────────────
//
// Com duas unidades, a seção diz "na dúvida, vale a principal". Isso é um bom
// palpite para quem vai ser atendido na clínica e um palpite errado para um
// evento em outra cidade — e foi ele que fez a Luna dar o endereço de
// Florianópolis numa conversa sobre uma mentoria em Porto Alegre, em 15/10.
{
  const duas = secaoDeUnidades([FLORIPA, POA]);
  // O padrão deixou de ser "a principal": sem cidade, sem horário e sem DDD
  // que diga algo, a regra é perguntar — ver o caso de 21/10 acima.
  conferir("com duas unidades, a regra do padrão aparece", duas.includes("pergunte antes"), true);
  conferir(
    "e vem limitada ao atendimento na clínica",
    duas.includes("vale para atendimento NA CLÍNICA"),
    true,
  );
  conferir(
    "mandando usar a seção da mentoria quando é dela que se fala",
    duas.includes("o endereço é o daquela seção"),
    true,
  );
  // Com uma unidade só não há escolha a limitar, e a ressalva seria ruído.
  conferir(
    "com uma unidade, nada disso é dito",
    secaoDeUnidades([FLORIPA]).includes("vale para atendimento NA CLÍNICA"),
    false,
  );
}

// ── Quando a cidade da pessoa já está confirmada ────────────────────────
//
// A regra antiga — "a unidade do horário que vocês combinaram, e na falta dele
// a principal" — existia porque não havia como saber a cidade. Agora há: a
// pessoa disse, e está gravado na conversa. Perguntaram o endereço antes de
// combinar horário? O endereço é o da cidade dela, e a principal não entra.
{
  const t = secaoDeUnidades([FLORIPA, POA], "NÓS Porto Alegre");
  conferir("diz de qual unidade ela é", t.includes("Esta pessoa é de NÓS Porto Alegre"), true);
  conferir("e que é esse e nenhum outro", t.includes("nenhum outro"), true);
  // A regra do palpite sai de cena: mantê-la ao lado da certeza daria duas
  // instruções para a mesma pergunta, e aí ninguém sabe qual valeu.
  conferir(
    "sem a regra da unidade principal",
    t.includes("ainda não houver horário combinado"),
    false,
  );
  // Os dois endereços continuam na lista: ela pode perguntar pelo outro, e
  // esconder é como se chega a "vou confirmar com a equipe".
  conferir("os dois endereços seguem listados", t.includes("Osvaldo Aranha"), true);
  conferir("inclusive o da outra cidade", t.includes("José Brognoli"), true);
  // E a ressalva da mentoria continua: ela não é sobre unidade, é sobre o
  // evento acontecer em outro lugar.
  conferir("a ressalva da mentoria fica", t.includes("vale para atendimento NA CLÍNICA"), true);
}

// Nome que não casa com nenhuma unidade (unidade renomeada, cidade removida do
// cadastro) cai na regra antiga em vez de inventar.
{
  const t = secaoDeUnidades([FLORIPA, POA], "NÓS Curitiba");
  conferir("nome desconhecido volta para a regra padrão", t.includes("pergunte antes"), true);
  conferir("e não afirma cidade nenhuma", t.includes("Esta pessoa é de"), false);
}

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do endereço da clínica`);
