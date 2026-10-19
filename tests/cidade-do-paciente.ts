// De que cidade a pessoa é — e o que acontece quando a resposta vem errada.
//
// O erro que estas checagens existem para impedir não é uma mensagem feia: é
// uma paciente marcada em Porto Alegre por causa de um código inventado, ou
// uma paciente de Porto Alegre recebendo horário em Florianópolis porque o
// palpite do DDD foi tratado como resposta. Nos dois casos alguém viaja — ou
// chega a uma sala vazia.
import {
  catalogoDeUnidades,
  dddDoTelefone,
  secaoDaCidade,
  unidadeEscolhida,
  unidadePeloDdd,
} from "../supabase/functions/_shared/cidade-do-paciente.ts";
import { lerRespostaAoPaciente } from "../supabase/functions/_shared/modelo-de-atendimento.ts";

let feitas = 0;
function conferir(oQue: string, real: unknown, esperado: unknown) {
  feitas++;
  if (real !== esperado) {
    console.error(`FALHOU ${oQue}: esperava ${String(esperado)}, veio ${String(real)}`);
    process.exit(1);
  }
}

const UNIDADES = [
  {
    id: "1165e982-616f-4ecd-a555-27f9b64e9134",
    nome: "NÓS Florianópolis",
    endereco: "R. José Brognoli, 117 - Saco dos Limões, Florianópolis - Sala 612",
  },
  {
    id: "11c590d5-ba8a-43f0-812c-965b5ed7ad6c",
    nome: "NÓS Porto Alegre",
    endereco: "Av. Osvaldo Aranha, 1022 - Sl 504 - Bom Fim, Porto Alegre - RS, 90035-191",
  },
];

const cat = catalogoDeUnidades(UNIDADES);
const enderecos = Object.fromEntries(UNIDADES.map((u) => [u.id, u.endereco]));

// ── O catálogo ──────────────────────────────────────────────────────────────

conferir("duas unidades, dois códigos", cat.length, 2);
conferir("a primeira é U1", cat[0].codigo, "U1");
conferir("a segunda é U2", cat[1].codigo, "U2");
conferir("o id viaja junto", cat[1].id, UNIDADES[1].id);

// Unidade sem nome não entra: a Luna não teria como perguntar pela cidade, e o
// código apontaria para uma linha que ninguém reconhece.
{
  const comBuraco = catalogoDeUnidades([
    { id: "a", nome: "   " },
    { id: "", nome: "NÓS Curitiba" },
    { id: "c", nome: "NÓS Porto Alegre" },
  ]);
  conferir("sobra só a que tem id e nome", comBuraco.length, 1);
  conferir("e ela é a U1", comBuraco[0].nome, "NÓS Porto Alegre");
}

// ── O código que o modelo devolve ───────────────────────────────────────────

conferir("U2 é Porto Alegre", unidadeEscolhida({ codigo: "U2" }, cat)?.id, UNIDADES[1].id);
conferir("caixa baixa vale", unidadeEscolhida({ codigo: "u2" }, cat)?.codigo, "U2");
conferir("espaço sobrando vale", unidadeEscolhida({ codigo: " U1 " }, cat)?.codigo, "U1");

// E aqui é onde o código tem de ser duro. Qualquer coisa que não esteja no
// catálogo não confirma cidade nenhuma — a Luna pergunta de novo.
conferir("código inventado não confirma", unidadeEscolhida({ codigo: "U9" }, cat), null);
conferir("nome da cidade não é código", unidadeEscolhida({ codigo: "Porto Alegre" }, cat), null);
conferir("vazio não confirma", unidadeEscolhida({ codigo: "" }, cat), null);
conferir("nulo não confirma", unidadeEscolhida({ codigo: null }, cat), null);
conferir("resposta ausente não confirma", unidadeEscolhida(null, cat), null);
conferir("catálogo vazio não confirma nada", unidadeEscolhida({ codigo: "U1" }, []), null);

// ── O DDD ───────────────────────────────────────────────────────────────────

conferir("número do WhatsApp com 55", dddDoTelefone("5551999887766"), "51");
conferir("fixo, com o 55", dddDoTelefone("554833334444"), "48");
conferir("com máscara", dddDoTelefone("+55 (48) 99988-7766"), "48");
// Onze dígitos sem o código do país é ambíguo: este é um telefone de São
// Francisco, e lido como brasileiro teria DDD 14 (Bauru). Melhor sem palpite.
conferir("estrangeiro não tem DDD", dddDoTelefone("14155550123"), null);
conferir("número nacional sem o 55 não vale", dddDoTelefone("48999887766"), null);
conferir("curto demais", dddDoTelefone("99887766"), null);
conferir("vazio", dddDoTelefone(""), null);
conferir("nulo", dddDoTelefone(null), null);
// 20 não é DDD de ninguém. Devolver "20" faria a busca por unidade rodar com um
// estado que não existe, e o palpite sairia nulo por acidente em vez de por
// decisão.
conferir("DDD que não existe", dddDoTelefone("5520999887766"), null);

// ── O palpite ───────────────────────────────────────────────────────────────

conferir("51 aponta Porto Alegre", unidadePeloDdd("5551999887766", cat, enderecos)?.codigo, "U2");
conferir("48 aponta Florianópolis", unidadePeloDdd("5548999887766", cat, enderecos)?.codigo, "U1");
// 54 é Caxias do Sul: mesmo estado de Porto Alegre, cidade diferente. A sigla
// RS está no endereço de uma unidade só, então o palpite é dela.
conferir("54 também é RS", unidadePeloDdd("5554999887766", cat, enderecos)?.codigo, "U2");
// 11 é São Paulo: nenhuma unidade na cidade, nenhuma no estado. Sem palpite —
// e é aqui que a pergunta da Luna deixa de ter viés.
conferir("11 não aponta nada", unidadePeloDdd("5511999887766", cat, enderecos), null);
conferir("sem telefone não há palpite", unidadePeloDdd(null, cat, enderecos), null);
// Sem o endereço em mãos, o nome da unidade ainda carrega a cidade — é assim
// que estão cadastradas. Mas um nome que não diz a cidade não inventa palpite.
conferir("o nome basta", unidadePeloDdd("5551999887766", cat)?.codigo, "U2");
{
  const anonimas = catalogoDeUnidades([
    { id: "a", nome: "Unidade 1" },
    { id: "b", nome: "Unidade 2" },
  ]);
  conferir("nome sem cidade não chuta", unidadePeloDdd("5551999887766", anonimas), null);
}
// Duas unidades na mesma cidade: o palpite é ambíguo, e ambíguo entraria na
// instrução como se fosse informação.
{
  const duasEmPoa = catalogoDeUnidades([
    { id: "a", nome: "NÓS Porto Alegre Centro" },
    { id: "b", nome: "NÓS Porto Alegre Zona Sul" },
  ]);
  conferir("empate não gera palpite", unidadePeloDdd("5551999887766", duasEmPoa), null);
}

// ── A seção da instrução ────────────────────────────────────────────────────

// Uma unidade só: a pergunta não existe. Uma seção pedindo para confirmar a
// cidade de quem tem uma opção só é ruído que o modelo tenta obedecer.
{
  const uma = catalogoDeUnidades([UNIDADES[0]]);
  conferir("clínica de uma cidade não ganha seção", secaoDaCidade(uma, null, null), "");
}

// Sem confirmação: manda perguntar e proíbe oferecer.
{
  const texto = secaoDaCidade(cat, null, null);
  conferir("lista os códigos", texto.includes("U2 = NÓS Porto Alegre"), true);
  conferir("manda confirmar antes", texto.includes("ANTES de oferecer qualquer horário"), true);
  conferir("ensina o campo", texto.includes("cidadeConfirmada"), true);
  conferir("proíbe oferecer sem saber", texto.includes("NÃO ofereça horário"), true);
  conferir("proíbe fechar sem saber", texto.includes("horarioFechado"), true);
  conferir("sem palpite, não cita DDD", texto.includes("DDD"), false);
}

// Com palpite: o DDD entra como jeito de perguntar, e dito como palpite.
{
  const texto = secaoDaCidade(cat, null, cat[1]);
  conferir("cita a cidade provável", texto.includes("costuma ser de NÓS Porto Alegre"), true);
  conferir("tira o NÓS da pergunta", texto.includes('"você é de Porto Alegre, né?"'), true);
  conferir("diz que não é para afirmar", texto.includes("NÃO para afirmar"), true);
  conferir("ainda manda confirmar", texto.includes("ANTES de oferecer qualquer horário"), true);
}

// Já confirmada: não pergunta de novo, e abre a porta para a correção.
{
  const texto = secaoDaCidade(cat, cat[1], cat[1]);
  conferir("diz que já sabe", texto.includes("já disse que é de NÓS Porto Alegre"), true);
  conferir("proíbe perguntar de novo", texto.includes("NÃO pergunte"), true);
  conferir("deixa corrigir", texto.includes("na verdade é da outra cidade"), true);
  conferir("não manda perguntar antes de oferecer", texto.includes("ANTES de oferecer"), false);
}

// O id da unidade não aparece em lugar nenhum da instrução — o modelo trabalha
// com código, e um uuid na instrução é um uuid que ele pode inventar parecido.
for (const confirmada of [null, cat[0], cat[1]]) {
  const texto = secaoDaCidade(cat, confirmada, cat[1]);
  conferir(
    `uuid fora da instrução (${confirmada?.codigo ?? "sem cidade"})`,
    texto.includes(UNIDADES[0].id) || texto.includes(UNIDADES[1].id),
    false,
  );
}

// ── O campo na resposta do modelo ───────────────────────────────────────────
//
// A fronteira: é por este campo que a cidade chega. Um campo lido errado aqui
// vira uma consulta marcada na outra cidade.
{
  const r = lerRespostaAoPaciente(
    JSON.stringify({
      resposta: "Perfeito! Então é em Porto Alegre mesmo.",
      horarioFechado: "",
      casoEnviado: "",
      duvidaEncaminhada: "",
      cidadeConfirmada: "U2",
    }),
  );
  conferir("a fala sai inteira", r.texto, "Perfeito! Então é em Porto Alegre mesmo.");
  conferir("e a cidade também", r.cidadeConfirmada, "U2");
  conferir(
    "que vira a unidade certa",
    unidadeEscolhida({ codigo: r.cidadeConfirmada }, cat)?.nome,
    "NÓS Porto Alegre",
  );
}

// Sem o campo — a imensa maioria das mensagens — nada é confirmado.
conferir(
  "resposta sem o campo não confirma cidade",
  lerRespostaAoPaciente(JSON.stringify({ resposta: "A limpeza fica R$ 300." })).cidadeConfirmada,
  "",
);

// Tipo errado não vira código. O campo é um código, e um objeto aqui viraria
// "[object Object]" se alguém o convertesse sem olhar.
for (const valor of [42, null, true, { a: 1 }, ["U1"]]) {
  conferir(
    `${JSON.stringify(valor)} não vira cidade`,
    lerRespostaAoPaciente(JSON.stringify({ resposta: "oi", cidadeConfirmada: valor }))
      .cidadeConfirmada,
    "",
  );
}

// E uma resposta que não é o JSON pedido continua sendo A FALA — a paciente não
// pode ficar sem resposta por causa de um campo. Sem cidade nenhuma, que é o
// lado seguro.
{
  const r = lerRespostaAoPaciente("Oi! Tudo bem?");
  conferir("texto cru vira a fala", r.texto, "Oi! Tudo bem?");
  conferir("e não confirma cidade", r.cidadeConfirmada, "");
}

console.log(`ok — ${feitas} checagens da cidade do paciente`);
