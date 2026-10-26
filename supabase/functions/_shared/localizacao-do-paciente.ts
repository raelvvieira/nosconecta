// De que cidade a pessoa DISSE que é — e qual unidade fica mais perto dela.
//
// ── O problema (LUNA V4.1, 26/10) ────────────────────────────────────────
//
// "Sou de Criciúma" ou "moro em Canoas" e a Luna respondia que ia verificar
// onde há unidades próximas — e parava. Ela só sabia das duas cidades da
// clínica, e o único jeito de achar a unidade era o DDD. Para qualquer outra
// cidade, o modelo teria de adivinhar a geografia, e a instrução manda nunca
// adivinhar.
//
// ── A solução: o código afirma, o modelo fala ─────────────────────────────
//
// Mesmo padrão dos horários e dos casos. Aqui, antes de chamar o modelo, o
// código lê as falas da pessoa, reconhece o município (base do IBGE, com as
// coordenadas do centro urbano) e calcula qual unidade ATIVA fica mais
// perto. A instrução já chega dizendo: "ela é de Criciúma (SC); a unidade
// mais próxima é Florianópolis, endereço tal". O modelo não calcula nada.
//
// Distância é em linha reta, entre centros de cidade — critério para escolher
// entre unidades, e nunca para dizer "fica a 200 km" ou "é pertinho". A
// instrução proíbe falar em distância ou tempo de viagem.
//
// ── O que conta como "disse" ──────────────────────────────────────────────
//
// Só o que a pessoa escreveu numa forma de quem fala da própria cidade: "sou
// de X", "moro em X", "aqui em X", "tô em X" — ou uma mensagem que é só o
// nome da cidade (a resposta a "de onde você é?"). Procurar qualquer nome de
// município em qualquer frase acharia "Natal" no "feliz Natal" e "Vitória"
// numa paciente chamada Vitória.
//
// Puro: nada de banco nem de rede. Ver `tests/localizacao-do-paciente.ts`.

import { MUNICIPIOS_BR } from "./municipios-br.ts";

export interface Municipio {
  nome: string;
  uf: string;
  lat: number;
  lon: number;
}

export interface CidadeDita {
  /** O município reconhecido. Nulo quando o nome existe em mais de um estado
   *  e nada na fala diz qual. */
  municipio: Municipio | null;
  /** Os candidatos, quando o nome é ambíguo ("São José": SC, SP, …). */
  ambiguo: Municipio[];
  /** O pedaço da fala em que a cidade apareceu — para o log, não para a tela. */
  trecho: string;
}

const UF_POR_NOME: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  minas: "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};
const UFS = new Set(Object.values(UF_POR_NOME));

/** Sem acento, minúsculo, pontuação vira espaço: "São José/SC" → "sao jose sc". */
export function comparavel(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

let indice: Map<string, Municipio[]> | null = null;
let maiorNome = 1;

/** Nome comparável → municípios com esse nome. Montado uma vez, na primeira
 *  consulta, e reaproveitado enquanto a função viver. */
function porNome(): Map<string, Municipio[]> {
  if (indice) return indice;
  indice = new Map();
  for (const linha of MUNICIPIOS_BR.split(";")) {
    const [nome, uf, lat, lon] = linha.split("|");
    if (!nome || !uf) continue;
    const chave = comparavel(nome);
    const m = { nome, uf, lat: Number(lat), lon: Number(lon) };
    const lista = indice.get(chave);
    if (lista) lista.push(m);
    else indice.set(chave, [m]);
    maiorNome = Math.max(maiorNome, chave.split(" ").length);
  }
  return indice;
}

/** A UF escrita logo depois da cidade: "sc", "- SC", "/rs", "santa catarina". */
function ufNoResto(resto: string): string | null {
  const t = resto.trim();
  if (!t) return null;
  const palavras = t.split(" ");
  const primeira = palavras[0]?.toUpperCase();
  if (primeira && primeira.length === 2 && UFS.has(primeira)) return primeira;
  for (let n = Math.min(5, palavras.length); n >= 1; n--) {
    const uf = UF_POR_NOME[palavras.slice(0, n).join(" ")];
    if (uf) return uf;
  }
  return null;
}

/** O município que começa exatamente no início de `texto` — o nome mais
 *  longo que casa, para "Santo Antônio da Patrulha" não virar "Santo Antônio". */
function municipioNoInicio(
  texto: string,
  ufDoDdd: string | null,
): { encontrados: Municipio[]; uf: string | null; usadas: number } | null {
  const tabela = porNome();
  const palavras = texto.split(" ").filter(Boolean);
  for (let n = Math.min(maiorNome, palavras.length); n >= 1; n--) {
    const chave = palavras.slice(0, n).join(" ");
    const lista = tabela.get(chave);
    if (!lista) continue;
    const uf = ufNoResto(palavras.slice(n).join(" "));
    return { encontrados: lista, uf, usadas: n };
  }
  void ufDoDdd;
  return null;
}

// As formas de quem fala da própria cidade. A cidade é o que vem DEPOIS.
const DEIXAS = [
  /\b(?:sou|moro|resido|vivo|estou|to|fico|venho|falo|morando|vindo)\s+(?:aqui\s+)?(?:de|em|no|na|do|da|pra|para|ali\s+em)\s+(.+)$/,
  /\baqui\s+(?:de|em|no|na|do|da)\s+(.+)$/,
  /\b(?:cidade|municipio)\s+(?:de|e)\s+(.+)$/,
  /\b(?:perto|proximo)\s+(?:de|do|da)\s+(.+)$/,
];

// Palavras que, sozinhas, não são cidade mesmo existindo como município — a
// mensagem "Natal" pode ser o Natal; "Esperança" pode ser um nome.
const SOZINHAS_DUVIDOSAS = new Set(["natal", "vitoria", "esperanca", "bonito", "paulo", "alegria"]);

function escolher(
  encontrados: Municipio[],
  ufDita: string | null,
  ufDoDdd: string | null,
  ufsDaClinica: ReadonlySet<string>,
): { municipio: Municipio | null; ambiguo: Municipio[] } {
  if (encontrados.length === 1) {
    const unico = encontrados[0];
    if (ufDita && unico.uf !== ufDita) return { municipio: null, ambiguo: [] };
    return { municipio: unico, ambiguo: [] };
  }
  if (ufDita) {
    const doEstado = encontrados.filter((m) => m.uf === ufDita);
    return doEstado.length === 1
      ? { municipio: doEstado[0], ambiguo: [] }
      : { municipio: null, ambiguo: encontrados };
  }
  // Nome repetido sem UF: o DDD desempata, e só ele — se nenhum dos
  // candidatos é do estado do DDD, a pergunta "qual estado?" é a certa.
  if (ufDoDdd) {
    const doDdd = encontrados.filter((m) => m.uf === ufDoDdd);
    if (doDdd.length === 1) return { municipio: doDdd[0], ambiguo: [] };
  }
  // Sem DDD que ajude, os estados onde a clínica TEM unidade desempatam: quem
  // escreve para uma clínica de Porto Alegre e Florianópolis dizendo
  // "Cachoeirinha" está no RS, não em Pernambuco. Só quando sobra um.
  const daRegiao = encontrados.filter((m) => ufsDaClinica.has(m.uf));
  if (daRegiao.length === 1) return { municipio: daRegiao[0], ambiguo: [] };
  return { municipio: null, ambiguo: encontrados };
}

/**
 * A cidade que a pessoa disse, lendo da fala mais recente para a mais antiga.
 *
 * `ufDoDdd` só desempata nome repetido ("São José" com DDD 48 → SC). Nunca
 * cria uma cidade que a pessoa não disse.
 */
export function cidadeDita(
  falas: readonly string[],
  ufDoDdd: string | null = null,
  /** As UFs onde a clínica tem unidade — desempate de nome repetido. */
  ufsDaClinica: ReadonlySet<string> = new Set(),
): CidadeDita | null {
  for (let i = falas.length - 1; i >= 0; i--) {
    const fala = comparavel(falas[i]);
    if (!fala) continue;

    // Uma mensagem que é só a cidade (com ou sem UF): a resposta a "de onde
    // você é?". Até 6 palavras, e a cidade tem de ocupar a mensagem quase toda.
    const palavras = fala.split(" ");
    if (palavras.length <= 6) {
      const inteira = municipioNoInicio(fala, ufDoDdd);
      if (
        inteira &&
        palavras.length - inteira.usadas <= (inteira.uf ? 3 : 0) &&
        !(inteira.usadas === 1 && SOZINHAS_DUVIDOSAS.has(palavras[0]))
      ) {
        const r = escolher(inteira.encontrados, inteira.uf, ufDoDdd, ufsDaClinica);
        if (r.municipio || r.ambiguo.length) return { ...r, trecho: falas[i] };
      }
    }

    for (const deixa of DEIXAS) {
      const m = deixa.exec(fala);
      if (!m) continue;
      const achado = municipioNoInicio(m[1], ufDoDdd);
      if (!achado) continue;
      const r = escolher(achado.encontrados, achado.uf, ufDoDdd, ufsDaClinica);
      if (r.municipio || r.ambiguo.length) return { ...r, trecho: falas[i] };
    }
  }
  return null;
}

/** Distância em km entre dois pontos, em linha reta (haversine). */
export function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Em que município fica uma unidade, lido do ENDEREÇO cadastrado.
 *
 * O cadastro guarda rua e cidade num texto só ("Av. Osvaldo Aranha, 1022 -
 * Bom Fim, Porto Alegre - RS"). Procura-se o nome de município mais longo que
 * aparece no texto, preferindo o que tem a UF escrita junto. Sem acerto,
 * tenta-se o nome da unidade ("NÓS Florianópolis").
 */
export function municipioDaUnidade(
  nome: string,
  endereco: string | null | undefined,
): Municipio | null {
  const tabela = porNome();
  for (const fonte of [endereco ?? "", nome]) {
    const texto = ` ${comparavel(fonte)} `;
    if (!texto.trim()) continue;
    const ufsNoTexto = new Set(
      texto
        .split(" ")
        .map((p) => p.toUpperCase())
        .filter((p) => p.length === 2 && UFS.has(p)),
    );
    let melhor: Municipio | null = null;
    let melhorTam = 0;
    for (const [chave, lista] of tabela) {
      if (chave.length <= melhorTam || !texto.includes(` ${chave} `)) continue;
      const candidato =
        lista.find((m) => ufsNoTexto.has(m.uf)) ?? (lista.length === 1 ? lista[0] : null);
      if (candidato) {
        melhor = candidato;
        melhorTam = chave.length;
      }
    }
    // Nome curto demais é palavra comum de endereço ("Centro" não é cidade
    // aqui, mas "Rio" ou "Sul" poderiam casar): exige 5 letras ou mais.
    if (melhor && melhorTam >= 5) return melhor;
  }
  return null;
}

export interface UnidadeComLugar<U> {
  unidade: U;
  municipio: Municipio;
}

/**
 * A unidade mais próxima do município da pessoa, entre as que se sabe onde
 * ficam. Unidade cujo endereço não diz a cidade fica de fora — e não vira
 * resposta errada.
 */
export function unidadeMaisProxima<U extends { nome: string; endereco?: string | null }>(
  municipio: Municipio,
  unidades: readonly U[],
): { unidade: U; municipio: Municipio } | null {
  let melhor: { unidade: U; municipio: Municipio; km: number } | null = null;
  for (const u of unidades) {
    const lugar = municipioDaUnidade(u.nome, u.endereco);
    if (!lugar) continue;
    const km = distanciaKm(municipio, lugar);
    if (!melhor || km < melhor.km) melhor = { unidade: u, municipio: lugar, km };
  }
  return melhor ? { unidade: melhor.unidade, municipio: melhor.municipio } : null;
}
