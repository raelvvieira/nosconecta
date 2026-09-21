// Quem pode receber um disparo, a partir do espelho do WhatsApp.
//
// ── O que isto substitui ─────────────────────────────────────────────────
//
// A lista de contatos do CRM, lida de `/api/v1/contacts` página por página.
// Agora a fonte é `wa_contacts`, que é nossa e já tem mais gente do que o CRM
// jamais teve — 3.363 linhas da conexão própria e 965 herdadas.
//
// ── Por que nem toda linha vira um contato ───────────────────────────────
//
// O WhatsApp passou a identificar parte das pessoas por um **lid** — um id de
// privacidade, tipo "87080612925624@lid" — em vez do número. Um lid NÃO é um
// telefone, e são 1.962 das 3.363 linhas.
//
// O perigo não é perdê-los: é o contrário. Alguns lids têm 12 ou 13 dígitos e
// começam com 55, então passam por qualquer checagem de formato e viram um
// "telefone" perfeitamente plausível. Na base de hoje são estes três:
//
//   5501987364884@lid  — DDD "01", que não existe
//   5540541423666@lid  — DDD "40", que não existe
//   42983227524@lid    — vira 5542983227524, e o DDD 42 É de Ponta Grossa
//
// O terceiro é indistinguível de um número de verdade pelo formato. Mandar
// para ele é mandar para um estranho, com a mensagem da clínica, sem nada na
// tela indicando que houve erro. Por isso o corte é pela ORIGEM do id — lid
// nunca é telefone, ponto — e não pelo desenho dos dígitos.
//
// A lista de DDDs de verdade é a segunda tranca, e ela é barata: derruba 2 dos
// 3 lids acima e apenas 2 linhas legítimas em 2.343.
import { normalizeBrazilianPhone, telefoneBrasileiroValido } from "./phone";

/**
 * DDD de um telefone brasileiro, ou `null` quando não dá para afirmar.
 *
 * **Exige o código do país.** Um número sem o 55 é ambíguo de um jeito que
 * importa: "+1 415 555 2671", dos Estados Unidos, vira `14155552671` — onze
 * dígitos que se parecem com um celular nacional e cairiam no DDD 14, de São
 * José do Rio Preto. Quem filtra por um DDD para disparar não pode receber
 * alguém de outro país junto.
 *
 * Perder pouco: os telefones da base já vêm com o país na frente, tanto o que
 * nós escrevemos (o `formatWhatsappNumber` também só reconhece `55`) quanto o
 * que vem do WhatsApp, cujo identificador é sempre `55…@s.whatsapp.net`. Quem
 * ficar sem DDD simplesmente não aparece nos recortes por DDD.
 *
 * Morava em `contacts.functions.ts`, que declara server functions — e o
 * divisor de server functions apaga os irmãos de módulo. Funcionava por sorte:
 * quem importa isto é `contactFilters.ts`, que roda no navegador.
 */
export function ddd(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  // 55 + DDD (2) + número (8 fixo, 9 celular).
  return d.match(/^55(\d{2})\d{8,9}$/)?.[1] ?? null;
}

/** Um contato da base, no formato que a tela de disparo consome. */
export interface ContatoDaBase {
  /** O id do contato no WhatsApp — o jid, como está no espelho. */
  id: string;
  name: string;
  /** Dígitos puros com o país na frente, ex.: "5548984195309". */
  phone: string;
}

/** Uma linha de `wa_contacts`, como o banco a devolve. */
export interface LinhaDoEspelho {
  crm_contact_id?: string | null;
  name?: string | null;
  phone_e164?: string | null;
  phone_raw?: string | null;
}

/**
 * Os DDDs que existem no Brasil.
 *
 * Não é preciosismo: é o que separa "5511999998888" de "5501987364884". A
 * Anatel nunca atribuiu 01, 20, 23, 25, 26, 29, 30, 36, 39, 40, 50, 52, 56 a
 * 60, 70, 72, 76, 78 e 80 a 90 — e um id do WhatsApp que por acaso comece com
 * 55 cai justamente nesses buracos.
 */
const DDDS = new Set([
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "21",
  "22",
  "24",
  "27",
  "28",
  "31",
  "32",
  "33",
  "34",
  "35",
  "37",
  "38",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "51",
  "53",
  "54",
  "55",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "67",
  "68",
  "69",
  "71",
  "73",
  "74",
  "75",
  "77",
  "79",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "89",
  "91",
  "92",
  "93",
  "94",
  "95",
  "96",
  "97",
  "98",
  "99",
]);

/** O número dá para mandar mensagem? Formato brasileiro E DDD que existe. */
export function telefoneQueRecebe(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const digitos = normalizeBrazilianPhone(raw);
  if (!telefoneBrasileiroValido(digitos)) return null;
  if (!DDDS.has(digitos.slice(2, 4))) return null;
  return digitos;
}

/**
 * O id identifica uma PESSOA alcançável por número?
 *
 * Grupo não é pessoa. Lid é pessoa, mas não entrega o número dela — e é essa
 * segunda parte que precisa ser dita aqui, porque o lid não se parece com um
 * id inválido: ele se parece com um telefone.
 */
export function idAlcancavelPorNumero(id: string | null | undefined): boolean {
  const s = (id ?? "").trim().toLowerCase();
  if (!s) return false;
  return !s.endsWith("@lid") && !s.endsWith("@g.us");
}

/**
 * A base, sem repetir ninguém.
 *
 * A mesma pessoa tem linha nas duas origens — uma herdada do CRM e outra da
 * conexão própria — e as duas trazem o mesmo número. Duas linhas para a mesma
 * pessoa na tela de disparo significam dois cliques virando duas mensagens e
 * cota debitada em dobro, que é exatamente o que aconteceu no disparo de
 * 31/08. Aqui o telefone é a identidade, como já é na caixa de entrada.
 *
 * **Quem chega primeiro fica**, e só o nome pode ser completado depois: a
 * ordem da consulta é quem decide, e trocar a linha no meio faria o id mudar
 * embaixo de uma seleção já feita.
 */
export function montarBaseDeContatos(linhas: LinhaDoEspelho[]): ContatoDaBase[] {
  const porTelefone = new Map<string, ContatoDaBase>();

  for (const linha of linhas) {
    const id = linha?.crm_contact_id?.trim();
    if (!id || !idAlcancavelPorNumero(id)) continue;

    const telefone = telefoneQueRecebe(linha.phone_e164) ?? telefoneQueRecebe(linha.phone_raw);
    if (!telefone) continue;

    const nome = linha.name?.trim() || "";
    const existente = porTelefone.get(telefone);
    if (!existente) {
      porTelefone.set(telefone, { id, name: nome || "Sem nome", phone: telefone });
      continue;
    }
    // A linha que ficou pode ter vindo sem nome — a da Evolution nasce só com
    // o jid quando a pessoa não tem nome público. A outra completa.
    if (nome && existente.name === "Sem nome") existente.name = nome;
  }

  return [...porTelefone.values()];
}
