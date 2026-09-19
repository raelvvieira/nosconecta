// Checagens da leitura da resposta de envio da Evolution.
//
// O defeito que isto previne já aconteceu: a mensagem chega no WhatsApp de
// quem recebe e não aparece na conversa de quem mandou. Sem erro, sem aviso —
// só uma bolha que nunca surge.
import { mensagemEnviada } from "../supabase/functions/_shared/espelho-evolution.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const chave = { remoteJid: "555193967887@s.whatsapp.net", fromMe: true, id: "3EB0ABC123" };

// ── A forma direta ───────────────────────────────────────────────────────
{
  const m = mensagemEnviada({
    key: chave,
    message: { conversation: "teste" },
    messageTimestamp: 1789779600,
    status: "PENDING",
  });
  conferir("id da mensagem", m?.crmMessageId, "3EB0ABC123");
  conferir("conversa é o jid", m?.crmConversationId, "555193967887@s.whatsapp.net");
  conferir("saiu da clínica", m?.fromMe, true);
  conferir("texto", m?.body, "teste");
  conferir("telefone", m?.phone, "555193967887");
  conferir("data", m?.sentAt, new Date(1789779600 * 1000).toISOString());
}

// ── A forma envelopada ───────────────────────────────────────────────────
// Versões da Evolution diferem nisto. Apostar na errada custa a mensagem não
// aparecer na conversa.
{
  const m = mensagemEnviada({
    data: { key: chave, message: { conversation: "oi" }, messageTimestamp: 1789779600 },
  });
  conferir("envelopada em data", m?.crmMessageId, "3EB0ABC123");
  conferir("texto da envelopada", m?.body, "oi");
}

// ── Mídia com legenda ────────────────────────────────────────────────────
{
  const m = mensagemEnviada({
    key: chave,
    message: { imageMessage: { caption: "Promoção!", mimetype: "image/png", url: "https://e/f.enc" } },
    messageTimestamp: 1789779600,
  });
  conferir("legenda vira o texto", m?.body, "Promoção!");
  conferir("anexo existe", m?.attachments.length, 1);
}

// ── O nome NÃO pode ser gravado a partir daqui ───────────────────────────
// Em mensagem que a clínica manda, o `pushName` é o nome DELA. Gravado por
// cima, renomearia o paciente.
{
  const m = mensagemEnviada({
    key: chave,
    pushName: "NÓS Odontologia",
    message: { conversation: "oi" },
    messageTimestamp: 1789779600,
  });
  conferir("nome da clínica não vira nome do contato", m?.contactName, null);
}

// ── Respostas que não dão para espelhar ──────────────────────────────────
conferir("sem id", mensagemEnviada({ key: { remoteJid: "555@s.whatsapp.net" } }), null);
conferir("sem jid", mensagemEnviada({ key: { id: "X" } }), null);
conferir("vazia", mensagemEnviada({}), null);
conferir("nula", mensagemEnviada(null), null);
conferir("texto solto", mensagemEnviada("erro"), null);

// ── Grupo ────────────────────────────────────────────────────────────────
{
  const m = mensagemEnviada({
    key: { remoteJid: "120363041234567890@g.us", fromMe: true, id: "G1" },
    message: { conversation: "aviso" },
    messageTimestamp: 1789779600,
  });
  conferir("grupo é marcado", m?.ehGrupo, true);
  conferir("grupo não tem telefone", m?.phone, null);
}

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da mensagem enviada`);
