// Checagens de "ler o conjunto" e "não repetir".
//
// ── A conversa que estes testes guardam ─────────────────────────────────
//
// 29/09, 18:40. Quatro bolhas em dezessete segundos, três respostas dizendo o
// mesmo endereço. As frases abaixo são as que a pessoa leu no celular dela,
// copiadas do espelho — é isso que torna o limite de semelhança conferível em
// vez de escolhido no chute.
//
// Os modos de errar:
//
//   **Barrar resposta nova.** É o pior: a pessoa fica sem resposta nenhuma, e
//   em silêncio. Por isso o limite é conferido contra pares legítimos da mesma
//   conversa, e não só contra os repetidos.
//
//   **Deixar passar a repetição.** Era o defeito: abertura diferente, miolo
//   igual. Comparar frase inteira não pega; comparar conjunto de palavras pega.
//
//   **Achar que mensagem vazia é repetida.** Duas frases sem palavra nenhuma
//   não são parecidas, são ausentes.
//
//   **Partir o bloco no lugar errado.** Se o corte pegar fala da clínica, ela
//   volta ao modelo como se fosse pergunta do paciente.
import {
  LIMITE_DE_REPETICAO,
  blocoSemResposta,
  jaDisseIssoAgora,
  semelhanca,
} from "../supabase/functions/_shared/nao-repetir.ts";
import type { FalaDaConversa } from "../supabase/functions/_shared/historico-da-conversa.ts";
import { pedidoDeResposta } from "../supabase/functions/_shared/modelo-de-atendimento.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}
function acimaDoLimite(nome: string, a: string, b: string) {
  const s = semelhanca(a, b);
  if (s >= LIMITE_DE_REPETICAO) ok++;
  else falhas.push(`${nome} — deveria passar de ${LIMITE_DE_REPETICAO}, deu ${s.toFixed(3)}`);
}
function abaixoDoLimite(nome: string, a: string, b: string) {
  const s = semelhanca(a, b);
  if (s < LIMITE_DE_REPETICAO) ok++;
  else falhas.push(`${nome} — deveria ficar abaixo de ${LIMITE_DE_REPETICAO}, deu ${s.toFixed(3)}`);
}

// ── As três respostas reais de 18:41 ─────────────────────────────────────
const R1 =
  "Boa tarde! A NÓS Florianópolis fica na R. José Brognoli, 117, Saco dos Limões, sala 612.";
const R2 = "Entendi! A NÓS Florianópolis fica na R. José Brognoli, 117, Saco dos Limões, sala 612.";
const R3 = "Fica na NÓS Florianópolis: R. José Brognoli, 117, Saco dos Limões, sala 612.";

acimaDoLimite("a 1ª e a 2ª são a mesma resposta", R1, R2);
acimaDoLimite("a 1ª e a 3ª são a mesma resposta", R1, R3);
acimaDoLimite("a 2ª e a 3ª são a mesma resposta", R2, R3);

conferir("a 2ª seria barrada tendo a 1ª saído", jaDisseIssoAgora(R2, [R1]), R1);
conferir("a 3ª seria barrada tendo as duas saído", jaDisseIssoAgora(R3, [R1, R2]), R1);
conferir("a 1ª sai, porque não havia nada antes", jaDisseIssoAgora(R1, []), null);

// ── Pares legítimos da mesma conversa, que NÃO podem ser barrados ────────
const ABRE =
  "Oii, aqui é a Luna, auxiliar da Dra. Mariane 😊 O combo de clareamento em consultório com limpeza fica R$ 399.";
const FECHA = "Perfeito, vou deixar essa confirmação com a equipe, e eles te retornam por aqui.";
const PERGUNTA = "E me conta, você já fez clareamento alguma vez antes?";

abaixoDoLimite("abertura contra fechamento", ABRE, FECHA);
abaixoDoLimite("abertura contra pergunta", ABRE, PERGUNTA);
abaixoDoLimite("endereço contra fechamento", R1, FECHA);
conferir(
  "resposta nova passa mesmo com três anteriores",
  jaDisseIssoAgora(PERGUNTA, [R1, R2, FECHA]),
  null,
);

// O caso vizinho perigoso: mesmo assunto, informação NOVA. Tem de passar.
const PRECO_1 = "O clareamento de consultório com limpeza fica R$ 600.";
const PRECO_2 = "O clareamento caseiro personalizado fica R$ 790, e dá pra parcelar em até 10x.";
abaixoDoLimite("mesmo assunto, valor diferente", PRECO_1, PRECO_2);
conferir("preço novo não é barrado pelo preço antigo", jaDisseIssoAgora(PRECO_2, [PRECO_1]), null);

// ── Vazio ────────────────────────────────────────────────────────────────
conferir("duas vazias não são parecidas", semelhanca("", ""), 0);
conferir("vazia nunca é barrada", jaDisseIssoAgora("", [""]), null);
conferir("só pontuação não é barrada", jaDisseIssoAgora("...", ["..."]), null);
conferir("nula não quebra", jaDisseIssoAgora(null, [null]), null);

// ── Acento e caixa não podem separar frases iguais ───────────────────────
acimaDoLimite(
  "acento e caixa não contam",
  "A NÓS Florianópolis fica no Saco dos Limões",
  "a nos florianopolis fica no saco dos limoes",
);

// ── O bloco sem resposta ─────────────────────────────────────────────────
const fala = (deQuem: "clinica" | "paciente", texto: string): FalaDaConversa => ({ deQuem, texto });

{
  // A conversa real, até o instante em que ela deveria ter respondido UMA vez.
  const historico = [
    fala("paciente", "Qual é o preço do combo especial?"),
    fala("clinica", "Oii, aqui é a Luna, auxiliar da Dra. Mariane 😊"),
    fala("paciente", "Oii tudo"),
    fala("paciente", "Boa tarde"),
    fala("paciente", "Nunca fiz"),
    fala("paciente", "Aonde fica consultório"),
  ];
  const { anteriores, semResposta } = blocoSemResposta(historico);
  conferir("as quatro bolhas vão juntas", semResposta, [
    "Oii tudo",
    "Boa tarde",
    "Nunca fiz",
    "Aonde fica consultório",
  ]);
  conferir("e o contexto para antes delas", anteriores.length, 2);
  conferir(
    "nenhuma fala da clínica entra no bloco",
    anteriores[anteriores.length - 1].deQuem,
    "clinica",
  );
}

{
  // A clínica falou por último: não há nada sem resposta.
  const historico = [fala("paciente", "Oi"), fala("clinica", "Oii, tudo bem?")];
  conferir("clínica falou por último, bloco vazio", blocoSemResposta(historico).semResposta, []);
  conferir("e o contexto é a conversa inteira", blocoSemResposta(historico).anteriores.length, 2);
}

{
  // Ninguém da clínica falou ainda: é a pessoa chegando pelo anúncio.
  const historico = [fala("paciente", "Oi"), fala("paciente", "Vi o anúncio")];
  conferir("sem fala da clínica, tudo está sem resposta", blocoSemResposta(historico).semResposta, [
    "Oi",
    "Vi o anúncio",
  ]);
  conferir("e não sobra contexto", blocoSemResposta(historico).anteriores, []);
}

conferir("histórico vazio não quebra", blocoSemResposta([]).semResposta, []);
conferir(
  "bolha em branco sai do bloco",
  blocoSemResposta([fala("paciente", "   ")]).semResposta,
  [],
);

// ── O pedido que chega ao modelo ─────────────────────────────────────────
//
// É aqui que o defeito morava: "responda à mensagem que acabou de chegar",
// no singular, com as outras três só no pano de fundo.
{
  const historico = "PACIENTE: Qual é o preço do combo especial?\nVOCÊ: Oii, aqui é a Luna 😊";
  const pedido = pedidoDeResposta(historico, [
    "Oii tudo",
    "Boa tarde",
    "Nunca fiz",
    "Aonde fica consultório",
  ]);

  conferir(
    "as quatro aparecem no pedido",
    [
      pedido.includes("- Oii tudo"),
      pedido.includes("- Boa tarde"),
      pedido.includes("- Nunca fiz"),
      pedido.includes("- Aonde fica consultório"),
    ],
    [true, true, true, true],
  );
  conferir(
    "pede UMA resposta para o conjunto",
    pedido.includes("Escreva UMA resposta para o conjunto"),
    true,
  );
  conferir("proíbe responder uma por uma", pedido.includes("Não responda uma por uma"), true);
  conferir("diz quantas são", pedido.includes("Leia as 4 juntas"), true);
  conferir(
    "proíbe repetir o que já disse",
    pedido.includes("Não repita informação que você já deu"),
    true,
  );
  conferir("o histórico continua indo", pedido.includes("Conversa até agora:"), true);
  conferir(
    "e não sobrou o pedido no singular",
    pedido.includes("Mensagem que acabou de chegar"),
    false,
  );
}

{
  // Uma bolha só: o caso comum não pode virar lista de um item.
  const pedido = pedidoDeResposta("", ["Qual o valor do clareamento?"]);
  conferir(
    "uma só vai no singular",
    pedido.includes("Mensagem que acabou de chegar do paciente:\nQual o valor do clareamento?"),
    true,
  );
  conferir(
    "sem histórico, diz que é a primeira",
    pedido.includes("Esta é a primeira mensagem da conversa."),
    true,
  );
  conferir(
    "e não pede resposta de conjunto",
    pedido.includes("Escreva UMA resposta para o conjunto"),
    false,
  );
}

{
  // Bolha em branco no meio não pode virar marcador vazio na lista.
  const pedido = pedidoDeResposta("", ["Oi", "   ", "Tudo bem?"]);
  conferir("branco sai da lista", pedido.includes("- \n"), false);
  conferir("e sobram duas", pedido.includes("Leia as 2 juntas"), true);
}

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens de não repetir`);
