// Checagens de para quem a automação manda.
//
// O jeito de errar aqui não faz barulho: devolver `null` a mais e o paciente
// fica sem a confirmação da consulta, com um `skipped_no_contact` no log que
// ninguém lê. Foi assim por semanas, enquanto o destinatário dependia de uma
// ida ao CRM que podia falhar — e falhava para os 1.156 pacientes que tinham
// telefone e nenhum contato lá.
import { montarAlvo } from "../supabase/functions/_shared/alvo-de-envio.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── O caso que motivou a mudança ─────────────────────────────────────────
// Paciente com telefone e sem nenhum contato no CRM. Antes, isto exigia criar
// o contato lá antes de mandar; hoje o telefone basta.
conferir("só telefone já é endereço", montarAlvo({ telefone: "5548984195309" }), {
  contact_id: null,
  conversation_id: null,
  phone: "5548984195309",
});

// ── Só o contato do CRM ──────────────────────────────────────────────────
// Ficha sem telefone: o número ainda pode ser achado no espelho, então o alvo
// existe. Sumir com ele aqui apagaria quem só tem histórico de WhatsApp.
conferir("só contato do CRM ainda vale", montarAlvo({ contatoDaFicha: "42" }), {
  contact_id: "42",
  conversation_id: null,
  phone: null,
});

// ── Os dois juntos ───────────────────────────────────────────────────────
conferir(
  "telefone e contato vão juntos",
  montarAlvo({ telefone: "5551993967887", contatoDaFicha: "42" }),
  { contact_id: "42", conversation_id: null, phone: "5551993967887" },
);

// O contato que o EVENTO trouxe ganha do da ficha: é dele que fala a conversa
// que disparou a automação.
conferir(
  "o contato do evento manda",
  montarAlvo({ contatoDoEvento: "99", contatoDaFicha: "42" })?.contact_id,
  "99",
);
// Sem o do evento, cai no da ficha.
conferir("sem o do evento, o da ficha", montarAlvo({ contatoDaFicha: "42" })?.contact_id, "42");

// ── Quando não há para quem mandar ───────────────────────────────────────
conferir("ficha vazia", montarAlvo({}), null);
conferir("tudo nulo", montarAlvo({ telefone: null, contatoDaFicha: null }), null);
conferir("tudo indefinido", montarAlvo({ telefone: undefined }), null);

// ── Branco não é dado ────────────────────────────────────────────────────
// Telefone em branco gravado no alvo faria o envio achar que tem endereço e
// pular os degraus que achariam o número de verdade.
conferir("telefone em branco não conta", montarAlvo({ telefone: "   " }), null);
conferir(
  "telefone em branco não esconde o contato",
  montarAlvo({ telefone: "  ", contatoDaFicha: "42" }),
  { contact_id: "42", conversation_id: null, phone: null },
);
conferir("contato em branco não conta", montarAlvo({ contatoDaFicha: " " }), null);
conferir(
  "contato em branco no evento cai para a ficha",
  montarAlvo({ contatoDoEvento: "", contatoDaFicha: "42" })?.contact_id,
  "42",
);

// ── Espaços em volta não viram parte do número ───────────────────────────
conferir(
  "telefone chega limpo",
  montarAlvo({ telefone: " 5548984195309 " })?.phone,
  "5548984195309",
);

// ── A conversa nasce vazia ───────────────────────────────────────────────
// O alvo nunca traz conversa: quem envia descobre a conversa pelo número, e
// inventar uma aqui mandaria a mensagem para dentro de uma thread errada.
conferir("sem conversa", montarAlvo({ telefone: "5548984195309" })?.conversation_id, null);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens de para quem a mensagem vai`);
