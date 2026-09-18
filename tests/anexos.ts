// Checagens da leitura de anexos, nas DUAS formas que existem no sistema.
//
// O CRM grava `file_type`/`data_url`/`thumb_url` (nomes do Chatwoot); o
// espelho grava `tipo`/`url`/`thumbUrl`. Ler uma com o leitor da outra não dá
// erro: devolve lista vazia, e a foto que o paciente mandou vira uma bolha em
// branco.
import { anexosDoEspelho, mapAttachments, nomeDoArquivo } from "../src/lib/atendimentos/anexos.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── A forma do CRM ───────────────────────────────────────────────────────
conferir(
  "anexo do CRM",
  mapAttachments([
    {
      id: 9,
      file_type: "image",
      data_url: "https://crm/x/foto.png",
      thumb_url: "https://crm/t.png",
    },
  ]),
  [
    {
      id: "9",
      tipo: "image",
      url: "https://crm/x/foto.png",
      thumbUrl: "https://crm/t.png",
      nome: "foto.png",
    },
  ],
);
conferir("CRM sem url é descartado", mapAttachments([{ id: 1, file_type: "image" }]), []);
conferir("CRM não é lista", mapAttachments(null), []);

// ── A forma do espelho ───────────────────────────────────────────────────
conferir(
  "anexo do espelho",
  anexosDoEspelho([
    {
      id: "ABC",
      tipo: "image",
      url: "https://evo/foto.jpg",
      thumbUrl: "https://evo/foto.jpg",
      nome: "foto.jpg",
    },
  ]),
  [
    {
      id: "ABC",
      tipo: "image",
      url: "https://evo/foto.jpg",
      thumbUrl: "https://evo/foto.jpg",
      nome: "foto.jpg",
    },
  ],
);
// O caso que motivou tudo: a Evolution nem sempre manda a URL. O anexo EXISTE
// e precisa continuar existindo, senão a mensagem vira uma bolha vazia.
conferir(
  "anexo sem url sobrevive",
  anexosDoEspelho([{ id: "ABC", tipo: "image", url: null, thumbUrl: null, nome: null }]),
  [{ id: "ABC", tipo: "image", url: null, thumbUrl: null, nome: null }],
);
conferir(
  "tipo desconhecido vira arquivo",
  anexosDoEspelho([{ id: "1", tipo: "sticker3d", url: "https://evo/a.bin" }]),
  [
    {
      id: "1",
      tipo: "file",
      url: "https://evo/a.bin",
      thumbUrl: "https://evo/a.bin",
      nome: "a.bin",
    },
  ],
);
conferir(
  "sem thumb cai para a url",
  anexosDoEspelho([{ id: "1", tipo: "video", url: "https://evo/v.mp4" }]),
  [
    {
      id: "1",
      tipo: "video",
      url: "https://evo/v.mp4",
      thumbUrl: "https://evo/v.mp4",
      nome: "v.mp4",
    },
  ],
);
// Sem id e sem url, a posição serve de chave — duas linhas sem id não podem
// virar a mesma chave de React.
conferir(
  "sem id usa a posição",
  anexosDoEspelho([{ tipo: "audio" }, { tipo: "audio" }]).map((a) => a.id),
  ["0", "1"],
);
conferir("espelho não é lista", anexosDoEspelho("nada"), []);
conferir("espelho vazio", anexosDoEspelho([]), []);
conferir(
  "item nulo é pulado",
  anexosDoEspelho([null, { tipo: "file", url: "https://e/a.pdf" }]).length,
  1,
);

// ── Cada leitor lê os campos DELE ────────────────────────────────────────
// O leitor do CRM até aproveita a `url` (ela é um dos nomes que ele aceita),
// mas o `tipo` do espelho ele ignora — e tudo vira "arquivo". Foto virando
// cartão de arquivo é justamente o sintoma de estar usando o leitor errado.
conferir(
  "leitor do CRM perde o tipo do espelho",
  mapAttachments([{ id: "1", tipo: "image", url: "https://evo/f.png" }]),
  [
    {
      id: "1",
      tipo: "file",
      url: "https://evo/f.png",
      thumbUrl: "https://evo/f.png",
      nome: "f.png",
    },
  ],
);

// ── O nome tirado da URL ─────────────────────────────────────────────────
conferir(
  "nome com assinatura na query",
  nomeDoArquivo("https://crm/orcamento.pdf?sig=abc"),
  "orcamento.pdf",
);
conferir("id opaco não vira nome", nomeDoArquivo("https://crm/9f8a7b6c"), null);
conferir(
  "nome com espaço",
  nomeDoArquivo("https://crm/Or%C3%A7amento%20final.pdf"),
  "Orçamento final.pdf",
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens de anexos`);
