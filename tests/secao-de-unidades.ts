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
  conferir("e diz qual vale antes disso", t.includes("a unidade é a NÓS Florianópolis"), true);
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

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do endereço da clínica`);
