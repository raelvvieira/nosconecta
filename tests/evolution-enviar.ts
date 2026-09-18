// Checagens do que sai daqui para a Evolution quando o sistema MANDA.
//
// O modo de falhar deste código é o pior que existe no projeto: número
// montado errado não dá erro. A Evolution aceita, responde 200, e a mensagem
// não chega em ninguém. O paciente fica sem resposta e ninguém fica sabendo.
import {
  corpoDeMidia,
  corpoDeTexto,
  destinoDaMensagem,
  ehJidDeGrupo,
  numeroParaEnvio,
  paraBase64,
  rota,
  tipoDeMidia,
} from "../supabase/functions/_shared/evolution-enviar.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── O número, que é onde uma mensagem se perde em silêncio ───────────────
conferir("celular com país", numeroParaEnvio("5548984195309"), "5548984195309");
conferir("celular sem país", numeroParaEnvio("48984195309"), "5548984195309");
conferir("fixo sem país", numeroParaEnvio("4832221100"), "554832221100");
conferir("com máscara", numeroParaEnvio("+55 (48) 98419-5309"), "5548984195309");
conferir("com máscara sem país", numeroParaEnvio("(48) 98419-5309"), "5548984195309");
conferir("espaços e traços", numeroParaEnvio(" 48 9 8419 5309 "), "5548984195309");

// Curto demais é ramal, número truncado ou campo com lixo. Recusar é o certo:
// o erro aparece na fila em vez de virar mensagem que ninguém recebeu.
conferir("ramal", numeroParaEnvio("2345"), null);
conferir("nove dígitos", numeroParaEnvio("984195309"), null);
conferir("vazio", numeroParaEnvio(""), null);
conferir("nulo", numeroParaEnvio(null), null);
conferir("indefinido", numeroParaEnvio(undefined), null);
conferir("só texto", numeroParaEnvio("não informado"), null);
conferir("longo demais", numeroParaEnvio("5548984195309123456"), null);

// Número estrangeiro já em E.164 passa como está — não recebe outro 55.
conferir("portugal", numeroParaEnvio("351912345678"), "351912345678");
conferir("eua", numeroParaEnvio("13055550123"), "5513055550123"); // 11 dígitos = BR
conferir("argentina", numeroParaEnvio("5491123456789"), "5491123456789");

// ── O destino, aceitando o jid do espelho ────────────────────────────────
conferir("jid de pessoa", destinoDaMensagem("5548984195309@s.whatsapp.net"), "5548984195309");
conferir("jid com aparelho", destinoDaMensagem("5548984195309:12@s.whatsapp.net"), "5548984195309");
conferir("telefone solto", destinoDaMensagem("48984195309"), "5548984195309");
// Grupo vai inteiro: a identidade dele é o id, não um telefone.
conferir("grupo inteiro", destinoDaMensagem("120363041234567890@g.us"), "120363041234567890@g.us");
conferir("é grupo", ehJidDeGrupo("120363041234567890@g.us"), true);
conferir("não é grupo", ehJidDeGrupo("5548984195309@s.whatsapp.net"), false);
conferir("destino vazio", destinoDaMensagem(""), null);
conferir("destino nulo", destinoDaMensagem(null), null);

// ── O corpo do texto ─────────────────────────────────────────────────────
conferir("texto simples", corpoDeTexto("5548984195309", "Oi!"), {
  number: "5548984195309",
  text: "Oi!",
});
conferir("texto com quebra", corpoDeTexto("5548984195309", "Linha 1\nLinha 2"), {
  number: "5548984195309",
  text: "Linha 1\nLinha 2",
});

// ── A gaveta da mídia ────────────────────────────────────────────────────
conferir("png é imagem", tipoDeMidia("image/png"), "image");
conferir("jpeg é imagem", tipoDeMidia("image/jpeg"), "image");
conferir("mp4 é vídeo", tipoDeMidia("video/mp4"), "video");
conferir("ogg é áudio", tipoDeMidia("audio/ogg; codecs=opus"), "audio");
conferir("pdf é documento", tipoDeMidia("application/pdf"), "document");
conferir("maiúsculas", tipoDeMidia("IMAGE/PNG"), "image");
conferir("mime vazio vira documento", tipoDeMidia(""), "document");
conferir("mime nulo vira documento", tipoDeMidia(null), "document");

// ── O corpo da mídia ─────────────────────────────────────────────────────
const midia = { nome: "promo.png", tipo: "image/png", base64: "QUJD" };
conferir("mídia com legenda", corpoDeMidia("5548984195309", midia, "Promoção!"), {
  number: "5548984195309",
  mediatype: "image",
  mimetype: "image/png",
  media: "QUJD",
  fileName: "promo.png",
  caption: "Promoção!",
});
// Sem legenda o campo não existe — mandar `caption: ""` faz a Evolution
// enviar uma legenda vazia, que aparece como mensagem em branco embaixo da
// foto de quem recebe.
conferir("mídia sem legenda", corpoDeMidia("5548984195309", midia, null), {
  number: "5548984195309",
  mediatype: "image",
  mimetype: "image/png",
  media: "QUJD",
  fileName: "promo.png",
});
conferir("legenda vazia não vira caption", corpoDeMidia("5548984195309", midia, ""), {
  number: "5548984195309",
  mediatype: "image",
  mimetype: "image/png",
  media: "QUJD",
  fileName: "promo.png",
});
conferir("mime ausente vira octet-stream", corpoDeMidia("55489", { nome: "x", tipo: "", base64: "" }), {
  number: "55489",
  mediatype: "document",
  mimetype: "application/octet-stream",
  media: "",
  fileName: "x",
});

// ── base64 ───────────────────────────────────────────────────────────────
conferir("bytes viram base64", paraBase64(new Uint8Array([65, 66, 67])), "QUJD");
conferir("vazio", paraBase64(new Uint8Array([])), "");
// Arquivo grande não pode estourar a pilha: o anexo de campanha chega a
// alguns MB, e passar o array inteiro como argumentos de uma vez quebra.
const grande = new Uint8Array(300_000).fill(65);
conferir("arquivo grande não estoura", paraBase64(grande).length, Math.ceil(300_000 / 3) * 4);

// ── A rota ───────────────────────────────────────────────────────────────
conferir("rota de texto", rota("sendText", "nos-a1b2c3d4"), "/message/sendText/nos-a1b2c3d4");
conferir("rota de mídia", rota("sendMedia", "nos-a1b2c3d4"), "/message/sendMedia/nos-a1b2c3d4");
conferir("nome com caractere estranho", rota("sendText", "nos a/b"), "/message/sendText/nos%20a%2Fb");

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do envio pela Evolution`);
