// As contas do painel de Atendimento (src/lib/atendimentos/painel/metricas.ts).
import {
  aguardando,
  atendidas,
  conversao,
  diaDaClinica,
  horaEDia,
  instanteDaClinica,
  mediana,
  movimentoPorHora,
  novasConversas,
  periodosDoFiltro,
  picoDaSemana,
  respostas,
  resumoDeResposta,
  type Mensagem,
} from "../src/lib/atendimentos/painel/metricas.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const MIN = 60_000;
const jid = (n: string) => `5548${n}@s.whatsapp.net`;

// ── Fuso e períodos ─────────────────────────────────────────────────────
// 04/11/2026 13:30 em Brasília (UTC−3) = 16:30 UTC.
const agora = Date.parse("2026-11-04T16:30:00Z");
conferir(
  "meia-noite da clínica",
  new Date(instanteDaClinica("2026-11-04")).toISOString(),
  "2026-11-04T03:00:00.000Z",
);
conferir(
  "dia da clínica às 01h UTC ainda é o dia anterior",
  diaDaClinica(Date.parse("2026-11-04T01:00:00Z")),
  "2026-11-03",
);
conferir(
  "dia da clínica às 03h UTC já é o novo dia",
  diaDaClinica(Date.parse("2026-11-04T03:00:00Z")),
  "2026-11-04",
);

const hoje = periodosDoFiltro("hoje", agora);
conferir(
  "hoje começa na meia-noite da clínica",
  new Date(hoje.atual.de).toISOString(),
  "2026-11-04T03:00:00.000Z",
);
conferir("hoje vai até agora", hoje.atual.ate, agora);
conferir(
  "hoje compara com ontem ATÉ A MESMA HORA",
  [hoje.anterior.de, hoje.anterior.ate],
  [hoje.atual.de - 86_400_000, agora - 86_400_000],
);
const ontem = periodosDoFiltro("ontem", agora);
conferir("ontem é o dia inteiro", ontem.atual.ate - ontem.atual.de, 86_400_000);
const sete = periodosDoFiltro("7d", agora);
conferir(
  "7 dias têm o mesmo tamanho do período anterior",
  sete.atual.ate - sete.atual.de,
  sete.anterior.ate - sete.anterior.de,
);

// ── Hora e dia da semana ────────────────────────────────────────────────
// 04/11/2026 é uma quarta-feira.
conferir("13h30 BRT na quarta", horaEDia(agora), { hora: 13, dia: 3 });
conferir("meia-noite BRT não vira hora 24", horaEDia(Date.parse("2026-11-04T03:00:00Z")).hora, 0);
conferir("23h BRT ainda é a terça", horaEDia(Date.parse("2026-11-04T02:00:00Z")), {
  hora: 23,
  dia: 2,
});

// ── Novas conversas ─────────────────────────────────────────────────────
const entradas = [
  { conversa: jid("90000001"), em: hoje.atual.de + 5 * MIN },
  { conversa: jid("90000002"), em: hoje.atual.de + 60 * MIN },
  { conversa: jid("90000003"), em: hoje.atual.de - 60 * MIN }, // ontem
  { conversa: "120363000000@g.us", em: hoje.atual.de + 10 * MIN }, // grupo
  { conversa: "uuid-antigo", em: hoje.atual.de + 10 * MIN }, // CRM antigo
];
conferir("novas de hoje", novasConversas(entradas, hoje.atual).length, 2);

// ── Atendidas, Luna e equipe ────────────────────────────────────────────
const t0 = hoje.atual.de + 9 * 60 * MIN; // 09:00 BRT
const m = (conversa: string, daClinica: boolean, minutos: number, luna = false): Mensagem => ({
  conversa,
  daClinica,
  em: t0 + minutos * MIN,
  luna,
});
const a = jid("91000001");
const b = jid("91000002");
const c = jid("91000003");
const msgs: Mensagem[] = [
  // a: o paciente escreve, a Luna responde em 1 min
  m(a, false, 0),
  m(a, true, 1, true),
  // b: o paciente escreve, a equipe responde em 10 min
  m(b, false, 5),
  m(b, true, 15, false),
  // c: o paciente escreve e ninguém respondeu
  m(c, false, 20),
];
const at = atendidas(msgs, hoje.atual);
conferir("atendidas: total, Luna, equipe", [at.total, at.luna, at.equipe], [2, 1, 1]);
conferir(
  "conversa com Luna E equipe conta como equipe",
  atendidas([...msgs, m(a, true, 3, false)], hoje.atual).equipe,
  2,
);

// ── Tempo de resposta ───────────────────────────────────────────────────
const resp = respostas(msgs, hoje.atual);
conferir("duas respostas pareadas", resp.map((r) => [Math.round(r.ms / MIN), r.luna]).sort(), [
  [1, true],
  [10, false],
]);
// Várias mensagens seguidas do paciente: conta desde a PRIMEIRA.
const seguidas = respostas(
  [m(a, false, 0), m(a, false, 2), m(a, false, 4), m(a, true, 6, false)],
  hoje.atual,
);
conferir("conta desde a primeira mensagem", Math.round(seguidas[0].ms / MIN), 6);
// Espera de mais de 24h não é tempo de resposta.
const longa = respostas([m(a, false, 0), m(a, true, 25 * 60, false)], {
  de: t0 - MIN,
  ate: t0 + 30 * 60 * MIN,
});
conferir("espera acima de 24h fica de fora", longa.length, 0);
// Resposta pareia mesmo se chegar depois do fim da janela (o que importa é quando o paciente escreveu).
const depois = respostas([m(a, false, 0), m(a, true, 3, true)], { de: t0 - MIN, ate: t0 + MIN });
conferir("a janela é a da pergunta, não a da resposta", depois.length, 1);
const resumo = resumoDeResposta(resp);
conferir("mediana de 1 e 10 min", resumo.medianaMs, 5.5 * MIN);
conferir("mediana da Luna", resumo.medianaLunaMs, 1 * MIN);
conferir("mediana da equipe", resumo.medianaEquipeMs, 10 * MIN);
conferir("metade em até 5 min", resumo.ate5minPct, 50);
conferir("mediana de lista vazia", mediana([]), null);
conferir("mediana ímpar", mediana([5, 1, 3]), 3);

// ── Movimento por hora e pico ───────────────────────────────────────────
const horas = movimentoPorHora(msgs, hoje.atual);
conferir(
  "três recebidas às 9h; as da clínica não contam",
  [horas[9], horas.reduce((x, y) => x + y, 0)],
  [3, 3],
);
const pico = picoDaSemana([agora, agora + MIN, agora + 2 * MIN, agora - 86_400_000]);
conferir("pico: quarta às 13h com 3 mensagens", pico.pico, { dia: 3, hora: 13, mensagens: 3 });
conferir("pico sem mensagens", picoDaSemana([]).pico, null);

// ── Conversão ───────────────────────────────────────────────────────────
const novas = [
  { conversa: jid("99999999"), em: t0 },
  { conversa: jid("98888888"), em: t0 },
  { conversa: jid("97777777"), em: t0 },
];
const ags = [
  // mesmo número, escrito com o nono dígito a mais
  { fone: "5548999999999", contato: null, criadoEm: t0 + 60 * MIN },
  // vínculo explícito da ficha com a conversa
  { fone: null, contato: jid("98888888"), criadoEm: t0 + 90 * MIN },
  // criado ANTES do primeiro contato não conta como conversão dele
  { fone: "5548977777777", contato: null, criadoEm: t0 - 60 * MIN },
];
const cv = conversao(novas, ags);
conferir("conversão: 2 de 3", [cv.agendaram, cv.novas, Math.round(cv.pct ?? 0)], [2, 3, 67]);
conferir("conversão sem novas", conversao([], ags).pct, null);

// ── Aguardando ──────────────────────────────────────────────────────────
conferir(
  "aguardando: a mais antiga há 90 min",
  aguardando([agora - 90 * MIN, agora - 5 * MIN], agora),
  { total: 2, maisAntigaMin: 90 },
);
conferir("ninguém aguardando", aguardando([], agora), { total: 0, maisAntigaMin: null });

if (falhas.length) {
  console.error(`${falhas.length} falha(s):\n  - ${falhas.join("\n  - ")}`);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do painel de atendimento`);
