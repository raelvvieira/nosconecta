// Checagens da detecção de anúncio.
//
// É este sinal que decide quem a Luna atende no primeiro teste em produção. Se
// ele falhar num sentido, ela cala para quem clicou no anúncio; no outro, ela
// fala com quem não devia.
//
// Os modos de errar:
//
//   **Procurar num caminho só.** A Evolution põe `contextInfo` na raiz em
//   mensagem de texto simples, e dentro de `message.<tipo>.contextInfo` quando é
//   mídia ou citação. Metade dos anúncios ficaria de fora.
//
//   **Aceitar contexto sem clique.** Uma resposta a outra mensagem também
//   carrega `contextInfo`. Sem `ctwaClid` não houve clique em anúncio.
//
//   **Guardar a miniatura.** `externalAdReply` traz a imagem como mil bytes
//   numerados. Ela estourou uma leitura de depuração e não serve para nada aqui.
import { anuncioDoEvento, secaoDoAnuncio } from "../supabase/functions/_shared/veio-de-anuncio.ts";
import { montarInstrucao } from "../supabase/functions/_shared/instrucao-do-agente.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// A forma real, copiada de uma conversa de 27/09 (miniatura e thumbnail fora).
const adReal = {
  body: "COMBO ESPECIAL!✨\nLimpeza + Clareamento",
  title: "Fale Comigo",
  ctwaClid: "AfgT9WODa_eu6iGvnQQpaEed",
  sourceId: "120247251289920317",
  sourceApp: "instagram",
  sourceUrl: "https://www.instagram.com/p/Dc6zmLjA-F1/",
  sourceType: "ad",
  greetingMessageBody: "Olá Gabriela, temos um combo de Limpeza e Clareamento! Quer agendar?",
  thumbnail: { 0: 255, 1: 216, 2: 255 },
};

// ── O caminho da raiz (texto simples, que é o caso real) ────────────────
{
  const a = anuncioDoEvento({
    message: { conversation: "Oi, vi o anúncio" },
    contextInfo: { externalAdReply: adReal },
  });
  conferir("achou o clique", a?.clickId, "AfgT9WODa_eu6iGvnQQpaEed");
  conferir("e o id do anúncio", a?.anuncioId, "120247251289920317");
  conferir("e a rede", a?.rede, "instagram");
  conferir("e o texto do anúncio", a?.copy, "COMBO ESPECIAL!✨\nLimpeza + Clareamento");
  conferir("e a saudação pronta", a?.saudacao?.startsWith("Olá Gabriela"), true);
  // A miniatura NÃO viaja.
  conferir("a miniatura fica fora", Object.keys(a ?? {}).includes("thumbnail"), false);
  conferir("nem por outro nome", JSON.stringify(a ?? {}).includes("216"), false);
}

// ── O caminho de dentro de message (mídia, citação) ─────────────────────
conferir(
  "acha dentro de extendedTextMessage",
  anuncioDoEvento({
    message: { extendedTextMessage: { text: "oi", contextInfo: { externalAdReply: adReal } } },
  })?.clickId,
  "AfgT9WODa_eu6iGvnQQpaEed",
);
conferir(
  "acha dentro de imageMessage",
  anuncioDoEvento({
    message: { imageMessage: { contextInfo: { externalAdReply: adReal } } },
  })?.clickId,
  "AfgT9WODa_eu6iGvnQQpaEed",
);

// ── Quando NÃO é anúncio ────────────────────────────────────────────────
conferir("mensagem comum", anuncioDoEvento({ message: { conversation: "oi" } }), null);
conferir("payload vazio", anuncioDoEvento({}), null);
conferir("payload nulo", anuncioDoEvento(null), null);
// Resposta a outra mensagem: tem contextInfo, não tem clique.
conferir(
  "citação não é anúncio",
  anuncioDoEvento({
    message: { conversation: "isso" },
    contextInfo: { stanzaId: "ABC", participant: "x@s.whatsapp.net" },
  }),
  null,
);
// Contexto de anúncio SEM o clique: falha fechada.
conferir(
  "externalAdReply sem ctwaClid não conta",
  anuncioDoEvento({ contextInfo: { externalAdReply: { body: "algo", sourceType: "ad" } } }),
  null,
);
conferir(
  "ctwaClid em branco não conta",
  anuncioDoEvento({ contextInfo: { externalAdReply: { ...adReal, ctwaClid: "   " } } }),
  null,
);

// ── Campos ausentes não viram string vazia ──────────────────────────────
{
  const a = anuncioDoEvento({ contextInfo: { externalAdReply: { ctwaClid: "abc" } } });
  conferir("clique sozinho basta", a?.clickId, "abc");
  conferir("e o resto vira nulo, não vazio", [a?.copy, a?.rede, a?.saudacao], [null, null, null]);
}

// ── A seção da instrução ────────────────────────────────────────────────
conferir("sem anúncio, sem seção", secaoDoAnuncio(null), "");
{
  const t = secaoDoAnuncio(anuncioDoEvento({ contextInfo: { externalAdReply: adReal } }));
  conferir("diz a rede", t.includes("no instagram"), true);
  conferir("cita o anúncio", t.includes("> COMBO ESPECIAL!✨"), true);
  conferir("cita a saudação", t.includes("Quer agendar?"), true);
  // O ponto inteiro: ela não pergunta o que já sabe.
  conferir("proíbe perguntar qual anúncio", t.includes("Não pergunte qual anúncio"), true);
  conferir("e não prometer além", t.includes("não prometa nada além"), true);
}
// Só o clique, sem texto: a seção existe mas não inventa conteúdo.
{
  const t = secaoDoAnuncio({
    clickId: "x",
    anuncioId: null,
    rede: null,
    copy: null,
    titulo: null,
    saudacao: null,
    url: null,
  });
  conferir(
    "sem texto do anúncio, ainda diz que veio de anúncio",
    t.includes("clicou num anúncio"),
    true,
  );
  conferir("e não inventa citação", t.includes(">"), false);
}

// ── A seção chega mesmo na instrução montada ────────────────────────────
//
// Uma função que devolve o texto certo e ninguém chama não muda nada. Esta
// checagem monta a instrução inteira, como a produção monta, e procura a seção
// lá dentro — é o mesmo tipo de conferência que achou a contradição do botox.
{
  const base = {
    clinica: "NÓS Odontologia",
    manual: {
      tom: "",
      saudacao: "",
      etapas: [],
      descoberta: "",
      duvidas_de_procedimento: "",
      apresentacao_preco: "",
      objecoes: [],
      agendamento: "",
      fechamento: "",
      observacoes: "",
    },
    instrucaoBase: "Atenda com carinho.",
    procedimentos: [],
    hoje: "2026-09-28",
  };

  const comAnuncio = montarInstrucao({
    ...base,
    anuncio: anuncioDoEvento({ contextInfo: { externalAdReply: adReal } }),
  });
  conferir(
    "a instrução diz de onde a pessoa veio",
    comAnuncio.includes("De onde esta pessoa veio"),
    true,
  );
  conferir("e traz o texto do anúncio", comAnuncio.includes("COMBO ESPECIAL"), true);
  conferir("e a saudação que a pessoa já viu", comAnuncio.includes("Quer agendar?"), true);
  // A seção vem ANTES dos preços: é ela que diz de qual procedimento se está
  // falando, e uma tabela lida antes do assunto se perde.
  conferir(
    "vem antes da tabela de preços",
    comAnuncio.indexOf("De onde esta pessoa veio") < comAnuncio.indexOf("## Preços"),
    true,
  );

  const semAnuncio = montarInstrucao({ ...base, anuncio: null });
  conferir(
    "sem anúncio, nenhuma seção de origem",
    semAnuncio.includes("De onde esta pessoa veio"),
    false,
  );
  conferir(
    "nem quando ninguém informou",
    montarInstrucao(base).includes("De onde esta pessoa veio"),
    false,
  );
}

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da detecção de anúncio`);
