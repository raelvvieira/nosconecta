// As listas que o sistema monta sozinho pelo nome: empresas e doutores.
//
// Elas só TIRAM gente do disparo, então errar para o lado largo esconde um
// paciente da campanha — e errar para o estreito deixa uma empresa ou um
// colega dentista receber promoção de clareamento. Os dois lados aqui.
import { pareceDoutor, pareceEmpresa } from "../src/lib/atendimentos/listasAutomaticas";

let feitas = 0;
function conferir(oQue: string, real: boolean, esperado: boolean) {
  feitas++;
  if (real !== esperado) {
    console.error(`FALHOU ${oQue}: esperava ${esperado}, veio ${real}`);
    process.exit(1);
  }
}

// ── Empresas ────────────────────────────────────────────────────────────────
for (const nome of [
  "Ótica Visão Ltda",
  "Clínica Sorriso",
  "CONSULTÓRIO DR PAULO",
  "Studio Bella Estética",
  "Mercado do Zé",
  "Imobiliária Central",
  "Laboratório Prótese Sul",
  "João da Silva ME",
  "Pet Shop Amigo",
  "Instituto Vida",
]) {
  conferir(`empresa: ${nome}`, pareceEmpresa(nome), true);
}

// Nome de pessoa que lembra palavra de empresa não pode cair na lista.
for (const nome of [
  "Maria Clara",
  "Bárbara Souza", // "bar" dentro de palavra
  "Mercedes Lima", // "merc…" não é "mercado"
  "Lojana Costa",
  "Comendador Silva",
  "Eduarda S. A. Rocha", // iniciais, não Sociedade Anônima
  "Spadotto Ferreira",
  "",
]) {
  conferir(`não empresa: ${nome || "(vazio)"}`, pareceEmpresa(nome), false);
}
// "ME" só conta no fim, onde é forma jurídica; no meio é palavra comum.
conferir("ME no meio não é empresa", pareceEmpresa("Me Liga Maria"), false);
conferir("nulo não é empresa", pareceEmpresa(null), false);

// ── Doutores e dentistas ────────────────────────────────────────────────────
for (const nome of [
  "Dra. Ana Lima",
  "DR JOÃO",
  "dra mariana",
  "Dr(a) Paula",
  "Doutora Helena",
  "Carlos Dentista",
  "Odonto Bruno",
  "Fernanda Ortodontista",
  "Lucas Cirurgião Dentista",
  "Bia HOF",
]) {
  conferir(`doutor: ${nome}`, pareceDoutor(nome), true);
}
for (const nome of [
  "Drauzio Souza", // "dr" dentro de palavra
  "Andressa Dramos",
  "Pedro Doutel",
  "Maria Odete",
  "Hoffmann Silva",
  "",
]) {
  conferir(`não doutor: ${nome || "(vazio)"}`, pareceDoutor(nome), false);
}
conferir("nulo não é doutor", pareceDoutor(undefined), false);

console.log(`listas-automaticas: ${feitas} conferências ok`);
