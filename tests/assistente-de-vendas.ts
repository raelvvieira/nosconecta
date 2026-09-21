// Checagens do retrato do funil.
//
// É uma conta sobre datas, e conta sobre data erra calada: um `>=` no lugar de
// um `>` muda quem aparece na lista de "esperando resposta" — e quem some dela
// é justamente quem devia ter sido respondido.
import { analisarFunil, type PessoaNoFunil } from "../src/lib/atendimentos/assistente-de-vendas.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const AGORA = new Date("2026-09-21T12:00:00Z");
/** Uma data a N dias (e opcionalmente N horas) de AGORA. */
const diasAtras = (d: number, horas = 0) =>
  new Date(AGORA.getTime() - (d * 24 + horas) * 60 * 60 * 1000).toISOString();

function pessoa(p: Partial<PessoaNoFunil> & { conversaId: string }): PessoaNoFunil {
  return {
    conversaId: p.conversaId,
    contato: p.contato ?? "Fulano",
    etapa: p.etapa ?? "Primeiro contato",
    ultimaMensagemEm: p.ultimaMensagemEm ?? diasAtras(0),
    // `??` aqui transformaria o `null` explícito de "não se sabe quem falou"
    // num `false` de "foi a pessoa" — e o teste do caso passaria a exercitar
    // outro caso, sem ninguém perceber.
    ultimaFoiDaClinica: p.ultimaFoiDaClinica === undefined ? false : p.ultimaFoiDaClinica,
  };
}

// ── Funil vazio ──────────────────────────────────────────────────────────
{
  const r = analisarFunil([], AGORA);
  conferir("nenhuma conversa", r.totalConversas, 0);
  conferir("nenhuma etapa", r.etapas, []);
  conferir("sem gargalo", r.gargalo, null);
  conferir("nada travado", r.travadas, []);
  // Nunca mais "ainda não analisado": a conta sai na hora da pergunta.
  conferir("sempre tem data", r.geradoEm, AGORA.toISOString());
}

// ── A contagem por etapa ─────────────────────────────────────────────────
{
  const r = analisarFunil(
    [
      pessoa({ conversaId: "a", etapa: "Primeiro contato" }),
      pessoa({ conversaId: "b", etapa: "Primeiro contato" }),
      pessoa({ conversaId: "c", etapa: "Orçamento" }),
    ],
    AGORA,
  );
  conferir("total", r.totalConversas, 3);
  conferir("duas etapas com as contagens certas", r.etapas, [
    { etapa: "Primeiro contato", conversas: 2, travadas: 0 },
    { etapa: "Orçamento", conversas: 1, travadas: 0 },
  ]);
}
// Etapa em branco não some — vira "Sem etapa", que é o que ela é.
conferir(
  "etapa em branco",
  analisarFunil([pessoa({ conversaId: "a", etapa: "   " })], AGORA).etapas[0].etapa,
  "Sem etapa",
);

// ── A borda dos três dias ────────────────────────────────────────────────
// É aqui que um `>` no lugar de `>=` esconderia alguém.
conferir(
  "dois dias e vinte e três horas ainda não travou",
  analisarFunil([pessoa({ conversaId: "a", ultimaMensagemEm: diasAtras(2, 23) })], AGORA).travadas
    .length,
  0,
);
conferir(
  "três dias em ponto já travou",
  analisarFunil([pessoa({ conversaId: "a", ultimaMensagemEm: diasAtras(3) })], AGORA).travadas
    .length,
  1,
);
conferir(
  "mensagem de agora não trava",
  analisarFunil([pessoa({ conversaId: "a", ultimaMensagemEm: diasAtras(0) })], AGORA).travadas
    .length,
  0,
);

// ── O motivo é um fato, não um conselho ──────────────────────────────────
{
  const r = analisarFunil(
    [pessoa({ conversaId: "a", ultimaMensagemEm: diasAtras(5), ultimaFoiDaClinica: false })],
    AGORA,
  );
  conferir("dias parados", r.travadas[0].paradaHaDias, 5);
  conferir(
    "a pessoa está esperando",
    r.travadas[0].motivo,
    "A pessoa escreveu e está sem resposta há 5 dias.",
  );
  // O CRM escrevia uma sugestão com IA. Aqui não há, de propósito.
  conferir("sem sugestão inventada", r.travadas[0].sugestao, null);
}
conferir(
  "a clínica é que falou por último",
  analisarFunil(
    [pessoa({ conversaId: "a", ultimaMensagemEm: diasAtras(4), ultimaFoiDaClinica: true })],
    AGORA,
  ).travadas[0].motivo,
  "A clínica falou por último e não houve resposta há 4 dias.",
);
conferir(
  "conversa sem mensagem nenhuma",
  analisarFunil(
    [pessoa({ conversaId: "a", ultimaMensagemEm: diasAtras(4), ultimaFoiDaClinica: null })],
    AGORA,
  ).travadas[0].motivo,
  "Sem nenhuma mensagem trocada.",
);

// ── Sem data não vira zero ───────────────────────────────────────────────
// Chutar zero esconderia a pessoa da lista; chutar muito a poria no topo.
// Ela continua contando na etapa, que é o que se sabe de verdade.
{
  const r = analisarFunil([pessoa({ conversaId: "a", ultimaMensagemEm: null })], AGORA);
  conferir("sem data não trava", r.travadas.length, 0);
  conferir("mas continua na etapa", r.etapas[0].conversas, 1);
}
conferir(
  "data impossível não trava",
  analisarFunil([pessoa({ conversaId: "a", ultimaMensagemEm: "nada disso" })], AGORA).travadas
    .length,
  0,
);

// ── O gargalo ────────────────────────────────────────────────────────────
{
  const r = analisarFunil(
    [
      pessoa({ conversaId: "a", etapa: "Orçamento", ultimaMensagemEm: diasAtras(10) }),
      pessoa({ conversaId: "b", etapa: "Orçamento", ultimaMensagemEm: diasAtras(9) }),
      pessoa({ conversaId: "c", etapa: "Orçamento" }),
      pessoa({ conversaId: "d", etapa: "Primeiro contato", ultimaMensagemEm: diasAtras(8) }),
    ],
    AGORA,
  );
  conferir("o gargalo é onde há mais gente parada", r.gargalo, {
    etapa: "Orçamento",
    travadas: 2,
    totalNaEtapa: 3,
  });
}
// Empate no número de paradas: aperta mais a etapa menor.
{
  const r = analisarFunil(
    [
      pessoa({ conversaId: "a", etapa: "Grande", ultimaMensagemEm: diasAtras(5) }),
      pessoa({ conversaId: "b", etapa: "Grande" }),
      pessoa({ conversaId: "c", etapa: "Grande" }),
      pessoa({ conversaId: "d", etapa: "Pequena", ultimaMensagemEm: diasAtras(5) }),
    ],
    AGORA,
  );
  conferir("empate resolve pela proporção", r.gargalo?.etapa, "Pequena");
}
// Ninguém parado, nenhum gargalo — e não a etapa "menos pior".
conferir(
  "sem ninguém parado não há gargalo",
  analisarFunil([pessoa({ conversaId: "a" }), pessoa({ conversaId: "b" })], AGORA).gargalo,
  null,
);

// ── A ordem da lista ─────────────────────────────────────────────────────
// Quem está parado há mais tempo primeiro: é a ordem em que alguém realmente
// atacaria a lista.
conferir(
  "o mais parado vem primeiro",
  analisarFunil(
    [
      pessoa({ conversaId: "recente", ultimaMensagemEm: diasAtras(4) }),
      pessoa({ conversaId: "antigo", ultimaMensagemEm: diasAtras(30) }),
      pessoa({ conversaId: "meio", ultimaMensagemEm: diasAtras(12) }),
    ],
    AGORA,
  ).travadas.map((t) => t.conversaId),
  ["antigo", "meio", "recente"],
);

// ── Contato sem nome ─────────────────────────────────────────────────────
conferir(
  "sem nome vira Contato",
  analisarFunil([pessoa({ conversaId: "a", contato: "  ", ultimaMensagemEm: diasAtras(5) })], AGORA)
    .travadas[0].contato,
  "Contato",
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do assistente de vendas`);
