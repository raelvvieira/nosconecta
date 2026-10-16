// Checagens da leitura feita no celular.
//
// ── O que está em jogo ─────────────────────────────────────────────────────
//
// Este arquivo decide quando a bolinha de não lidas some. Errar para um lado é
// a bolinha ficar acesa numa conversa já lida — chato, visível, e alguém abre a
// conversa e resolve. Errar para o outro é **apagar a bolinha de uma mensagem
// que ninguém leu**: o paciente fica esperando, a conversa some do radar, e não
// há nada na tela que denuncie.
//
// Por isso quase todo teste aqui é sobre o segundo lado. A regra geral do
// arquivo é: na dúvida, não afirme que está lido.
//
// Os formatos abaixo são os que a Evolution manda de verdade, e variam com a
// versão: `data` ora objeto, ora lista; o id ora `remoteJid`, ora `id`; o
// contador ora número, ora texto.
import {
  EVENTOS_DE_CONVERSA,
  ehConversaDoAparelho,
  foiLidaNoCelular,
  leiturasDoEvento,
} from "../supabase/functions/_shared/leitura-no-celular.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const JID = "5548996881898@s.whatsapp.net";

/** Leu? É a pergunta que a bolinha faz. */
const leu = (evento: unknown) =>
  leiturasDoEvento(evento)
    .filter(foiLidaNoCelular)
    .map((l) => l.conversationId);

// ── O caso que a funcionalidade existe para atender ────────────────────────
conferir(
  "contador zerado numa lista é leitura",
  leu({ data: [{ remoteJid: JID, unreadCount: 0 }] }),
  [JID],
);
conferir("e num objeto só também", leu({ data: { remoteJid: JID, unreadCount: 0 } }), [JID]);
// Algumas versões mandam a lista crua, sem envelope.
conferir("lista sem envelope", leu([{ remoteJid: JID, unreadCount: 0 }]), [JID]);
// E o id às vezes vem em `id`.
conferir("id no lugar de remoteJid", leu({ data: [{ id: JID, unreadCount: 0 }] }), [JID]);
conferir("contador em snake_case", leu({ data: [{ remoteJid: JID, unread_count: 0 }] }), [JID]);
// Número como texto é comum na Evolution.
conferir('o texto "0" é zero', leu({ data: [{ remoteJid: JID, unreadCount: "0" }] }), [JID]);

// ── O lado caro de errar ───────────────────────────────────────────────────
//
// Tudo abaixo tem de devolver "não sei", nunca "está lido".

// O mais importante: evento que não fala de leitura. Uma atualização de nome de
// contato, por exemplo. Sem esta regra, toda mexida no chat apagaria a bolinha.
conferir(
  "contador ausente não é leitura",
  leiturasDoEvento({ data: [{ remoteJid: JID, name: "Yasmin" }] }),
  [],
);
conferir("evento vazio não é leitura", leiturasDoEvento({}), []);
conferir("nulo não é leitura", leiturasDoEvento(null), []);
conferir("data vazia não é leitura", leiturasDoEvento({ data: [] }), []);

// Contador maior que zero: há leitura a fazer, e não é esta.
{
  const r = leiturasDoEvento({ data: [{ remoteJid: JID, unreadCount: 3 }] });
  conferir("contador 3 é lido como 3", r, [{ conversationId: JID, naoLidas: 3 }]);
  conferir("e não conta como lida", r.filter(foiLidaNoCelular).length, 0);
}
conferir('o texto "2" não é leitura', leu({ data: [{ remoteJid: JID, unreadCount: "2" }] }), []);

// Lixo no lugar do número não vira zero.
for (const lixo of ["", "   ", "abc", null, undefined, {}, [], true, Number.NaN]) {
  conferir(
    `contador ${JSON.stringify(lixo) ?? "undefined"} não é leitura`,
    leiturasDoEvento({ data: [{ remoteJid: JID, unreadCount: lixo }] }),
    [],
  );
}

// Negativo não existe. Prender em zero diria "está tudo lido", que é
// exatamente a afirmação que não se pode fazer por engano.
conferir(
  "contador negativo não é leitura",
  leiturasDoEvento({ data: [{ remoteJid: JID, unreadCount: -1 }] }),
  [],
);

// Sem id não dá para saber de qual conversa se fala.
conferir("sem id, nada", leiturasDoEvento({ data: [{ unreadCount: 0 }] }), []);
conferir("id vazio, nada", leiturasDoEvento({ data: [{ remoteJid: "   ", unreadCount: 0 }] }), []);

// ── Várias conversas no mesmo evento ───────────────────────────────────────
//
// A Evolution agrupa. Uma zerada no meio de três não pode arrastar as outras.
{
  const outra = "5551993967887@s.whatsapp.net";
  const terceira = "5511988887777@s.whatsapp.net";
  const r = leu({
    data: [
      { remoteJid: JID, unreadCount: 0 },
      { remoteJid: outra, unreadCount: 5 },
      { remoteJid: terceira, name: "sem contador" },
    ],
  });
  conferir("só a que zerou", r, [JID]);
}

// ── Quem pode ser casada pelo id ───────────────────────────────────────────
//
// O id da conexão própria É o identificador do WhatsApp. As 1.051 conversas
// herdadas do CRM têm id próprio, que não existe no aparelho — mexer nelas por
// este caminho seria casar por coincidência.
conferir("conversa da conexão própria", ehConversaDoAparelho(JID), true);
conferir("grupo não", ehConversaDoAparelho("1203630@g.us"), false);
// `@lid` são participantes de grupo, nunca uma conversa.
conferir("lid não", ehConversaDoAparelho("272659279761347@lid"), false);
conferir("id do CRM antigo não", ehConversaDoAparelho("conv_8f3a21"), false);
conferir("vazio não", ehConversaDoAparelho(""), false);
conferir("número solto não", ehConversaDoAparelho("5548996881898"), false);

// ── Os eventos que chegam aqui ─────────────────────────────────────────────
conferir("a lista de eventos não está vazia", EVENTOS_DE_CONVERSA.length > 0, true);
conferir(
  "e é só de conversa — mensagem não entra",
  EVENTOS_DE_CONVERSA.some((e) => e.startsWith("messages.")),
  false,
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da leitura no celular`);
