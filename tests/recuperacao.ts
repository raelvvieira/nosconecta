// Os 16 testes obrigatórios do Recovery Engine, sem mandar mensagem a ninguém.
//
// A parte que decide (planejar, conferir, reclamar, avançar, escolher o
// mecanismo) é pura e é a MESMA que o `agente-followup` usa. Aqui ela roda num
// simulador de relógio: minuto a minuto, com duas rodadas concorrentes lendo a
// mesma conversa, e com os acontecimentos (a pessoa responde, a equipe assume,
// agendou) entrando na hora em que aconteceriam.
import {
  conferirAntesDeEnviar,
  depoisDe,
  instanteLocal,
  janelaAberta,
  mecanismoDaEtapa,
  normalizarConfig,
  novaSequencia,
  pareceGenerica,
  partesLocais,
  pediuParaParar,
  planejarSequencia,
  proximaEtapa,
  reclamar,
  soltarSePresa,
  trilhaDaSequencia,
  type ConfigDeRecuperacao,
  type EstadoDaSequencia,
  type Mecanismo,
  type Trilha,
} from "../supabase/functions/_shared/recuperacao.ts";
import { pedidoDaRetomada, lerRetomada } from "../supabase/functions/_shared/recuperacao-prompt.ts";
import { configInicial, PRESETS } from "../src/lib/agente-ia/recovery.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(
      `${nome}\n    esperado ${JSON.stringify(esperado)}\n    veio     ${JSON.stringify(obtido)}`,
    );
}

const FUSO = "America/Sao_Paulo";
const SEG_A_SAB = [1, 2, 3, 4, 5, 6];
const local = (data: string, hora: string) => instanteLocal(data, hora, FUSO);
const hhmm = (iso: string) => {
  const p = partesLocais(new Date(iso), FUSO);
  return `${p.data.slice(5)} ${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
};

const ligada = (): ConfigDeRecuperacao => ({
  ...configInicial(),
  ligado: true,
  ligadoDesde: "2026-10-01T00:00:00Z",
});

// ── O simulador ──────────────────────────────────────────────────────────

interface Acontecimento {
  em: Date;
  tipo: "resposta" | "assumiu" | "agendou" | "desligou";
}

interface Simulacao {
  origem: Date;
  trilha?: Trilha;
  config?: ConfigDeRecuperacao;
  acontecimentos?: Acontecimento[];
  /** Passos (1, 2…) cujo PRIMEIRO envio falha. */
  falhaNaPrimeira?: number[];
  /** O servidor fica parado neste intervalo: nenhuma rodada roda. */
  parado?: { de: Date; ate: Date };
  disponivel?: { figurinha: boolean; casos: boolean };
  dias?: number;
}

interface Enviada {
  em: string;
  passo: number;
  mecanismo: Mecanismo;
}

function simular(s: Simulacao) {
  const config = s.config ?? ligada();
  const trilha = s.trilha ?? "INITIAL_NO_RESPONSE";
  const plano = planejarSequencia({
    origem: s.origem,
    trilha: config.trilhas[trilha],
    config,
    diasAbertos: SEG_A_SAB,
  });
  let estado: EstadoDaSequencia | null = novaSequencia(plano);
  const enviadas: Enviada[] = [];
  const falhar = new Set(s.falhaNaPrimeira ?? []);
  const acontecimentos = [...(s.acontecimentos ?? [])].sort((a, b) => +a.em - +b.em);
  const fatos = { respondeu: false, assumiu: false, agendou: false, desligou: false };
  const fim = s.origem.getTime() + (s.dias ?? 3) * 86_400_000;

  for (let t = s.origem.getTime(); t <= fim && estado; t += 60_000) {
    const agora = new Date(t);

    // O atendimento cancela NA HORA em que a mensagem chega: não espera rodada.
    while (acontecimentos.length && +acontecimentos[0].em <= t) {
      const a = acontecimentos.shift()!;
      if (a.tipo === "resposta") fatos.respondeu = true;
      if (a.tipo === "assumiu") fatos.assumiu = true;
      if (a.tipo === "agendou") fatos.agendou = true;
      if (a.tipo === "desligou") fatos.desligou = true;
      if (a.tipo === "resposta" || a.tipo === "assumiu") {
        estado = depoisDe(estado, { tipo: "cancelou", motivo: a.tipo });
      }
    }
    if (s.parado && t >= +s.parado.de && t < +s.parado.ate) continue;

    estado = soltarSePresa(estado, agora) ?? estado;
    const etapa = proximaEtapa(estado);
    if (!etapa || new Date(etapa.venceEm) > agora) continue;

    // Duas rodadas leram a mesma conversa ao mesmo tempo (teste 11).
    const lido = estado.passo;
    const rodadaA = reclamar(estado, lido, agora);
    if (!rodadaA) continue;
    estado = rodadaA;
    const rodadaB = reclamar(estado, lido, agora);
    if (rodadaB) throw new Error("duas rodadas pegaram a mesma etapa");

    const veredito = conferirAntesDeEnviar({
      agora,
      etapa,
      pessoaFalouDepois: fatos.respondeu,
      equipeAssumiu: fatos.assumiu,
      agendou: fatos.agendou,
      naoContatar: false,
      agenteLigado: true,
      recuperacaoLigada: !fatos.desligou,
      trilhaLigada: true,
      janelaAberta: janelaAberta(agora, config, SEG_A_SAB),
      cotaDisponivel: true,
      toleranciaMinutos: config.toleranciaMinutos,
    });
    if (veredito.acao === "cancelar") {
      estado = depoisDe(estado, { tipo: "cancelou", motivo: veredito.motivo });
      continue;
    }
    if (veredito.acao === "pular") {
      estado = depoisDe(estado, { tipo: "pulou", motivo: veredito.motivo });
      continue;
    }
    if (veredito.acao === "esperar") {
      estado = depoisDe(estado, { tipo: "esperar", motivo: veredito.motivo });
      continue;
    }

    if (falhar.has(etapa.passo)) {
      falhar.delete(etapa.passo);
      estado = depoisDe(estado, { tipo: "falhou", motivo: "Evolution fora do ar" });
      continue;
    }
    const mecanismo = mecanismoDaEtapa(
      etapa.mecanismo,
      estado.mecanismos,
      s.disponivel ?? { figurinha: false, casos: true },
    );
    enviadas.push({ em: hhmm(agora.toISOString()), passo: etapa.passo, mecanismo });
    estado = depoisDe(estado, { tipo: "enviou", mecanismo });
  }
  return { plano, enviadas, estado };
}

// Quarta, 28/10/2026, 10h em São Paulo.
const AS_10H = local("2026-10-28", "10:00");
const min = (base: Date, m: number) => new Date(base.getTime() + m * 60_000);

// ── Teste 1, 2 e 3: os tempos contam da origem ───────────────────────────
{
  const { plano, enviadas } = simular({ origem: AS_10H });
  conferir(
    "1-3: o plano da trilha principal",
    plano.map((e) => hhmm(e.venceEm)),
    ["10-28 10:20", "10-28 10:45", "10-28 12:45", "10-28 15:45", "10-29 16:00"],
  );
  conferir("1: FU1 sai às 10h20", enviadas[0]?.em, "10-28 10:20");
  conferir(
    "2: FU2 sai 45 min depois da ORIGEM (10h45), não 45 depois do FU1",
    enviadas[1]?.em,
    "10-28 10:45",
  );
  conferir(
    "3: FU3 e FU4 nos minutos 165 e 345 da origem",
    enviadas.slice(2, 4).map((e) => e.em),
    ["10-28 12:45", "10-28 15:45"],
  );
  conferir("16: a despedida sai no dia seguinte e encerra", enviadas[4], {
    em: "10-29 16:00",
    passo: 5,
    mecanismo: "BREAKUP",
  });
  conferir(
    "13: sem figurinha aprovada, o FU2 troca de abordagem",
    enviadas.map((e) => e.mecanismo),
    ["PRESENCE_CHECK", "OPEN_LOOP", "SOCIAL_PROOF", "FRICTION_REDUCTION", "BREAKUP"],
  );
}

// ── Teste 4: respondeu depois do FU1 ─────────────────────────────────────
{
  const { enviadas, estado } = simular({
    origem: AS_10H,
    acontecimentos: [{ em: min(AS_10H, 30), tipo: "resposta" }],
  });
  conferir(
    "4: só o FU1 saiu",
    enviadas.map((e) => e.passo),
    [1],
  );
  conferir("4: sequência cancelada pela resposta", estado?.status, "cancelada");
}

// ── Teste 5: respondeu antes do FU1 ──────────────────────────────────────
{
  const { enviadas } = simular({
    origem: AS_10H,
    acontecimentos: [{ em: min(AS_10H, 5), tipo: "resposta" }],
  });
  conferir("5: nenhum follow-up", enviadas.length, 0);
}

// ── Teste 6: a equipe assumiu ────────────────────────────────────────────
{
  const { enviadas, estado } = simular({
    origem: AS_10H,
    acontecimentos: [{ em: min(AS_10H, 50), tipo: "assumiu" }],
  });
  conferir(
    "6: nada depois de a equipe assumir",
    enviadas.map((e) => e.passo),
    [1, 2],
  );
  conferir("6: cancelada", estado?.status, "cancelada");
}

// ── Teste 7: agendou (pela recepção, sem passar pelo atendimento) ────────
{
  const { enviadas, estado } = simular({
    origem: AS_10H,
    acontecimentos: [{ em: min(AS_10H, 60), tipo: "agendou" }],
  });
  conferir(
    "7: depois de agendar, nenhuma retomada",
    enviadas.map((e) => e.passo),
    [1, 2],
  );
  conferir("7: cancelada por já ter agendado", estado?.motivo, "já agendou");
}

// ── Teste 8: "vou pensar" não recebe a cadência intensa ──────────────────
{
  const { trilha } = trilhaDaSequencia({
    primeiraRespostaDaLuna: false,
    rotulo: "SAID_WILL_THINK",
    retornoCombinado: "",
    ultimaMensagemDaPessoa: "vou pensar e te falo",
    hoje: "2026-10-28",
  });
  conferir("8: vai para a trilha de pensar", trilha, "SAID_WILL_THINK");
  const { enviadas } = simular({ origem: AS_10H, trilha: "SAID_WILL_THINK", dias: 6 });
  conferir(
    "8: nada no mesmo dia; uma informação amanhã e a despedida dias depois",
    enviadas.map((e) => e.em),
    ["10-29 11:00", "11-02 16:00"],
  );
}

// ── Teste 9: recebeu horários e sumiu ────────────────────────────────────
{
  const { enviadas } = simular({ origem: AS_10H, trilha: "SCHEDULE_IGNORED" });
  conferir(
    "9: nenhuma etapa oferece horário de novo",
    enviadas.some((e) => e.mecanismo === "SCHEDULE_OPPORTUNITY"),
    false,
  );
  const pedido = pedidoDaRetomada(
    {
      trilha: "SCHEDULE_IGNORED",
      intensidade: "MEDIUM",
      etapa: 2,
      totalDeEtapas: 3,
      mecanismo: "FRICTION_REDUCTION",
      mecanismosAnteriores: ["PRESENCE_CHECK"],
      perguntaAberta: "Qual desses horários fica melhor?",
      pessoaJaRespondeu: true,
      minutosDeSilencio: 105,
      depoisDaNoite: false,
      temCasos: false,
    },
    "VOCÊ: Tenho quinta 10h ou sexta 15h.",
  );
  conferir(
    "9: o pedido proíbe oferecer horário de novo",
    pedido.includes("Não ofereça horários de novo"),
    true,
  );
}

// ── Teste 10: resposta perto das 19h ─────────────────────────────────────
{
  const as1830 = local("2026-10-28", "18:30");
  const { plano, enviadas } = simular({ origem: as1830 });
  conferir(
    "10: FU1 às 18h50 e, no dia seguinte, só a despedida",
    enviadas.map((e) => `${e.em} ${e.mecanismo}`),
    ["10-28 18:50 PRESENCE_CHECK", "10-29 16:00 BREAKUP"],
  );
  conferir(
    "10: nenhuma mensagem às 9h",
    plano.some((e) => hhmm(e.venceEm).endsWith("09:00")),
    false,
  );

  // Sem despedida no dia seguinte, a noite vira UMA retomada, às 10h.
  const semDespedida = ligada();
  semDespedida.trilhas.INITIAL_NO_RESPONSE.etapas[4].ativa = false;
  const r = simular({ origem: as1830, config: semDespedida });
  conferir(
    "10: as perdidas da noite viram uma só, às 10h",
    r.plano.map((e) => `${hhmm(e.venceEm)} juntou ${e.juntou}`),
    ["10-28 18:50 juntou 0", "10-29 10:00 juntou 2"],
  );
}

// ── Teste 11: duas rodadas na mesma etapa ────────────────────────────────
// (o simulador lança erro se as duas conseguirem reclamar; aqui, a conferência
// direta da troca)
{
  const plano = planejarSequencia({
    origem: AS_10H,
    trilha: ligada().trilhas.INITIAL_NO_RESPONSE,
    config: ligada(),
    diasAbertos: SEG_A_SAB,
  });
  const e = novaSequencia(plano)!;
  const a = reclamar(e, 0, min(AS_10H, 20));
  const b = a ? reclamar(a, 0, min(AS_10H, 20)) : null;
  conferir("11: a primeira rodada pega", a?.status, "enviando");
  conferir("11: a segunda não pega", b, null);
  conferir("11: estado velho também não reclama outro passo", reclamar(e, 1, AS_10H), null);
}

// ── Teste 12: falha no envio ─────────────────────────────────────────────
{
  const { enviadas } = simular({ origem: AS_10H, falhaNaPrimeira: [1] });
  conferir("12: o FU1 sai na nova tentativa, um minuto depois", enviadas[0]?.em, "10-28 10:21");
  conferir("12: e uma vez só", enviadas.filter((e) => e.passo === 1).length, 1);

  const presa: EstadoDaSequencia = {
    ...novaSequencia([
      {
        passo: 1,
        venceEm: AS_10H.toISOString(),
        mecanismo: "PRESENCE_CHECK",
        tipo: "minutos",
        juntou: 0,
      },
      {
        passo: 2,
        venceEm: min(AS_10H, 45).toISOString(),
        mecanismo: "OPEN_LOOP",
        tipo: "minutos",
        juntou: 0,
      },
    ])!,
    status: "enviando",
    enviandoDesde: AS_10H.toISOString(),
  };
  const solta = soltarSePresa(presa, min(AS_10H, 6));
  conferir(
    "12: presa no envio é pulada, nunca reenviada",
    [solta?.status, solta?.passo],
    ["ativa", 1],
  );
  conferir("12: antes de 5 min, ainda não", soltarSePresa(presa, min(AS_10H, 3)), null);

  // O servidor ficou fora do ar entre 10h15 e 11h: as duas rápidas venceram
  // paradas e NÃO saem atrasadas, juntas.
  const r = simular({
    origem: AS_10H,
    parado: { de: min(AS_10H, 15), ate: min(AS_10H, 60) },
  });
  conferir(
    "12: atrasadas são descartadas, sem rajada na volta",
    r.enviadas.map((e) => e.em),
    ["10-28 12:45", "10-28 15:45", "10-29 16:00"],
  );
}

// ── Teste 13: sem mídia aprovada ─────────────────────────────────────────
{
  conferir(
    "13: sem caso no catálogo, a prova social vira informação útil",
    mecanismoDaEtapa("SOCIAL_PROOF", ["PRESENCE_CHECK"], { figurinha: false, casos: false }),
    "USEFUL_INFORMATION",
  );
  conferir(
    "13: com figurinha aprovada, a quebra de padrão fica",
    mecanismoDaEtapa("PATTERN_INTERRUPT", ["PRESENCE_CHECK"], { figurinha: true, casos: false }),
    "PATTERN_INTERRUPT",
  );
  conferir(
    "D4: nunca o mesmo mecanismo duas vezes seguidas",
    mecanismoDaEtapa("OPEN_LOOP", ["OPEN_LOOP"], { figurinha: false, casos: true }),
    "USEFUL_INFORMATION",
  );
  conferir(
    "D4: presença uma vez por sequência",
    mecanismoDaEtapa("PRESENCE_CHECK", ["PRESENCE_CHECK", "OPEN_LOOP"], {
      figurinha: false,
      casos: true,
    }),
    "USEFUL_INFORMATION",
  );
}

// ── Teste 14: outra empresa, outra configuração ──────────────────────────
{
  const outra = ligada();
  outra.trilhas.INITIAL_NO_RESPONSE.etapas = [
    {
      momento: { tipo: "minutos", minutos: 120 },
      mecanismo: "OPEN_LOOP",
      ativa: true,
      condicional: false,
    },
  ];
  const daLuna = simular({ origem: AS_10H });
  const daOutra = simular({ origem: AS_10H, config: outra });
  conferir(
    "14: a outra empresa segue a dela",
    daOutra.enviadas.map((e) => e.em),
    ["10-28 12:00"],
  );
  conferir("14: a da Luna não muda", daLuna.enviadas.length, 5);
  conferir("14: configuração ausente = motor desligado", normalizarConfig(null), null);
  conferir("14: preset nasce desligado", configInicial().ligado, false);
}

// ── Teste 15: mudar a configuração com sequência em andamento ────────────
{
  const config = ligada();
  const plano = planejarSequencia({
    origem: AS_10H,
    trilha: config.trilhas.INITIAL_NO_RESPONSE,
    config,
    diasAbertos: SEG_A_SAB,
  });
  // Alguém troca 45 por 35 na tela depois que a sequência nasceu.
  config.trilhas.INITIAL_NO_RESPONSE.etapas[1].momento = { tipo: "minutos", minutos: 35 };
  conferir(
    "15: a sequência em andamento segue o calendário com que nasceu",
    hhmm(plano[1].venceEm),
    "10-28 10:45",
  );
  const nova = planejarSequencia({
    origem: local("2026-10-28", "11:00"),
    trilha: config.trilhas.INITIAL_NO_RESPONSE,
    config,
    diasAbertos: SEG_A_SAB,
  });
  conferir("15: a que nasce depois usa o novo tempo", hhmm(nova[1].venceEm), "10-28 11:35");
}

// ── Teste 16: a despedida encerra e nada atrasado sai depois ─────────────
{
  const { estado, enviadas } = simular({ origem: AS_10H, dias: 6 });
  conferir(
    "16: encerrada pela despedida",
    [estado?.status, estado?.motivo],
    ["encerrada", "despedida enviada"],
  );
  conferir("16: nada depois da despedida", enviadas.length, 5);
  // Sábado à tarde: a despedida pula o domingo, que o consultório não atende.
  const sabado = simular({ origem: local("2026-10-31", "16:00") });
  conferir("16: despedida vai para segunda", sabado.enviadas.at(-1)?.em, "11-02 16:00");
}

// ── A trilha da sequência ────────────────────────────────────────────────
{
  const base = { retornoCombinado: "", ultimaMensagemDaPessoa: "ok", hoje: "2026-10-28" };
  conferir(
    "trilha: primeira resposta é sempre INITIAL",
    trilhaDaSequencia({ ...base, primeiraRespostaDaLuna: true, rotulo: "PRICE_SILENCE" }).trilha,
    "INITIAL_NO_RESPONSE",
  );
  conferir(
    "trilha: pedido para parar ganha de tudo",
    trilhaDaSequencia({
      ...base,
      primeiraRespostaDaLuna: true,
      rotulo: "INITIAL_NO_RESPONSE",
      ultimaMensagemDaPessoa: "Por favor, pare de me mandar mensagem",
    }).trilha,
    "STOP",
  );
  conferir(
    "trilha: retorno com data válida",
    trilhaDaSequencia({
      ...base,
      primeiraRespostaDaLuna: false,
      rotulo: "PROMISED_CALLBACK",
      retornoCombinado: "2026-10-29",
    }),
    { trilha: "PROMISED_CALLBACK", retornoEm: "2026-10-29" },
  );
  conferir(
    "trilha: retorno sem data vira 'vou pensar'",
    trilhaDaSequencia({ ...base, primeiraRespostaDaLuna: false, rotulo: "PROMISED_CALLBACK" })
      .trilha,
    "SAID_WILL_THINK",
  );
  conferir(
    "trilha: rótulo desconhecido vira conversa interrompida",
    trilhaDaSequencia({ ...base, primeiraRespostaDaLuna: false, rotulo: "qualquer coisa" }).trilha,
    "ACTIVE_CONVERSATION_DROP",
  );
  const callback = planejarSequencia({
    origem: AS_10H,
    trilha: PRESETS.PROMISED_CALLBACK,
    config: ligada(),
    diasAbertos: SEG_A_SAB,
    retornoEm: "2026-10-30",
  });
  conferir(
    "trilha: retorno combinado sai no dia combinado",
    callback.map((e) => hhmm(e.venceEm)),
    ["10-30 10:00"],
  );
  conferir(
    "STOP nunca planeja",
    planejarSequencia({
      origem: AS_10H,
      trilha: normalizarConfig({
        trilhas: { STOP: { etapas: [{ momento: { tipo: "minutos", minutos: 5 } }] } },
      })!.trilhas.STOP,
      config: ligada(),
      diasAbertos: SEG_A_SAB,
    }).length,
    0,
  );
}

// ── Pedido para parar e texto genérico ───────────────────────────────────
{
  for (const t of [
    "para de me mandar mensagem",
    "Não quero mais receber",
    "me tira dessa lista",
    "não tenho interesse",
    "Não me mande mais nada",
  ]) {
    conferir(`parar: ${t}`, pediuParaParar(t), true);
  }
  for (const t of ["não sei se paro de fumar antes", "quero pensar", "tenho interesse sim"]) {
    conferir(`não é parar: ${t}`, pediuParaParar(t), false);
  }
  conferir(
    "genérico: 'ainda tem interesse?' fora da presença",
    pareceGenerica("Oi! Ainda tem interesse?", "USEFUL_INFORMATION"),
    true,
  );
  conferir("genérico: 'você sumiu' nunca", pareceGenerica("Você sumiu rs", "PRESENCE_CHECK"), true);
  conferir(
    "genérico: presença na etapa de presença é ok",
    pareceGenerica("Mariana, conseguiu ver?", "PRESENCE_CHECK"),
    false,
  );
  conferir(
    "genérico: mensagem com motivo novo passa",
    pareceGenerica(
      "A Dra. Mariane protege a gengiva antes do gel, então costuma ser bem tranquilo.",
      "USEFUL_INFORMATION",
    ),
    false,
  );
}

// ── O pedido e a leitura da resposta ─────────────────────────────────────
{
  const pedido = pedidoDaRetomada(
    {
      trilha: "INITIAL_NO_RESPONSE",
      intensidade: "HIGH",
      etapa: 3,
      totalDeEtapas: 5,
      mecanismo: "SOCIAL_PROOF",
      mecanismosAnteriores: ["PRESENCE_CHECK", "OPEN_LOOP"],
      perguntaAberta: "Você já fez clareamento alguma vez?",
      pessoaJaRespondeu: false,
      minutosDeSilencio: 165,
      depoisDaNoite: false,
      temCasos: true,
    },
    "PACIENTE: Quero agendar uma avaliação!\nVOCÊ: Oii, qual procedimento você quer avaliar?",
  );
  for (const trecho of [
    '"recovery_track": "INITIAL_NO_RESPONSE"',
    '"previous_mechanisms": [',
    "Acompanhe o tom que a pessoa usou",
    "pular = true",
    "Já usados nesta sequência: PRESENCE_CHECK, OPEN_LOOP",
  ]) {
    conferir(`pedido traz: ${trecho}`, pedido.includes(trecho), true);
  }
  conferir(
    "leitura: JSON certo",
    lerRetomada('{"mensagem":"Oi","mecanismoUsado":"OPEN_LOOP","pular":false,"casoEnviado":""}'),
    { mensagem: "Oi", mecanismoUsado: "OPEN_LOOP", pular: false, casoEnviado: "" },
  );
  conferir("leitura: lixo vira pular", lerRetomada("Oi tudo bem?").pular, true);
  conferir(
    "leitura: mensagem vazia vira pular",
    lerRetomada('{"mensagem":"","pular":false}').pular,
    true,
  );
}

// ── A configuração não aceita valor torto ────────────────────────────────
{
  const c = normalizarConfig({
    ligado: true,
    janelaInicio: 25,
    janelaFim: -3,
    toleranciaMinutos: 9999,
    trilhas: {
      INITIAL_NO_RESPONSE: {
        etapas: [
          { momento: { tipo: "minutos", minutos: -5 }, mecanismo: "INVENTADO" },
          { momento: { tipo: "dia", dias: 1, hora: "03:00" }, mecanismo: "BREAKUP" },
        ],
      },
    },
  })!;
  conferir("config: janela corrigida", [c.janelaInicio, c.janelaFim], [23, 24]);
  conferir("config: tolerância com teto", c.toleranciaMinutos, 120);
  conferir("config: minuto mínimo 1", c.trilhas.INITIAL_NO_RESPONSE.etapas[0].momento, {
    tipo: "minutos",
    minutos: 1,
  });
  conferir(
    "config: mecanismo desconhecido vira OPEN_LOOP",
    c.trilhas.INITIAL_NO_RESPONSE.etapas[0].mecanismo,
    "OPEN_LOOP",
  );
  conferir(
    "config: hora fora da janela vai para o começo dela",
    c.trilhas.INITIAL_NO_RESPONSE.etapas[1].momento,
    {
      tipo: "dia",
      dias: 1,
      hora: "23:00",
    },
  );
}

if (falhas.length) {
  console.error(`recuperacao: ${falhas.length} falha(s)`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`recuperacao: ${ok} checagens ok`);
