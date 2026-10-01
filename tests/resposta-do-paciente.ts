// Checagens da leitura do "SIM" / "NÃO" do paciente.
//
// O que está em jogo: esta é a única coisa no sistema que muda o estado de um
// agendamento a partir de um texto que uma pessoa de fora escreveu. Errar aqui
// não dá erro em tela nenhuma — dá uma agenda que diz "Confirmado" para quem
// nunca confirmou, e é a doutora que descobre, na cadeira vazia.
//
// Os três modos de errar:
//
//   **"Assim" contém "sim".** A regra que a clínica escreveu usa `contains`.
//   Uma conversa comum de terça — "assim que puder eu te falo" — marcaria a
//   consulta de sábado como confirmada. Daí a janela: só vale como resposta o
//   que chega depois de um lembrete.
//
//   **Mãe e filho no mesmo celular.** São 207 números compartilhados por 447
//   fichas nesta base. Escolher a primeira confirma a consulta de quem não
//   respondeu.
//
//   **O nono dígito.** O mesmo celular está guardado com 13 dígitos numa ficha
//   e 12 em outra. Comparar texto com texto perde metade das respostas.
import {
  JANELA_DE_RESPOSTA_EM_HORAS,
  classificarResposta,
  tratarRespostaDoPaciente,
  consultaPorExtenso,
  promptDaLeitura,
} from "../supabase/functions/_shared/resposta-do-paciente.ts";
import { variantesDoNumero } from "../supabase/functions/_shared/phone-match.ts";

// O módulo roda em Deno; aqui roda no bun. As duas coisas que ele toca do
// ambiente — `Deno.env` e `fetch` — viram tocos, para o teste exercitar o
// caminho de verdade em vez do caminho de erro.
(globalThis as Record<string, unknown>).Deno = { env: { get: () => "http://teste" } };
let disparos = 0;
globalThis.fetch = (() => {
  disparos++;
  return Promise.resolve(new Response("{}"));
}) as typeof fetch;

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── O que o paciente quis dizer ─────────────────────────────────────────
conferir("sim confirma", classificarResposta("sim"), "confirma");
conferir("SIM de caixa alta também", classificarResposta("SIM"), "confirma");
conferir("sim no meio da frase", classificarResposta("Oi, sim, estarei lá!"), "confirma");
conferir("ok confirma", classificarResposta("ok"), "confirma");
conferir("o número 1 confirma", classificarResposta("1"), "confirma");
conferir("nao remarca", classificarResposta("nao"), "remarca");
conferir("com acento também", classificarResposta("não"), "remarca");
conferir("pedido de remarcar", classificarResposta("preciso remarcar"), "remarca");
conferir("o número 2 remarca", classificarResposta("2"), "remarca");

// O caso que motivou a janela: "assim" NÃO é "sim".
conferir("assim não é sim", classificarResposta("Assim que puder eu te falo"), "indefinida");
conferir("simplesmente não é sim", classificarResposta("simplesmente esqueci"), "indefinida");
conferir("nao dentro de palavra", classificarResposta("naotenhocerteza"), "indefinida");
// ── As respostas REAIS que chegaram em 29/09 ─────────────────────────────
//
// Das duas que chegaram naquele dia, nenhuma era "sim". A regra da clínica
// perguntava `contém "sim"` e as duas caíram em "não entendida" — uma consulta
// confirmada ficou pendente na agenda.
conferir("confirmo é confirmação", classificarResposta("confirmo"), "confirma");
conferir(
  "a mensagem inteira da vida real",
  classificarResposta(
    "Olá, bom dia!\nTudo bem?\n\nPresença confirmada 😊\nPronto para ficar com os dentes branquinhos 😁",
  ),
  "confirma",
);

// ── Como as pessoas de fato respondem ────────────────────────────────────
for (const t of [
  "ok",
  "blz",
  "beleza",
  "Confirmado!",
  "Tudo certo 😊",
  "pode confirmar",
  "estarei lá",
  "tô indo",
  "eu vou sim",
  "pode deixar",
  "👍",
  "isso",
  "perfeito",
])
  conferir(`"${t}" confirma`, classificarResposta(t), "confirma");

for (const t of [
  "não vou poder",
  "nao posso ir",
  "não consigo nesse dia",
  "preciso remarcar",
  "gostaria de remarcar",
  "tem como remarcar?",
  "vou precisar desmarcar",
  "tem outro dia?",
  "prefiro outro horário",
  "podemos mudar a data?",
])
  conferir(`"${t}" remarca`, classificarResposta(t), "remarca");

// ── O que NÃO pode virar decisão ─────────────────────────────────────────
//
// Emoji só decide quando é de polegar. Letra solta nunca: foi o defeito que os
// testes pegaram — o "s" de "sim" casava dentro de "preciso remarcar".
conferir(
  "letra dentro de palavra não confirma",
  classificarResposta("preciso remarcar"),
  "remarca",
);
conferir("pergunta não é resposta", classificarResposta("quanto custa?"), "indefinida");
conferir("assunto outro não é resposta", classificarResposta("bom dia, tudo bem?"), "indefinida");
conferir("emoji qualquer não decide", classificarResposta("😅"), "indefinida");
// "Pode" ficou fora da lista de propósito.
conferir("pode sozinho não confirma", classificarResposta("pode?"), "indefinida");
conferir("pode remarcar é remarcar", classificarResposta("pode remarcar?"), "remarca");

// As duas juntas: adivinhar custa mais que perguntar.
conferir("sim e não juntos", classificarResposta("sim, mas não nesse horário"), "indefinida");
conferir("texto vazio", classificarResposta(""), "indefinida");
conferir("só pontuação", classificarResposta("?!"), "indefinida");
// Pontuação que o split antigo não cortava: "sim?" e "sim;" precisam contar.
conferir("sim com interrogação", classificarResposta("sim?"), "confirma");

// ── O nono dígito ───────────────────────────────────────────────────────
conferir("com o 9 gera a forma sem ele", variantesDoNumero("5548991838082").sort(), [
  "554891838082",
  "5548991838082",
]);
conferir("sem o 9 gera a forma com ele", variantesDoNumero("554891838082").sort(), [
  "554891838082",
  "5548991838082",
]);
conferir("número local ganha o 55", variantesDoNumero("(48) 99183-8082").sort(), [
  "554891838082",
  "5548991838082",
]);
// Fixo não tem nono dígito: uma forma só, sem inventar celular.
conferir("fixo fica com uma forma", variantesDoNumero("(48) 3333-4444"), ["554833334444"]);
// DDD 55 (Santa Maria): o 55 da frente é o DDD, não o país — mesma regra de
// `normalizeBrazilianPhone`, que decide pelo comprimento.
conferir("DDD 55 não é confundido com o país", variantesDoNumero("55999998888").sort(), [
  "555599998888",
  "5555999998888",
]);
conferir("sem telefone, sem formas", variantesDoNumero(null), []);
conferir("lixo não vira forma", variantesDoNumero("abc"), []);

// ── As guardas de `tratarRespostaDoPaciente` ────────────────────────────
//
// Banco de mentira: cada tabela devolve o que o teste plantou. O que se
// exercita é a ORDEM das recusas, que é onde o perigo mora — uma mensagem
// comum não pode chegar perto do `update`.
const AGORA = new Date("2026-09-27T12:00:00Z");

function bancoFalso(plano: {
  candidatos?: Record<string, unknown>[];
  lembretes?: Record<string, unknown>[];
  regraAtiva?: boolean;
}) {
  const escritas: { tabela: string; dados: unknown }[] = [];
  const banco = {
    escritas,
    rpc: (_nome: string, _args: unknown) =>
      Promise.resolve({ data: plano.candidatos ?? [], error: null }),
    from(tabela: string) {
      const consulta: Record<string, unknown> = {};
      const devolver = () => {
        if (tabela === "appointment_notifications") {
          return Promise.resolve({ data: plano.lembretes ?? [], error: null });
        }
        if (tabela === "automation_rules") {
          return Promise.resolve({ data: plano.regraAtiva ? { id: "regra" } : null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      for (const m of ["select", "eq", "in", "gte", "limit", "update"]) {
        consulta[m] = () => consulta;
      }
      consulta.maybeSingle = devolver;
      consulta.then = (r: (v: unknown) => unknown) => devolver().then(r);
      consulta.insert = (dados: unknown) => {
        escritas.push({ tabela, dados });
        return Promise.resolve({ data: null, error: null });
      };
      // `update(...).eq(...).eq(...)` precisa terminar em promessa.
      consulta.update = () => {
        escritas.push({ tabela, dados: "update" });
        return consulta;
      };
      return consulta;
    },
  };
  return banco;
}

const MSG = { fromMe: false, ehGrupo: false, body: "sim", phone: "5548991838082" };

async function motivo(m: Partial<typeof MSG>, plano: Parameters<typeof bancoFalso>[0] = {}) {
  const banco = bancoFalso(plano);
  const r = await tratarRespostaDoPaciente(banco, "dono", { ...MSG, ...m }, AGORA);
  return { ...r, escritas: banco.escritas };
}

const consulta = [
  { appointment_id: "ap1", patient_id: "p1", patient_name: "Ana", status: "pending" },
];
const lembreteRecente = [{ kind: "automation_reminder_d1" }];

conferir(
  "mensagem da clínica não é resposta",
  (await motivo({ fromMe: true })).motivo,
  "mensagem da própria clínica",
);
conferir("grupo não é resposta", (await motivo({ ehGrupo: true })).motivo, "grupo");
conferir("sem texto não é resposta", (await motivo({ body: "  " })).motivo, "sem texto");
conferir("sem telefone não é resposta", (await motivo({ phone: null })).motivo, "sem telefone");
conferir("sem consulta marcada não é resposta", (await motivo({})).motivo, "sem consulta marcada");

// A janela: o "sim" mais claro do mundo não mexe em nada sem lembrete recente.
{
  const r = await motivo({}, { candidatos: consulta, lembretes: [] });
  conferir("sem lembrete recente não trata", r.motivo, "nenhum lembrete recente");
  conferir("e não escreve nada", r.escritas.length, 0);
}

// Com lembrete e sem regra: o comportamento embutido confirma.
{
  const r = await motivo({}, { candidatos: consulta, lembretes: lembreteRecente });
  conferir("com lembrete, confirma", r.acao, "confirmed");
  conferir(
    "e mexeu no agendamento",
    r.escritas.some((e) => e.tabela === "appointments"),
    true,
  );
}

// "Não" nunca cancela sozinho — só sinaliza para uma pessoa decidir.
conferir(
  "remarcar não cancela",
  (await motivo({ body: "não consigo ir" }, { candidatos: consulta, lembretes: lembreteRecente }))
    .acao,
  "declined",
);
conferir(
  "resposta confusa não mexe no status",
  (
    await motivo(
      { body: "acho que sim, mas não sei" },
      { candidatos: consulta, lembretes: lembreteRecente },
    )
  ).acao,
  "unmatched",
);

// Com regra ativa, quem decide é o fluxo da clínica — não a lista fixa.
{
  const r = await motivo(
    {},
    { candidatos: consulta, lembretes: lembreteRecente, regraAtiva: true },
  );
  conferir("regra ativa manda para a automação", r.acao, "automation");
  conferir("e o motor de automações foi chamado", disparos > 0, true);
  conferir(
    "e não mexe no status por conta própria",
    r.escritas.some((e) => e.tabela === "appointments"),
    false,
  );
}

// Duas fichas com o mesmo número e consulta marcada: não escolhe nenhuma.
{
  const duas = [...consulta, { appointment_id: "ap2", patient_id: "p2", patient_name: "Filho" }];
  const r = await motivo({}, { candidatos: duas, lembretes: lembreteRecente });
  conferir("número compartilhado não é adivinhado", r.acao, "ambiguo");
  conferir(
    "e não mexe em agendamento nenhum",
    r.escritas.some((e) => e.tabela === "appointments"),
    false,
  );
}

conferir("a janela é maior que um dia", JANELA_DE_RESPOSTA_EM_HORAS > 24, true);

// ── A pergunta junto da resposta ─────────────────────────────────────────
//
// 01/10: o Daniel Costa respondeu "Tudo bem, pode ser" a um pedido de
// confirmação, e a IA devolveu "indefinida". Estava certa: lida no vácuo, essa
// frase responde "sim" tanto quanto responde "tanto faz". O que faltava era a
// pergunta.
//
// Os modos de errar:
//
//   **Mandar a resposta sozinha.** Era o defeito: o prompt trazia um lembrete
//   INVENTADO, sempre o mesmo, e a frase do paciente solta embaixo.
//
//   **Ler a mensagem errada como pergunta.** Se a recepção escrever DEPOIS da
//   resposta, essa mensagem não pode virar "o que foi perguntado".
//
//   **Quebrar quando não há pergunta.** Sem o espelho, tem de voltar ao texto
//   genérico, não sumir.
{
  const PERGUNTA = "Oi Daniel! Passando para confirmar sua consulta. Você confirma presença?";

  const comContexto = promptDaLeitura("Tudo bem, pode ser", {
    perguntaDaClinica: PERGUNTA,
    quando: "quinta-feira, 1 de outubro, às 15:00",
    procedimento: "Combo: clareamento de consultório + limpeza completa",
  });

  conferir("a pergunta de verdade entra no prompt", comContexto.includes(PERGUNTA), true);
  conferir("o lembrete inventado sai", comContexto.includes("Sua consulta é amanhã"), false);
  conferir("a resposta continua lá", comContexto.includes("Tudo bem, pode ser"), true);
  conferir(
    "a consulta aparece",
    comContexto.includes("quinta-feira, 1 de outubro, às 15:00"),
    true,
  );
  conferir("o procedimento aparece", comContexto.includes("clareamento de consultório"), true);
  conferir(
    "e o modelo é mandado ler uma contra a outra",
    comContexto.includes("COMO RESPOSTA À MENSAGEM ACIMA"),
    true,
  );
  conferir("com o caso do Daniel escrito na instrução", comContexto.includes("pode ser"), true);

  // A pergunta vem ANTES da resposta: ordem importa para o modelo ler uma
  // contra a outra, e inverter faria a frase do paciente chegar sem referência.
  conferir(
    "a pergunta vem antes da resposta",
    comContexto.indexOf(PERGUNTA) < comContexto.indexOf("Tudo bem, pode ser"),
    true,
  );
}

{
  // Sem espelho: volta ao texto de antes, em vez de ficar sem pergunta nenhuma.
  const semContexto = promptDaLeitura("Tudo bem, pode ser");
  conferir("sem contexto, o genérico volta", semContexto.includes("Sua consulta é amanhã"), true);
  conferir("e a resposta continua lá", semContexto.includes("Tudo bem, pode ser"), true);

  const contextoVazio = promptDaLeitura("ok", {
    perguntaDaClinica: null,
    quando: null,
    procedimento: null,
  });
  conferir(
    "contexto todo nulo também cai no genérico",
    contextoVazio.includes("Sua consulta é amanhã"),
    true,
  );
  conferir(
    "e não inventa linha de consulta",
    contextoVazio.includes("A consulta de que se fala"),
    false,
  );
}

{
  // Mensagem gigante da clínica não pode empurrar a resposta para o fim.
  const enorme = "a".repeat(5000);
  const p = promptDaLeitura("ok", { perguntaDaClinica: enorme, quando: null, procedimento: null });
  conferir("a pergunta é cortada", p.includes("a".repeat(5000)), false);
  conferir("e a resposta sobrevive", p.includes("> ok"), true);
}

// ── A consulta por extenso ───────────────────────────────────────────────
//
// `new Date("2026-10-01")` é meia-noite UTC, que no Brasil é 21h do dia 30 —
// sem cuidado, a consulta de quinta vira quarta dentro do prompt.
conferir(
  "a data não volta um dia",
  consultaPorExtenso("2026-10-01", "15:00:00"),
  "quinta-feira, 1 de outubro, às 15:00",
);
conferir(
  "sem hora, só o dia",
  consultaPorExtenso("2026-10-01", null),
  "quinta-feira, 1 de outubro",
);
conferir("sem data, nada", consultaPorExtenso(null, "15:00"), null);
conferir("data torta não vira Invalid Date", consultaPorExtenso("ontem", "15:00"), null);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da resposta do paciente`);
