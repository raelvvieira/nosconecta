// Checagens da autoavaliação da Luna.
//
// ── Por que estas checagens, e não outras ───────────────────────────────
//
// O que pode dar errado aqui não é o texto da lição: é ELA SER ESCRITA na hora
// errada, sobre a conversa errada, com o desfecho errado. Uma lição negativa
// numa conversa que fechou no dia seguinte ensina a IA a se culpar por conversas
// que deram certo, e ninguém vai reler as cem lições para descobrir isso.
//
// Os modos de errar:
//
//   **Avaliar no meio da conversa.** A conversa ainda vai mudar. Duas lições da
//   mesma conversa se contradizendo é pior que nenhuma.
//
//   **Chamar de vitória o que uma pessoa fechou.** A Luna não marca consulta
//   hoje: ela conduz e passa. Se uma pessoa assumiu, a pergunta é o que faltou.
//
//   **Avaliar conversa em que ela nunca falou.** A lição seria sobre a condução
//   de outra pessoa.
//
//   **Data ilegível virando "encerrada".** Geraria lição sobre uma conversa que
//   talvez esteja acontecendo agora.
import {
  MOTIVOS,
  SILENCIO_PARA_AVALIAR_HORAS,
  desfechoDaSessao,
  licaoDoJson,
  promptDaLicao,
  type SessaoAvaliavel,
} from "../supabase/functions/_shared/licoes-do-atendimento.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const AGORA = new Date("2026-09-28T12:00:00Z");
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString();

function sessao(p: Partial<SessaoAvaliavel> = {}): SessaoAvaliavel {
  return {
    falouAlgumaVez: p.falouAlgumaVez ?? true,
    ultimaMensagemEm: p.ultimaMensagemEm === undefined ? horasAtras(1) : p.ultimaMensagemEm,
    agendou: p.agendou ?? false,
    humanoAssumiu: p.humanoAssumiu ?? false,
  };
}

// ── Quando NÃO avaliar ───────────────────────────────────────────────────
conferir(
  "conversa em andamento não rende lição",
  desfechoDaSessao(sessao({ ultimaMensagemEm: horasAtras(1) }), AGORA),
  null,
);
conferir(
  "conversa em que ela nunca falou não rende lição",
  desfechoDaSessao(sessao({ falouAlgumaVez: false, ultimaMensagemEm: horasAtras(100) }), AGORA),
  null,
);
conferir(
  "nem quando ela nunca falou e a consulta foi marcada",
  desfechoDaSessao(sessao({ falouAlgumaVez: false, agendou: true }), AGORA),
  null,
);
conferir("sem data da última mensagem, espera", desfechoDaSessao(sessao({ ultimaMensagemEm: null }), AGORA), null);
conferir(
  "data ilegível não vira conversa encerrada",
  desfechoDaSessao(sessao({ ultimaMensagemEm: "ontem de manhã" }), AGORA),
  null,
);

// ── A borda do silêncio ──────────────────────────────────────────────────
conferir("a janela é de 24 horas", SILENCIO_PARA_AVALIAR_HORAS, 24);
conferir(
  "uma hora antes da borda, ainda espera",
  desfechoDaSessao(sessao({ ultimaMensagemEm: horasAtras(23) }), AGORA),
  null,
);
conferir(
  "na borda exata, avalia",
  desfechoDaSessao(sessao({ ultimaMensagemEm: horasAtras(24) }), AGORA),
  "nao_agendou",
);
conferir(
  "depois da borda, avalia",
  desfechoDaSessao(sessao({ ultimaMensagemEm: horasAtras(72) }), AGORA),
  "nao_agendou",
);
// Relógio torto na origem (mensagem no futuro) não pode virar "encerrada".
conferir(
  "mensagem no futuro não encerra a conversa",
  desfechoDaSessao(sessao({ ultimaMensagemEm: new Date(AGORA.getTime() + 3_600_000).toISOString() }), AGORA),
  null,
);

// ── O desfecho positivo ──────────────────────────────────────────────────
conferir(
  "agendou sozinha é reforço positivo, sem esperar silêncio",
  desfechoDaSessao(sessao({ agendou: true, ultimaMensagemEm: horasAtras(1) }), AGORA),
  "agendou",
);
// A honestidade que sustenta o aprendizado: consulta marcada DEPOIS de uma
// pessoa assumir não é mérito da condução dela.
conferir(
  "com pessoa no meio, agendamento não é vitória dela",
  desfechoDaSessao(sessao({ agendou: true, humanoAssumiu: true }), AGORA),
  "nao_agendou",
);
conferir(
  "pessoa assumiu e não fechou: negativo, depois do silêncio",
  desfechoDaSessao(sessao({ humanoAssumiu: true, ultimaMensagemEm: horasAtras(30) }), AGORA),
  "nao_agendou",
);
conferir(
  "pessoa assumiu há pouco e nada aconteceu: ainda espera",
  desfechoDaSessao(sessao({ humanoAssumiu: true, ultimaMensagemEm: horasAtras(2) }), AGORA),
  null,
);

// ── A leitura da resposta do modelo ──────────────────────────────────────
{
  const l = licaoDoJson({
    o_que_funcionou: "  Chamei pelo primeiro nome e ofereci dois horários.  ",
    o_que_faltou: "",
    motivo: "não se aplica",
    momento_decisivo: '"Pode ser quinta às 14:30?"',
    sugestao_para_o_manual: "Oferecer os dois horários já na segunda mensagem.",
    confianca: "alta",
  });
  conferir("tira o espaço em volta", l.oQueFuncionou, "Chamei pelo primeiro nome e ofereci dois horários.");
  conferir("aceita o motivo da lista", l.motivo, "não se aplica");
  conferir("guarda a confiança", l.confianca, "alta");
}
// Motivo que o modelo inventou não pode entrar: a tela CONTA motivos, e uma
// categoria nova viraria uma coluna de um.
conferir(
  "motivo fora da lista cai em não deu para saber",
  licaoDoJson({ motivo: "vibe ruim" }).motivo,
  "não deu para saber",
);
conferir("confiança fora da lista cai em baixa", licaoDoJson({ confianca: "altíssima" }).confianca, "baixa");
// Resposta vazia não pode virar "undefined" na tela.
{
  const l = licaoDoJson({});
  conferir("campo ausente vira vazio", l.oQueFaltou, "");
  conferir("e não a palavra undefined", JSON.stringify(l).includes("undefined"), false);
}
conferir("resposta que não é objeto não estoura", licaoDoJson(null).motivo, "não deu para saber");
conferir("a lista de motivos tem não se aplica", MOTIVOS.includes("não se aplica"), true);

// ── O prompt ─────────────────────────────────────────────────────────────
const base = {
  nomeDoContato: "Gabriela",
  anuncio: "COMBO ESPECIAL!\nLimpeza + Clareamento",
  transcricao: "A PESSOA: oi, vi o anúncio\nVOCÊ: oi Gabriela!",
  manual: "## Como abrir\nChame pelo primeiro nome.",
};
{
  const p = promptDaLicao({ ...base, desfecho: "agendou", humanoAssumiu: false, agendou: true });
  conferir("fala na segunda pessoa, com ela", p.includes("Você é a Luna"), true);
  conferir("diz que virou consulta", p.includes("VIROU CONSULTA MARCADA"), true);
  conferir("pede para deixar o que faltou vazio", p.includes("`o_que_faltou` vazio"), true);
  conferir("traz o nome da pessoa", p.includes("Gabriela"), true);
  conferir("traz o anúncio citado", p.includes("> COMBO ESPECIAL!"), true);
  conferir("traz o manual para a sugestão apontar", p.includes("Chame pelo primeiro nome"), true);
  conferir("e a conversa", p.includes("A PESSOA: oi, vi o anúncio"), true);
}
{
  const p = promptDaLicao({ ...base, desfecho: "nao_agendou", humanoAssumiu: true, agendou: true });
  conferir("com pessoa no meio, pergunta o que faltou", p.includes("faltou para você chegar"), true);
  conferir("e não chama de vitória", p.includes("VIROU CONSULTA MARCADA"), false);
}
{
  const p = promptDaLicao({ ...base, desfecho: "nao_agendou", humanoAssumiu: false, agendou: false });
  conferir("conversa morta diz que ninguém assumiu", p.includes("ninguém assumiu"), true);
  // Sem esta instrução o modelo inventa culpa para ter o que escrever, e a IA
  // aprende a se punir por conversas que ela não controlava.
  conferir("manda não inventar culpa", p.includes("Inventar culpa"), true);
}
{
  const p = promptDaLicao({
    ...base,
    manual: null,
    anuncio: null,
    nomeDoContato: null,
    desfecho: "nao_agendou",
    humanoAssumiu: false,
    agendou: false,
  });
  conferir("sem manual, não abre seção de manual", p.includes("O seu manual"), false);
  conferir("sem anúncio, não cita anúncio", p.includes("chegou por este anúncio"), false);
  conferir("e ainda traz a conversa", p.includes("## A conversa"), true);
}

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens das lições do atendimento`);
