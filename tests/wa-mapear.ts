// Checagens da leitura do CRM para o espelho.
//
// Estas três regras erram CALADAS: data mal lida põe a conversa no lugar
// errado da lista, anexo mal lido some do chat, e `message_type` mal lido põe
// a fala da clínica do lado do paciente — este último já aconteceu em
// produção uma vez, com a comparação estrita em número.
import {
  caixaDaConversa,
  mapearAnexos,
  paraIso,
  saiuDaClinica,
  situacaoDaConversa,
} from "../supabase/functions/_shared/wa-mapear.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── Datas: o CRM usa os três formatos ────────────────────────────────────
conferir("epoch em segundos", paraIso(1757851200), "2025-09-14T12:00:00.000Z");
conferir("epoch em milissegundos", paraIso(1757851200000), "2025-09-14T12:00:00.000Z");
conferir("ISO passa direto", paraIso("2026-09-14T15:04:29.000Z"), "2026-09-14T15:04:29.000Z");
// Epoch em TEXTO: o CRM já mandou número como string uma vez. Sem este
// caso, `Date.parse` devolveria NaN, a data viraria "agora" e a mensagem
// saltaria para o topo da conversa.
conferir("epoch em texto é lido como epoch", paraIso("1757851200"), "2025-09-14T12:00:00.000Z");
conferir("epoch em texto com espaços", paraIso(" 1757851200 "), "2025-09-14T12:00:00.000Z");
conferir("ausente é nulo, não agora", paraIso(null), null);
conferir("vazio é nulo", paraIso(""), null);
conferir("zero é nulo", paraIso(0), null);
// Texto que não é data não pode virar "hoje": a conversa saltaria para o topo
// da caixa de entrada como se tivesse acabado de chegar.
conferir("texto qualquer é nulo", paraIso("ontem"), null);

// ── Direção da mensagem ──────────────────────────────────────────────────
conferir("1 é da clínica", saiuDaClinica(1), true);
conferir("\"1\" (string) também — o bug de produção", saiuDaClinica("1"), true);
conferir("\"outgoing\" também", saiuDaClinica("outgoing"), true);
conferir("0 é do paciente", saiuDaClinica(0), false);
conferir("\"0\" é do paciente", saiuDaClinica("0"), false);
conferir("ausente é do paciente", saiuDaClinica(undefined), false);
// 2 = activity e 3 = template no Chatwoot: não são fala da clínica no chat.
conferir("2 (atividade) não é da clínica", saiuDaClinica(2), false);

// ── Anexos ───────────────────────────────────────────────────────────────
conferir(
  "imagem com miniatura",
  mapearAnexos([{ id: 7, file_type: "image", data_url: "u.jpg", thumb_url: "t.jpg" }]),
  [{ id: "7", tipo: "image", url: "u.jpg", thumbUrl: "t.jpg" }],
);
conferir(
  "sem miniatura cai para a própria url",
  mapearAnexos([{ id: 8, file_type: "audio", data_url: "a.ogg" }]),
  [{ id: "8", tipo: "audio", url: "a.ogg", thumbUrl: "a.ogg" }],
);
// Tipo desconhecido vira "file" em vez de sumir: um orçamento em PDF não pode
// desaparecer do histórico porque o CRM chamou o formato de outro nome.
conferir(
  "tipo desconhecido vira arquivo",
  mapearAnexos([{ id: 9, file_type: "document", data_url: "o.pdf" }]),
  [{ id: "9", tipo: "file", url: "o.pdf", thumbUrl: "o.pdf" }],
);
conferir("sem anexos", mapearAnexos(undefined), []);
conferir("não-lista não quebra", mapearAnexos({ id: 1 }), []);
conferir("lista vazia", mapearAnexos([]), []);
conferir("maiúsculas no tipo", mapearAnexos([{ id: 1, file_type: "IMAGE" }])[0].tipo, "image");

// ── Situação ─────────────────────────────────────────────────────────────
conferir("resolvida", situacaoDaConversa("resolved"), "resolved");
conferir("pendente", situacaoDaConversa("pending"), "pending");
conferir("aberta", situacaoDaConversa("open"), "open");
// Qualquer coisa desconhecida cai em "open" — some da lista é pior que
// aparecer aberta, e a coluna tem CHECK que recusaria outro valor.
conferir("desconhecida vira aberta", situacaoDaConversa("snoozed"), "open");
conferir("ausente vira aberta", situacaoDaConversa(undefined), "open");

// ── Caixa (por qual número entrou) ───────────────────────────────────────
conferir("inbox_id direto", caixaDaConversa({ inbox_id: 12 }), "12");
conferir("inboxId em camelo", caixaDaConversa({ inboxId: "13" }), "13");
conferir("aninhado em inbox.id", caixaDaConversa({ inbox: { id: 14 } }), "14");
conferir("nenhuma forma é nulo", caixaDaConversa({}), null);
conferir("vazio é nulo, não string vazia", caixaDaConversa({ inbox_id: "  " }), null);

if (falhas.length) {
  console.error(`FALHOU (${falhas.length}):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da leitura do CRM`);
