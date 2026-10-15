// Checagens da janela de "contato novo".
//
// É o que separa o contato que chegou pelo anúncio — que a IA atende — do lead
// de três meses atrás, que já tem combinado com a recepção e que a IA não pode
// atropelar.
//
// Errar para o lado permissivo aqui é a IA entrando numa conversa antiga por
// cima de uma pessoa. Errar para o lado restritivo é ela calar com quem
// acabou de chegar, que é o único caso em que ela deveria falar.
import {
  aConversaAindaEDaIa,
  ehConversaNova,
} from "../supabase/functions/_shared/conversa-nova.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const AGORA = new Date("2026-09-22T12:00:00Z");
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 86_400_000).toISOString();

// ── Sem histórico ────────────────────────────────────────────────────────
// A conversa está nascendo agora. É exatamente o contato do anúncio.
conferir("sem mensagem nenhuma é nova", ehConversaNova(null, AGORA, 7), true);

// ── Dentro e fora da janela ──────────────────────────────────────────────
conferir("de hoje é nova", ehConversaNova(diasAtras(0), AGORA, 7), true);
conferir("de 3 dias é nova", ehConversaNova(diasAtras(3), AGORA, 7), true);
conferir("de 30 dias não é", ehConversaNova(diasAtras(30), AGORA, 7), false);
conferir("de um ano não é", ehConversaNova(diasAtras(365), AGORA, 7), false);

// ── A borda ──────────────────────────────────────────────────────────────
// Estrita: 7 dias exatos com janela de 7 já é antiga. A borda tem que cair
// para um lado só e estar escrita, senão cada leitura do código aposta uma
// coisa.
conferir("6,9 dias ainda é nova", ehConversaNova(diasAtras(6.9), AGORA, 7), true);
conferir("7 dias exatos não é mais", ehConversaNova(diasAtras(7), AGORA, 7), false);
conferir("7,1 dias não é", ehConversaNova(diasAtras(7.1), AGORA, 7), false);

// ── A janela é configurável ──────────────────────────────────────────────
// Quanto tempo um lead continua "novo" é julgamento da clínica, e mudar isso
// não pode exigir deploy.
conferir("com janela de 30, 20 dias é nova", ehConversaNova(diasAtras(20), AGORA, 30), true);
conferir("com janela de 1, 2 dias não é", ehConversaNova(diasAtras(2), AGORA, 1), false);

// ── Datas que não deveriam existir ───────────────────────────────────────
// Data ilegível NÃO pode virar "nova": seria o agente entrando numa conversa
// antiga por causa de um campo corrompido. Fecha a porta.
conferir("data ilegível fecha a porta", ehConversaNova("não é data", AGORA, 7), false);
conferir("data vazia é tratada como sem histórico", ehConversaNova("", AGORA, 7), true);

// Relógio torto na origem: a conversa certamente não é velha.
conferir("data no futuro é nova", ehConversaNova(diasAtras(-5), AGORA, 7), true);

// ── Continuar numa conversa que já é dela ──────────────────────────────────
//
// A outra metade da pergunta. A janela acima decide se a IA pode ENTRAR; esta
// decide se ela pode CONTINUAR. Uma regra só respondendo as duas é o que
// calaria a Luna no dia 12 de um fechamento que começou no dia 1, com a pessoa
// respondendo do outro lado.
//
// O erro para o lado permissivo aqui é a IA assumindo um lead esquecido que ela
// atendeu meses atrás; para o lado restritivo, é ela abandonando uma negociação
// em andamento. Por isso o silêncio é medido, e não a idade.

// O caso que trouxe esta função: conversa de doze dias, pessoa respondendo a
// cada três. A janela de sete dias diria "antiga"; o silêncio diz "está aqui".
conferir(
  "pessoa respondendo a cada 3 dias continua",
  aConversaAindaEDaIa({ iaJaFalou: true, silencioEmDias: 3 }, 7),
  true,
);
conferir(
  "respondeu hoje mesmo continua",
  aConversaAindaEDaIa({ iaJaFalou: true, silencioEmDias: 0 }, 7),
  true,
);
conferir(
  "sumiu por 8 dias não continua",
  aConversaAindaEDaIa({ iaJaFalou: true, silencioEmDias: 8 }, 7),
  false,
);
// A borda é a mesma de `ehConversaNova`, e de propósito: duas bordas
// diferentes para a mesma janela é como elas passam a discordar.
conferir(
  "6,9 dias de silêncio continua",
  aConversaAindaEDaIa({ iaJaFalou: true, silencioEmDias: 6.9 }, 7),
  true,
);
conferir(
  "7 dias exatos não continua",
  aConversaAindaEDaIa({ iaJaFalou: true, silencioEmDias: 7 }, 7),
  false,
);

// A IA nunca falou aqui: não há conversa dela para continuar, e deixar passar
// seria ela ENTRAR numa conversa antiga pela porta errada. Era o caso das 52
// conversas que o motivo "conversa antiga" barrou entre 28/09 e 15/10 — em
// todas as 52 ela nunca havia falado.
conferir(
  "sem a IA ter falado, não continua",
  aConversaAindaEDaIa({ iaJaFalou: false, silencioEmDias: 1 }, 7),
  false,
);
conferir(
  "nem com silêncio zero",
  aConversaAindaEDaIa({ iaJaFalou: false, silencioEmDias: 0 }, 7),
  false,
);

// Primeira mensagem da pessoa: não há anterior, então não há silêncio para
// medir. Quem responde é a regra de entrar, que já diz sim.
conferir(
  "sem mensagem anterior, não continua por aqui",
  aConversaAindaEDaIa({ iaJaFalou: true, silencioEmDias: null }, 7),
  false,
);

// Lixo não abre a porta.
conferir(
  "silêncio não numérico não continua",
  aConversaAindaEDaIa({ iaJaFalou: true, silencioEmDias: Number.NaN }, 7),
  false,
);
conferir(
  "infinito não continua",
  aConversaAindaEDaIa({ iaJaFalou: true, silencioEmDias: Number.POSITIVE_INFINITY }, 7),
  false,
);

// Relógio torto na origem: silêncio negativo é zero, a pessoa certamente não
// ficou calada.
conferir(
  "silêncio negativo conta como zero",
  aConversaAindaEDaIa({ iaJaFalou: true, silencioEmDias: -3 }, 7),
  true,
);

// A janela é a mesma configuração da tela, então ela manda aqui também.
conferir(
  "com janela de 30, 20 dias de silêncio continua",
  aConversaAindaEDaIa({ iaJaFalou: true, silencioEmDias: 20 }, 30),
  true,
);
conferir(
  "com janela de 1, 2 dias de silêncio não",
  aConversaAindaEDaIa({ iaJaFalou: true, silencioEmDias: 2 }, 1),
  false,
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da janela de contato novo`);
