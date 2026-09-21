// Checagens de quem entra na base de disparo.
//
// Os dois modos de errar aqui são caros e calados:
//
//   Deixar entrar quem não devia — um id de privacidade do WhatsApp (lid) que
//   por acaso se parece com um telefone. A mensagem da clínica sai para um
//   estranho e nada na tela acusa.
//
//   Deixar a mesma pessoa entrar duas vezes — duas linhas, um clique em cada,
//   duas mensagens e a cota do dia debitada em dobro. Foi o que aconteceu no
//   disparo de 31/08.
import {
  idAlcancavelPorNumero,
  montarBaseDeContatos,
  telefoneQueRecebe,
} from "../src/lib/atendimentos/base-de-contatos.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── O telefone que recebe ────────────────────────────────────────────────
conferir("número completo passa", telefoneQueRecebe("5548984195309"), "5548984195309");
conferir("sem o 55 ganha o país", telefoneQueRecebe("51993351821"), "5551993351821");
conferir("com máscara", telefoneQueRecebe("(48) 98419-5309"), "5548984195309");
conferir("fixo de oito dígitos", telefoneQueRecebe("4832221100"), "554832221100");
conferir("vazio", telefoneQueRecebe(""), null);
conferir("só espaço", telefoneQueRecebe("   "), null);
conferir("nulo", telefoneQueRecebe(null), null);
conferir("curto demais", telefoneQueRecebe("98419"), null);
conferir("longo demais", telefoneQueRecebe("258910007075000"), null);

// O DDD é a segunda tranca. "01" e "40" não existem no Brasil — e são
// exatamente os que aparecem nos ids de privacidade da base de hoje.
conferir("DDD 01 não existe", telefoneQueRecebe("5501987364884"), null);
conferir("DDD 40 não existe", telefoneQueRecebe("5540541423666"), null);
conferir("DDD 20 não existe", telefoneQueRecebe("5520999998888"), null);
conferir("DDD 48 existe", telefoneQueRecebe("5548984195309"), "5548984195309");
conferir("DDD 55 existe (Santa Maria)", telefoneQueRecebe("5555999998888"), "5555999998888");

// ── Que id alcança alguém por número ─────────────────────────────────────
conferir("jid de pessoa", idAlcancavelPorNumero("5548984195309@s.whatsapp.net"), true);
conferir("id do CRM", idAlcancavelPorNumero("1edf217b-baf2-4288-a1b8-00c43bbb0ef1"), true);
conferir("lid não", idAlcancavelPorNumero("87080612925624@lid"), false);
conferir("grupo não", idAlcancavelPorNumero("120363041234567890@g.us"), false);
conferir("lid em maiúscula também não", idAlcancavelPorNumero("87080612925624@LID"), false);
conferir("vazio", idAlcancavelPorNumero(""), false);
conferir("nulo", idAlcancavelPorNumero(null), false);

// ── O caso que exige o corte pela ORIGEM do id ───────────────────────────
// Este lid vira "5542983227524": DDD 42, de Ponta Grossa, formato impecável.
// Nenhuma checagem de número o pegaria — só saber que ele é um lid.
conferir(
  "lid com cara de telefone de verdade fica de fora",
  montarBaseDeContatos([
    { crm_contact_id: "42983227524@lid", name: "Jaque", phone_raw: "42983227524" },
  ]),
  [],
);

// ── A base ───────────────────────────────────────────────────────────────
conferir(
  "linha normal entra",
  montarBaseDeContatos([
    {
      crm_contact_id: "5548984195309@s.whatsapp.net",
      name: "Tiago",
      phone_e164: "5548984195309",
    },
  ]),
  [{ id: "5548984195309@s.whatsapp.net", name: "Tiago", phone: "5548984195309" }],
);

// Mesma pessoa nas duas origens: uma linha só, a primeira.
{
  const base = montarBaseDeContatos([
    { crm_contact_id: "herdado-do-crm", name: "Carol", phone_e164: "5548984195309" },
    {
      crm_contact_id: "5548984195309@s.whatsapp.net",
      name: "Carol Kroeff",
      phone_e164: "5548984195309",
    },
  ]);
  conferir("duas origens, uma pessoa", base.length, 1);
  conferir("a primeira fica", base[0].id, "herdado-do-crm");
}

// Número escrito de jeitos diferentes continua sendo o mesmo número.
conferir(
  "com e sem o 55 casam",
  montarBaseDeContatos([
    { crm_contact_id: "a", name: "Ana", phone_e164: "5551993351821" },
    { crm_contact_id: "b", name: "Ana", phone_raw: "51993351821" },
  ]).length,
  1,
);

// O nome vem de quem tiver — a linha da Evolution nasce sem nome quando a
// pessoa não tem nome público.
{
  const base = montarBaseDeContatos([
    { crm_contact_id: "a", name: null, phone_e164: "5548984195309" },
    { crm_contact_id: "b", name: "Lourdes", phone_e164: "5548984195309" },
  ]);
  conferir("nome vem da outra linha", base[0].name, "Lourdes");
  conferir("mas o id continua o da primeira", base[0].id, "a");
}
// Nome que já existe não é trocado.
conferir(
  "nome existente não é trocado",
  montarBaseDeContatos([
    { crm_contact_id: "a", name: "Ana", phone_e164: "5511999998888" },
    { crm_contact_id: "b", name: "Ana Paula", phone_e164: "5511999998888" },
  ])[0].name,
  "Ana",
);

// `phone_e164` manda sobre `phone_raw` — é a coluna normalizada.
conferir(
  "e164 na frente do raw",
  montarBaseDeContatos([
    { crm_contact_id: "a", name: "Ana", phone_e164: "5548984195309", phone_raw: "984195309" },
  ])[0].phone,
  "5548984195309",
);
// Mas um e164 imprestável não descarta a linha se o raw servir.
conferir(
  "raw salva quando o e164 não presta",
  montarBaseDeContatos([
    { crm_contact_id: "a", name: "Ana", phone_e164: "", phone_raw: "48984195309" },
  ])[0].phone,
  "5548984195309",
);

// ── Quem fica de fora ────────────────────────────────────────────────────
conferir("grupo fica de fora", montarBaseDeContatos([{ crm_contact_id: "120363041@g.us" }]), []);
conferir(
  "sem telefone fica de fora",
  montarBaseDeContatos([{ crm_contact_id: "a", name: "Ana" }]),
  [],
);
conferir("sem id fica de fora", montarBaseDeContatos([{ phone_e164: "5548984195309" }]), []);
conferir("lista vazia", montarBaseDeContatos([]), []);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da base de contatos`);
