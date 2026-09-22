// Checagens de quais conversas viram matéria-prima do aprendizado.
//
// O que está em jogo: o manual é escrito UMA vez por rodada, a partir de no
// máximo 20 conversas. Escolher errado não dá erro em lugar nenhum — dá um
// manual que soa como outra clínica, e a IA passa a falar assim com paciente.
//
// Os dois modos de errar:
//
//   Aprender de monólogo — 855 das mensagens da clínica são lembrete e
//   confirmação, muitas em conversas onde ninguém respondeu. Um manual tirado
//   dali ensina a mandar aviso, não a atender.
//
//   Aprender do que não deu certo — com 318 conversas disponíveis e só 20
//   vagas, gastar vaga com conversa que morreu é perder a chance de ver uma
//   que terminou em paciente.
import {
  contarPorConversa,
  escolherConversas,
  MINIMO_DE_CADA_LADO,
} from "../supabase/functions/_shared/corpus-de-aprendizado.ts";
import type { ConversaDoCorpus } from "../supabase/functions/_shared/corpus-de-aprendizado.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

function conversa(p: Partial<ConversaDoCorpus> & { conversationId: string }): ConversaDoCorpus {
  return {
    conversationId: p.conversationId,
    contactName: p.contactName ?? null,
    ehPaciente: p.ehPaciente ?? false,
    daClinica: p.daClinica ?? 3,
    doContato: p.doContato ?? 3,
    ultimaEm: p.ultimaEm ?? "2026-09-01T12:00:00Z",
  };
}
const ids = (r: { conversationId: string }[]) => r.map((c) => c.conversationId);
const vazio = new Set<string>();

// ── Monólogo fica de fora ────────────────────────────────────────────────
// O caso real: conversa com 6 lembretes da clínica e nenhuma resposta.
conferir(
  "só a clínica falou: não entra",
  escolherConversas([conversa({ conversationId: "a", daClinica: 6, doContato: 0 })], vazio, 10),
  [],
);
conferir(
  "só o contato falou: também não",
  escolherConversas([conversa({ conversationId: "a", daClinica: 0, doContato: 4 })], vazio, 10),
  [],
);
// Uma de cada lado é o mínimo, e é aceito: "Vocês atendem sábado?" / "Atendemos
// sim, das 8 às 12" já é um par pergunta-resposta com o que aprender.
conferir(
  "uma de cada lado basta",
  ids(
    escolherConversas([conversa({ conversationId: "a", daClinica: 1, doContato: 1 })], vazio, 10),
  ),
  ["a"],
);
conferir("o mínimo é 1 de cada lado", MINIMO_DE_CADA_LADO, 1);

// ── Quem virou paciente vem primeiro ─────────────────────────────────────
// Mesmo perdendo em profundidade: desfecho comprovado vale mais que volume.
conferir(
  "paciente na frente, mesmo com troca mais curta",
  ids(
    escolherConversas(
      [
        conversa({ conversationId: "longa", daClinica: 20, doContato: 20 }),
        conversa({
          conversationId: "virou-paciente",
          daClinica: 2,
          doContato: 2,
          ehPaciente: true,
        }),
      ],
      vazio,
      10,
    ),
  ),
  ["virou-paciente", "longa"],
);
conferir(
  "e a fonte registrada diz qual foi qual",
  escolherConversas(
    [
      conversa({ conversationId: "p", ehPaciente: true }),
      conversa({ conversationId: "c", ehPaciente: false }),
    ],
    vazio,
    10,
  ).map((c) => c.source),
  ["paciente", "conversa"],
);

// ── Profundidade: o MENOR dos dois lados ─────────────────────────────────
// 20 da clínica para 1 do contato é insistência. 4 para 4 é conversa. Se o
// critério fosse o total, a insistência ganharia (21 contra 8) e a IA
// aprenderia a perseguir quem não responde.
conferir(
  "insistência perde para conversa equilibrada",
  ids(
    escolherConversas(
      [
        conversa({ conversationId: "insistencia", daClinica: 20, doContato: 1 }),
        conversa({ conversationId: "equilibrada", daClinica: 4, doContato: 4 }),
      ],
      vazio,
      10,
    ),
  ),
  ["equilibrada", "insistencia"],
);

// ── Empate desempatado pela data ─────────────────────────────────────────
// Preço e procedimento mudam; entre duas iguais, a de agora ensina melhor.
conferir(
  "empate vai para a mais recente",
  ids(
    escolherConversas(
      [
        conversa({ conversationId: "velha", ultimaEm: "2026-01-10T09:00:00Z" }),
        conversa({ conversationId: "nova", ultimaEm: "2026-09-20T09:00:00Z" }),
      ],
      vazio,
      10,
    ),
  ),
  ["nova", "velha"],
);
// Data ausente não pode derrubar a ordenação inteira com NaN.
conferir(
  "sem data não quebra",
  ids(
    escolherConversas(
      [
        conversa({ conversationId: "sem-data", ultimaEm: "" }),
        conversa({ conversationId: "com-data", ultimaEm: "2026-09-20T09:00:00Z" }),
      ],
      vazio,
      10,
    ),
  ),
  ["com-data", "sem-data"],
);

// ── Já conhecida não volta ───────────────────────────────────────────────
// O índice único recusaria a gravação de qualquer jeito. O problema é outro:
// reapresentar a mesma conversa todo dia gastaria a vaga de uma ainda não lida,
// e o manual pararia de evoluir sem ninguém perceber.
conferir(
  "conversa já aprendida não volta",
  ids(
    escolherConversas(
      [conversa({ conversationId: "ja-lida" }), conversa({ conversationId: "nova" })],
      new Set(["ja-lida"]),
      10,
    ),
  ),
  ["nova"],
);
conferir(
  "id vazio é ignorado",
  escolherConversas([conversa({ conversationId: "" })], vazio, 10),
  [],
);

// ── O corte ──────────────────────────────────────────────────────────────
conferir(
  "corta em max, mantendo os melhores",
  ids(
    escolherConversas(
      [
        conversa({ conversationId: "c", daClinica: 1, doContato: 1 }),
        conversa({ conversationId: "a", ehPaciente: true }),
        conversa({ conversationId: "b", daClinica: 9, doContato: 9 }),
      ],
      vazio,
      2,
    ),
  ),
  ["a", "b"],
);
conferir(
  "max 0 devolve nada",
  escolherConversas([conversa({ conversationId: "a" })], vazio, 0),
  [],
);
conferir("lista vazia devolve nada", escolherConversas([], vazio, 10), []);

// ── A contagem ───────────────────────────────────────────────────────────
// A mesma regra do que vira transcrição depois: sem texto não conta. Se as
// duas divergissem, uma conversa entraria por dez mensagens e chegaria ao
// modelo com duas.
{
  const contas = contarPorConversa([
    { crm_conversation_id: "a", from_me: true, body: "Oi! Tudo bem?" },
    { crm_conversation_id: "a", from_me: false, body: "tudo :)" },
    { crm_conversation_id: "a", from_me: true, body: "   " }, // só espaços
    { crm_conversation_id: "a", from_me: false, body: null }, // foto sem legenda
    { crm_conversation_id: "a", from_me: true, body: "cliente chato", is_private: true },
    { crm_conversation_id: "b", from_me: true, body: "Lembrete da consulta" },
    { crm_conversation_id: "", from_me: true, body: "sem conversa" },
  ]);
  conferir("conta os dois lados", contas.get("a"), { daClinica: 1, doContato: 1 });
  conferir("mensagem sem texto não conta", contas.get("b"), { daClinica: 1, doContato: 0 });
  conferir("linha sem conversa é ignorada", contas.has(""), false);
  conferir("só as conversas vistas", contas.size, 2);
}

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do corpus de aprendizado`);
