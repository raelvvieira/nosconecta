// Checagens da tradução dos eventos da Evolution.
//
// A Evolution fala uma língua diferente do CRM: onde o Chatwoot mandava
// `contact.phone_number` e `message_type: 0|1`, ela manda `key.remoteJid` e
// `key.fromMe`. E o texto não tem lugar fixo — mora em `conversation`, em
// `extendedTextMessage.text`, ou na legenda de uma imagem.
//
// Nada disso levanta exceção quando erra: produz mensagem em branco, do lado
// errado da conversa, ou com a data de hoje.
import {
  anexoDaMensagem,
  dataDaMensagem,
  ehGrupo,
  mensagemDoEvento,
  telefoneDoJid,
  textoDaMensagem,
} from "../supabase/functions/_shared/evolution-mapear.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── O telefone, que é a chave que cola tudo ──────────────────────────────
conferir("jid comum", telefoneDoJid("5548984195309@s.whatsapp.net"), "5548984195309");
// O ":" aparece quando o WhatsApp identifica o aparelho dentro do jid.
conferir("jid com aparelho", telefoneDoJid("5548984195309:12@s.whatsapp.net"), "5548984195309");
conferir("grupo não tem telefone", telefoneDoJid("120363041234567890@g.us"), null);
conferir("vazio", telefoneDoJid(""), null);
conferir("nulo", telefoneDoJid(null), null);
conferir("curto demais não é telefone", telefoneDoJid("123@s.whatsapp.net"), null);
conferir("longo demais também não", telefoneDoJid("1234567890123456789@s.whatsapp.net"), null);
conferir("é grupo", ehGrupo("120363041234567890@g.us"), true);
conferir("não é grupo", ehGrupo("5548984195309@s.whatsapp.net"), false);

// ── O texto, que muda de lugar conforme o tipo ───────────────────────────
conferir("texto simples", textoDaMensagem({ conversation: "Bom dia" }), "Bom dia");
conferir(
  "resposta a outra mensagem",
  textoDaMensagem({ extendedTextMessage: { text: "Pode ser quinta?" } }),
  "Pode ser quinta?",
);
conferir(
  "legenda de foto",
  textoDaMensagem({ imageMessage: { caption: "olha o raio-x", url: "x" } }),
  "olha o raio-x",
);
conferir("foto sem legenda não tem texto", textoDaMensagem({ imageMessage: { url: "x" } }), null);
conferir("áudio não tem texto", textoDaMensagem({ audioMessage: { url: "a" } }), null);
conferir(
  "mensagem temporária",
  textoDaMensagem({ ephemeralMessage: { message: { conversation: "some em 24h" } } }),
  "some em 24h",
);
conferir("vazio não conta como texto", textoDaMensagem({ conversation: "   " }), null);
conferir("sem message", textoDaMensagem(null), null);

// ── Anexos ───────────────────────────────────────────────────────────────
conferir("imagem", anexoDaMensagem({ imageMessage: { url: "u", mimetype: "image/jpeg" } }), {
  tipo: "image",
  url: "u",
  mimetype: "image/jpeg",
  nome: null,
});
conferir(
  "documento leva o nome",
  anexoDaMensagem({ documentMessage: { url: "d", mimetype: "application/pdf", fileName: "orcamento.pdf" } }),
  { tipo: "file", url: "d", mimetype: "application/pdf", nome: "orcamento.pdf" },
);
// A Evolution nem sempre manda a URL no evento — o anexo existe do mesmo
// jeito, e o tipo já basta para a prévia dizer "📷 Foto".
conferir("sem url ainda é anexo", anexoDaMensagem({ imageMessage: { mimetype: "image/png" } }), {
  tipo: "image",
  url: null,
  mimetype: "image/png",
  nome: null,
});
conferir("figurinha conta como imagem", anexoDaMensagem({ stickerMessage: { url: "s" } })?.tipo, "image");
conferir("texto não tem anexo", anexoDaMensagem({ conversation: "oi" }), null);
conferir("sem message", anexoDaMensagem(undefined), null);

// ── A data ───────────────────────────────────────────────────────────────
conferir("segundos", dataDaMensagem(1757851200), "2025-09-14T12:00:00.000Z");
conferir("milissegundos", dataDaMensagem(1757851200000), "2025-09-14T12:00:00.000Z");
conferir("em texto", dataDaMensagem("1757851200"), "2025-09-14T12:00:00.000Z");
// Sem data, quem chama decide — inventar "agora" poria a mensagem no topo da
// conversa como se tivesse acabado de chegar.
conferir("ausente é nulo", dataDaMensagem(null), null);
conferir("zero é nulo", dataDaMensagem(0), null);
conferir("texto qualquer é nulo", dataDaMensagem("ontem"), null);

// ── O evento inteiro ─────────────────────────────────────────────────────
const recebida = mensagemDoEvento({
  key: { id: "3EB0ABC", remoteJid: "5548984195309@s.whatsapp.net", fromMe: false },
  pushName: "Margareth",
  message: { conversation: "Bom dia, queria marcar" },
  messageTimestamp: 1757851200,
});
conferir("mensagem recebida", recebida, {
  crmMessageId: "3EB0ABC",
  crmConversationId: "5548984195309@s.whatsapp.net",
  crmContactId: "5548984195309@s.whatsapp.net",
  fromMe: false,
  body: "Bom dia, queria marcar",
  sentAt: "2025-09-14T12:00:00.000Z",
  attachments: [],
  phone: "5548984195309",
  contactName: "Margareth",
  ehGrupo: false,
});

// `pushName` na mensagem que a CLÍNICA manda é o nome da própria clínica —
// gravá-lo como nome do contato renomearia o paciente.
const enviada = mensagemDoEvento({
  key: { id: "X1", remoteJid: "5548984195309@s.whatsapp.net", fromMe: true },
  pushName: "NÓS Odontologia",
  message: { conversation: "Claro!" },
  messageTimestamp: 1757851500,
});
conferir("enviada não traz nome do contato", enviada?.contactName, null);
conferir("enviada é fromMe", enviada?.fromMe, true);

conferir("sem id não vira linha", mensagemDoEvento({ key: { remoteJid: "x@s.whatsapp.net" } }), null);
conferir("sem conversa não vira linha", mensagemDoEvento({ key: { id: "a" } }), null);
conferir("evento vazio", mensagemDoEvento({}), null);

const doGrupo = mensagemDoEvento({
  key: { id: "G1", remoteJid: "120363041234567890@g.us", fromMe: false },
  message: { conversation: "alguém viu?" },
  messageTimestamp: 1757851200,
});
conferir("grupo entra sem telefone", doGrupo?.phone, null);
conferir("grupo é marcado como grupo", doGrupo?.ehGrupo, true);

if (falhas.length) {
  console.error(`FALHOU (${falhas.length}):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da tradução da Evolution`);
