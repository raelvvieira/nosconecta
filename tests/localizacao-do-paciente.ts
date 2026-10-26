// A cidade que a pessoa diz e a unidade mais próxima — LUNA V4.1, 26/10.
import {
  cidadeDita,
  municipioDaUnidade,
  unidadeMaisProxima,
} from "../supabase/functions/_shared/localizacao-do-paciente.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const FLORIPA = {
  nome: "NÓS Florianópolis",
  endereco: "R. José Brognoli, 117 - Saco dos Limões, Florianópolis - Sala 612",
};
const POA = {
  nome: "NÓS Porto Alegre",
  endereco: "Av. Osvaldo Aranha, 1022 - Sl 504 - Bom Fim, Porto Alegre - RS, 90035-191",
};
const UNIDADES = [FLORIPA, POA];
const DA_CLINICA = new Set(["RS", "SC"]);
const onde = (falas: string[], ddd: string | null = null) => {
  const c = cidadeDita(falas, ddd, DA_CLINICA);
  return c?.municipio
    ? `${c.municipio.nome}/${c.municipio.uf}`
    : c?.ambiguo.length
      ? "ambíguo"
      : null;
};
const unidadePara = (falas: string[], ddd: string | null = null) => {
  const c = cidadeDita(falas, ddd, DA_CLINICA);
  return c?.municipio ? (unidadeMaisProxima(c.municipio, UNIDADES)?.unidade.nome ?? null) : null;
};

// ── As unidades são lidas do endereço ──
conferir("POA pelo endereço", municipioDaUnidade(POA.nome, POA.endereco)?.nome, "Porto Alegre");
conferir("Floripa pelo endereço", municipioDaUnidade(FLORIPA.nome, FLORIPA.endereco)?.uf, "SC");
conferir(
  "sem endereço, pelo nome",
  municipioDaUnidade("NÓS Porto Alegre", null)?.nome,
  "Porto Alegre",
);

// ── Os exemplos da V4.1 ──
conferir(
  "Criciúma → Florianópolis",
  unidadePara(["Sou de Criciúma, vocês atendem por aqui?"]),
  "NÓS Florianópolis",
);
conferir("Canoas → Porto Alegre", unidadePara(["Moro em Canoas. Onde fica?"]), "NÓS Porto Alegre");
conferir("Cachoeirinha → Porto Alegre", unidadePara(["moro em cachoeirinha"]), "NÓS Porto Alegre");
conferir("Curitiba → Florianópolis", unidadePara(["Moro em Curitiba"]), "NÓS Florianópolis");
conferir(
  "Caxias do Sul → Porto Alegre",
  unidadePara(["sou de caxias do sul rs"]),
  "NÓS Porto Alegre",
);
conferir("Pelotas → Porto Alegre", unidadePara(["aqui em Pelotas"]), "NÓS Porto Alegre");
conferir("Joinville → Florianópolis", unidadePara(["Tô em Joinville"]), "NÓS Florianópolis");
conferir("só o nome da cidade", unidadePara(["Criciúma"]), "NÓS Florianópolis");
conferir("cidade com UF", onde(["Canoas - RS"]), "Canoas/RS");
conferir(
  "nome composto inteiro",
  onde(["moro em Santo Antônio da Patrulha"]),
  "Santo Antônio da Patrulha/RS",
);

// ── DDD nunca vence a cidade dita ──
conferir("DDD 48 e diz Canoas", unidadePara(["sou de canoas"], "SC"), "NÓS Porto Alegre");

// ── Ambiguidade ──
conferir("Bom Jesus existe no RS e em SC: ambíguo", onde(["sou de bom jesus"]), "ambíguo");
conferir("Bom Jesus com DDD do RS", onde(["sou de bom jesus"], "RS"), "Bom Jesus/RS");
conferir("Bom Jesus, SC", onde(["moro em bom jesus sc"]), "Bom Jesus/SC");
conferir(
  "nome repetido fora da região resolve pela região",
  onde(["moro em cachoeirinha"]),
  "Cachoeirinha/RS",
);
conferir("São José, SC", onde(["moro em São José SC"]), "São José/SC");

// ── O que NÃO é cidade ──
conferir("frase sem cidade", onde(["quanto custa o clareamento?"]), null);
conferir("'Natal' sozinho não é cidade", onde(["Natal"]), null);
conferir("nome de pessoa não vira cidade", onde(["Oi, aqui é a Vitória"]), null);
conferir("vazio", onde([]), null);

// ── A fala mais recente vence ──
conferir("mudou de ideia", onde(["sou de canoas", "na verdade moro em criciúma"]), "Criciúma/SC");

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da localização do paciente`);
