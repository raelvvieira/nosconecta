// Variáveis de mensagem de disparo — o lado da TELA.
//
// O executor tem a cópia que de fato substitui, em
// `supabase/functions/_shared/variaveis-disparo.ts`. São dois runtimes
// (Cloudflare Workers e Deno) e Deno não importa de `src/`, então a duplicação
// é deliberada — o mesmo arranjo de `automation-vars.ts`, que já avisa disso no
// cabeçalho. Mudou lá, muda aqui: divergir faz a pré-visualização mostrar uma
// coisa e a paciente receber outra.

export interface VariavelDeDisparo {
  /** Sem as chaves: "nome" vira {{nome}}. */
  chave: string;
  rotulo: string;
  exemplo: string;
}

/**
 * Só duas, e isso não é falta de capricho.
 *
 * Um disparo não tem agendamento, plano nem negociação por trás — o que existe
 * por alvo é o que a fila guarda: nome e telefone. `{{data}}`,
 * `{{procedimento}}` e `{{unidade}}` existem nas automações porque lá o gatilho
 * carrega o agendamento junto. Oferecê-las aqui seria prometer um dado que não
 * existe, e o resultado chega como buraco na mensagem da paciente.
 */
export const VARIAVEIS_DE_DISPARO: VariavelDeDisparo[] = [
  { chave: "primeiro_nome", rotulo: "Primeiro nome", exemplo: "Maria" },
  { chave: "nome", rotulo: "Nome completo", exemplo: "Maria Souza" },
];

export function primeiroNome(nome: string | null | undefined): string {
  const limpo = String(nome ?? "").trim();
  if (!limpo) return "";
  const parte = limpo.split(/\s+/)[0];
  return parte.length >= 2 ? parte : limpo;
}

/** Espelho de `aplicarVariaveis` do executor. Usado para a pré-visualização. */
export function aplicarVariaveis(texto: string, dados: { nome?: string | null }): string {
  const nomeCompleto = String(dados.nome ?? "").trim();
  const primeiro = primeiroNome(nomeCompleto);
  let esvaziou = false;

  const trocado = texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (original, chave: string) => {
    const k = chave.toLowerCase();
    const valor = k === "nome" ? nomeCompleto : k === "primeiro_nome" ? primeiro : null;
    if (valor === null) return original;
    if (!valor) esvaziou = true;
    return valor;
  });

  if (!esvaziou) return trocado;
  return trocado
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "");
}

/** Variáveis escritas na mensagem que o sistema não sabe preencher. É o aviso
 *  que evita `{{procedimento}}` sair literal na mensagem de alguém. */
export function variaveisDesconhecidas(texto: string): string[] {
  const conhecidas = new Set(VARIAVEIS_DE_DISPARO.map((v) => v.chave));
  const achadas = [...texto.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) =>
    m[1].toLowerCase(),
  );
  return [...new Set(achadas.filter((c) => !conhecidas.has(c)))];
}
