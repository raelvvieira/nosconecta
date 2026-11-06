// As variáveis de identidade da MD da assistente.
//
// A MD (`ai_agents.instrucao_base`) entra na instrução exatamente como foi
// escrita. Para uma MD servir a qualquer consultório, o que muda de conta para
// conta na IDENTIDADE (nome da assistente, nome do consultório, quem faz a
// avaliação) é escrito como variável e trocado AQUI, antes de a instrução ir
// para a IA:
//
//   {{ASSISTENTE}}        o nome da assistente            "Luna", "Bia"
//   {{CONSULTORIO}}       o nome do consultório           "NÓS Odontologia"
//   {{RESPONSAVEL}}       quem avalia, já com artigo      "a Dra. Mariane", "o Dr. Paulo", "a equipe"
//   {{RESPONSAVEL_NOME}}  quem avalia, sem artigo         "Dra. Mariane"
//
// O que NÃO tem variável, de propósito: preço, campanha, endereço, horário,
// forma de pagamento, equipe e especialidade. Esses moram nos cadastros e o
// sistema já escreve a seção de cada um; a MD só diz como usar. Duplicar o
// dado na MD criaria uma segunda fonte que diverge da primeira.
//
// Compatibilidade: uma MD sem variáveis (a V4.2 da NÓS, hoje) passa idêntica,
// byte a byte. Nada aqui é lido de outro lugar além dos quatro valores que a
// chamada entrega — sem estado entre chamadas, uma conta nunca vê a outra.
//
// Segurança: a IA nunca deve ver um `{{...}}`. Variável conhecida sem valor
// cai num texto neutro ("Luna", "o consultório", "a equipe"); variável que
// não existe é removida e anotada em `desconhecidas`; chaves soltas somem.

import { nomeDaAssistente, quemAvalia } from "./identidade-do-consultorio.ts";

export const VARIAVEIS_DA_INSTRUCAO = [
  "ASSISTENTE",
  "CONSULTORIO",
  "RESPONSAVEL",
  "RESPONSAVEL_NOME",
] as const;
export type VariavelDaInstrucao = (typeof VARIAVEIS_DA_INSTRUCAO)[number];

export interface IdentidadeParaVariaveis {
  assistente?: string | null;
  consultorio?: string | null;
  /** "Dra. Mariane", como está no cadastro. */
  responsavel?: string | null;
}

export interface TextoResolvido {
  texto: string;
  /** Variáveis que não existem (erro de digitação na MD). Foram removidas. */
  desconhecidas: string[];
}

const TOKEN = /\{\{\s*([A-Za-z_]+)\s*\}\}/g;

/** O token está no começo de uma frase (início, depois de ponto, de linha nova ou de citação)? */
function noComecoDeFrase(antes: string): boolean {
  return /(^|[.!?…]\s+|\n\s*(?:>\s*)?|["“]\s*)$/.test(antes) || /^\s*>\s*$/.test(antes);
}

function maiuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function resolverVariaveis(
  texto: string | null | undefined,
  identidade: IdentidadeParaVariaveis,
): TextoResolvido {
  const origem = String(texto ?? "");
  const nomeDoConsultorio = String(identidade.consultorio ?? "").trim() || "o consultório";
  const nomeDeQuemAvalia = String(identidade.responsavel ?? "").trim();
  const valores: Record<VariavelDaInstrucao, string> = {
    ASSISTENTE: nomeDaAssistente(identidade.assistente),
    CONSULTORIO: nomeDoConsultorio,
    RESPONSAVEL: quemAvalia(identidade.responsavel),
    RESPONSAVEL_NOME: nomeDeQuemAvalia || "a equipe",
  };

  const desconhecidas: string[] = [];
  let resolvido = origem.replace(TOKEN, (_inteiro, nome: string, posicao: number) => {
    const chave = nome.toUpperCase() as VariavelDaInstrucao;
    if (!(VARIAVEIS_DA_INSTRUCAO as readonly string[]).includes(chave)) {
      desconhecidas.push(nome);
      return "";
    }
    const valor = valores[chave];
    // "a Dra. Mariane" no começo da frase vira "A Dra. Mariane".
    return chave === "RESPONSAVEL" || chave === "RESPONSAVEL_NOME"
      ? noComecoDeFrase(origem.slice(0, posicao))
        ? maiuscula(valor)
        : valor
      : valor;
  });
  // Rede de segurança: chave aberta sem fechar, ou fechada sem abrir.
  resolvido = resolvido.replace(/\{\{|\}\}/g, "");
  if (desconhecidas.length) {
    console.warn("[variaveis-da-instrucao] variável desconhecida na MD:", desconhecidas.join(", "));
  }
  return { texto: resolvido, desconhecidas };
}
