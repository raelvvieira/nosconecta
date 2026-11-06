// Ler uma lista de pacientes colada ou vinda de um arquivo CSV.
//
// Puro: o navegador lê o texto, esta função separa nome, telefone e e-mail, e o
// servidor grava. Aceita as formas que quem tem uma planilha produz: copiar as
// colunas do Excel (separadas por tabulação), CSV com vírgula ou ponto e vírgula,
// com ou sem a linha de títulos.

export interface PacienteLido {
  nome: string;
  telefone: string;
  email: string;
}

const NOMES_DE_NOME = ["nome", "name", "paciente", "cliente"];
const NOMES_DE_TELEFONE = ["telefone", "celular", "whatsapp", "fone", "phone", "tel", "contato"];
const NOMES_DE_EMAIL = ["email", "e-mail", "e mail"];

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function separador(linha: string): string {
  if (linha.includes("\t")) return "\t";
  const pontoEVirgula = (linha.match(/;/g) ?? []).length;
  const virgula = (linha.match(/,/g) ?? []).length;
  return pontoEVirgula >= virgula && pontoEVirgula > 0 ? ";" : virgula > 0 ? "," : "\t";
}

/** Divide uma linha respeitando aspas ("Silva, Ana"). */
function dividir(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentro && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else dentro = !dentro;
    } else if (c === sep && !dentro) {
      campos.push(atual);
      atual = "";
    } else atual += c;
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

const pareceEmail = (t: string) => /\S+@\S+\.\S+/.test(t);
const pareceTelefone = (t: string) => t.replace(/\D/g, "").length >= 8 && !pareceEmail(t);

export function lerPacientes(texto: string): PacienteLido[] {
  const linhas = String(texto ?? "")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!linhas.length) return [];
  const sep = separador(linhas[0]);
  const celulas = linhas.map((l) => dividir(l, sep));

  // Linha de títulos: alguma célula é o nome de uma coluna conhecida.
  const titulos = celulas[0].map(semAcento);
  const idxNome = titulos.findIndex((t) => NOMES_DE_NOME.includes(t));
  const idxFone = titulos.findIndex((t) => NOMES_DE_TELEFONE.includes(t));
  const idxEmail = titulos.findIndex((t) => NOMES_DE_EMAIL.includes(t));
  const temTitulo = idxNome >= 0 || idxFone >= 0 || idxEmail >= 0;
  const corpo = temTitulo ? celulas.slice(1) : celulas;

  const lidos: PacienteLido[] = [];
  for (const c of corpo) {
    let nome = "";
    let telefone = "";
    let email = "";
    if (temTitulo) {
      nome = idxNome >= 0 ? (c[idxNome] ?? "") : "";
      telefone = idxFone >= 0 ? (c[idxFone] ?? "") : "";
      email = idxEmail >= 0 ? (c[idxEmail] ?? "") : "";
    } else {
      // Sem títulos: o que parece e-mail é e-mail, o que parece telefone é
      // telefone, e o primeiro texto que sobra é o nome.
      for (const campo of c) {
        if (!email && pareceEmail(campo)) email = campo;
        else if (!telefone && pareceTelefone(campo)) telefone = campo;
        else if (!nome && campo) nome = campo;
      }
    }
    nome = nome.replace(/\s+/g, " ").trim();
    if (!nome) continue;
    lidos.push({
      nome: nome.slice(0, 120),
      telefone: telefone.trim(),
      email: email.trim().toLowerCase(),
    });
  }
  return lidos;
}
