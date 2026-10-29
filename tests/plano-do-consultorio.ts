// O plano do consultório: quem tem assistente, quando ela para, e a franquia
// de conversas como proteção (decisões de 29/10).
//
// O que não pode acontecer: a NÓS (com IA, ativa) perder a assistente;
// consultório Básico, suspenso ou com teste vencido ter assistente; uma
// conversa em andamento ser cortada no meio por causa da franquia; o mesmo
// aviso chegar duas vezes no mês.
import {
  avisoDaFranquia,
  cabeNaFranquia,
  comecoDoMesDoBrasil,
  consultorioParado,
  mesDoBrasil,
  semIaPorque,
} from "../supabase/functions/_shared/plano-do-consultorio.ts";
import { podeAbrir, podeVerArea } from "../src/lib/auth/niveis-de-acesso.ts";
import { recursosDaFicha } from "../src/lib/plataforma/recursos.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const agora = new Date("2026-10-30T15:00:00Z");
const NOS = { plano: "ia", situacao: "ativa", teste_ate: null, club_ligado: true };

// ── Quem tem assistente ──────────────────────────────────────────────────
conferir("NÓS: com IA e ativa", semIaPorque(NOS, agora), null);
conferir("sem ficha: nada se desliga", semIaPorque(null, agora), null);
conferir("básico", semIaPorque({ ...NOS, plano: "basico" }, agora), "plano básico");
conferir("suspenso", semIaPorque({ ...NOS, situacao: "suspensa" }, agora), "consultório suspenso");
conferir(
  "teste no prazo",
  semIaPorque({ plano: "ia", situacao: "teste", teste_ate: "2026-11-10T02:59:59Z" }, agora),
  null,
);
conferir(
  "teste vencido",
  semIaPorque({ plano: "ia", situacao: "teste", teste_ate: "2026-10-29T02:59:59Z" }, agora),
  "teste vencido",
);
conferir(
  "teste sem data não vence",
  semIaPorque({ plano: "ia", situacao: "teste", teste_ate: null }, agora),
  null,
);

// ── O sistema inteiro para? ──────────────────────────────────────────────
conferir("básico não para o sistema", consultorioParado({ ...NOS, plano: "basico" }, agora), false);
conferir("suspenso para", consultorioParado({ ...NOS, situacao: "suspensa" }, agora), true);
conferir(
  "teste vencido para",
  consultorioParado({ plano: "ia", situacao: "teste", teste_ate: "2026-10-01T00:00:00Z" }, agora),
  true,
);
conferir(
  "ativa com data antiga não para",
  consultorioParado({ ...NOS, teste_ate: "2020-01-01" }, agora),
  false,
);

// ── Franquia ─────────────────────────────────────────────────────────────
const base = { conversasNoMes: 0, franquia: 1000, extras: 0 };
conferir(
  "conversa já contada continua, mesmo estourado",
  cabeNaFranquia({ ...base, jaContada: true, conversasNoMes: 5000 }),
  "ja_contada",
);
conferir(
  "dentro da franquia",
  cabeNaFranquia({ ...base, jaContada: false, conversasNoMes: 999 }),
  "dentro",
);
conferir(
  "chegou no limite, usa extra",
  cabeNaFranquia({ ...base, jaContada: false, conversasNoMes: 1000, extras: 3 }),
  "usa_extra",
);
conferir(
  "sem extra, estourou",
  cabeNaFranquia({ ...base, jaContada: false, conversasNoMes: 1000 }),
  "estourou",
);
conferir(
  "franquia zero, só extra",
  cabeNaFranquia({ jaContada: false, conversasNoMes: 0, franquia: 0, extras: 0 }),
  "estourou",
);

// ── Avisos ───────────────────────────────────────────────────────────────
conferir(
  "abaixo de 80%: nada",
  avisoDaFranquia({ usadas: 799, franquia: 1000, extras: 0, jaAvisado: 0 }),
  null,
);
conferir("80%", avisoDaFranquia({ usadas: 800, franquia: 1000, extras: 0, jaAvisado: 0 }), 80);
conferir(
  "80% já avisado",
  avisoDaFranquia({ usadas: 900, franquia: 1000, extras: 0, jaAvisado: 80 }),
  null,
);
conferir(
  "100% sem extra",
  avisoDaFranquia({ usadas: 1000, franquia: 1000, extras: 0, jaAvisado: 80 }),
  100,
);
conferir(
  "de 79% direto a 100%: só o de 100%",
  avisoDaFranquia({ usadas: 1000, franquia: 1000, extras: 0, jaAvisado: 0 }),
  100,
);
conferir(
  "100% com extra sobrando não é o fim",
  avisoDaFranquia({ usadas: 1000, franquia: 1000, extras: 50, jaAvisado: 80 }),
  null,
);
conferir(
  "100% já avisado",
  avisoDaFranquia({ usadas: 1200, franquia: 1000, extras: 0, jaAvisado: 100 }),
  null,
);

// ── O mês do Brasil ──────────────────────────────────────────────────────
conferir(
  "31/10 22h em Brasília ainda é outubro",
  mesDoBrasil(new Date("2026-11-01T01:00:00Z")),
  "2026-10",
);
conferir("começo do mês", comecoDoMesDoBrasil(agora).toISOString(), "2026-10-01T03:00:00.000Z");

// ── Menu e rotas ─────────────────────────────────────────────────────────
const basico = recursosDaFicha({ ...NOS, plano: "basico", club_ligado: false }, agora);
conferir("recursos do básico", basico, { ia: false, club: false });
conferir("recursos da NÓS", recursosDaFicha(NOS, agora), { ia: true, club: true });
conferir("recursos sem ficha", recursosDaFicha(null, agora), { ia: true, club: true });
conferir("admin do básico não abre a assistente", podeAbrir("admin", "/agente-ia", basico), false);
conferir("admin do básico não abre o Club", podeVerArea("admin", "club", basico), false);
conferir("admin do básico abre a agenda", podeAbrir("admin", "/agenda", basico), true);
conferir("sem recursos (carregando) vale o nível", podeAbrir("admin", "/agente-ia", null), true);
conferir(
  "plano não dá ao nível o que ele não tem",
  podeVerArea("dentist", "agente_ia", { ia: true, club: true }),
  false,
);

if (falhas.length) {
  console.error(`plano-do-consultorio: ${falhas.length} falha(s)\n` + falhas.join("\n"));
  process.exit(1);
}
console.log(`plano-do-consultorio: ${ok} checagens ok`);
