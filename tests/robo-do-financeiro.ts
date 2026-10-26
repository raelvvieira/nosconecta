// O robô do financeiro só lê comprovante se souber que a mensagem tem foto.
//
// O caso que motivou: ele perguntava por `m.anexo`, campo que o espelho não
// tem — quem guarda a mídia é `attachments`. A pergunta devolvia `undefined`
// toda vez, o robô decidia "não tem foto" e atravessava o comprovante sem
// olhar, sem erro nenhum na tela de ninguém.
//
// A checagem atravessa o tradutor de verdade, do evento cru da Evolution até a
// resposta, para não testar uma cópia da forma que o espelho tem: foi justamente
// imaginar a forma errado que deixou o defeito passar.
import {
  mensagemDoEvento,
  temFotoDoEspelho,
} from "../supabase/functions/_shared/evolution-mapear.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (obtido === esperado) ok++;
  else falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

/** O evento `messages.upsert` no formato que a Evolution manda. */
function evento(message: Record<string, unknown>) {
  return {
    key: { id: "BAE5VM0A0O0Z01", remoteJid: "5548999112233@g.us", fromMe: false },
    pushName: "Juliano",
    messageTimestamp: 1761530000,
    message,
  };
}

const comFoto = mensagemDoEvento(
  evento({ imageMessage: { url: "https://evolution/x.jpg", mimetype: "image/jpeg" } }),
);
conferir("foto do evento vira foto no espelho", temFotoDoEspelho(comFoto!), true);

const soTexto = mensagemDoEvento(evento({ conversation: "paguei o mercado de hoje" }));
conferir("texto sem mídia não é foto", temFotoDoEspelho(soTexto!), false);

const documento = mensagemDoEvento(
  evento({ documentMessage: { fileName: "nf-312.pdf", mimetype: "application/pdf" } }),
);
conferir("documento não é foto", temFotoDoEspelho(documento!), false);

// A Evolution trata figurinha como imagem, e o tradutor mantém: é desenho, e o
// robô tem de olhar para poder dizer que não é comprovante.
const figurinha = mensagemDoEvento(evento({ stickerMessage: { url: "https://evolution/s.webp" } }));
conferir("figurinha vale como imagem", temFotoDoEspelho(figurinha!), true);

// O mesmo valor vindo de outro lugar — a fila do disparo grava `attachments: []`
// — tem de dizer "não tem foto", e não quebrar.
conferir(
  "espelho sem anexo nenhum",
  temFotoDoEspelho({ ...soTexto!, attachments: [] }),
  false,
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da foto no espelho`);
