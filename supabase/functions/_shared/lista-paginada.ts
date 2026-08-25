// Ler uma lista paginada inteira do CRM, com páginas concorrentes e teto de
// tempo.
//
// ── Por que isto virou um módulo ────────────────────────────────────────────
//
// O laço já existia copiado em `crm-contacts` e nasceu de novo em
// `crm-conversations`, e é um laço com quatro decisões que erram calado:
// quando parar, o que fazer com página que falhou, o que fazer com linha
// repetida e o que contar como "li tudo". Errar qualquer uma delas não dá erro
// — dá lista curta, que é indistinguível de "a clínica tem poucos contatos".
//
// Foi assim que a listagem de conversas passou meses devolvendo 25 registros
// como se fossem todos.
//
// `agora` é injetável porque senão o caminho do prazo estourado só seria
// exercitável esperando 45 segundos de verdade — e teste que ninguém roda não
// verifica nada.

export interface PaginaLida {
  /** As linhas da página. Lista vazia é resposta válida (fim da lista). */
  linhas: unknown[];
  /** Total informado pelo CRM, quando ele informa. */
  total?: number | null;
}

export interface ResultadoPaginado<T> {
  linhas: T[];
  total: number;
  /** true = a lista devolvida NÃO é tudo o que existe. */
  truncado: boolean;
}

export interface OpcoesPaginacao<T> {
  /** Busca uma página. `null` = a página falhou; o resto continua. */
  buscar: (pagina: number) => Promise<PaginaLida | null>;
  porPagina: number;
  maxPaginas: number;
  concorrencia: number;
  prazoMs: number;
  /** Chave de identidade da linha, para não repetir. */
  idDe: (linha: T) => string;
  agora?: () => number;
}

export async function lerTudoPaginado<T>(opts: OpcoesPaginacao<T>): Promise<ResultadoPaginado<T>> {
  const agora = opts.agora ?? (() => Date.now());
  const inicio = agora();

  const linhas: T[] = [];
  const vistos = new Set<string>();
  let total = 0;
  let truncado = false;
  // O único sinal confiável de fim: uma página que voltou com menos linhas do
  // que cabiam nela. Sem isto não dá para distinguir "acabou" de "bati no teto
  // de páginas", e as duas coisas pedem resposta diferente.
  let chegouAoFim = false;

  const pendentes: number[] = [];
  for (let p = 1; p <= opts.maxPaginas; p++) pendentes.push(p);

  while (pendentes.length > 0) {
    if (agora() - inicio > opts.prazoMs) {
      truncado = true;
      break;
    }

    const lote = pendentes.splice(0, opts.concorrencia);
    const respostas = await Promise.all(lote.map((p) => opts.buscar(p).catch(() => null)));

    let algumaIncompleta = false;
    for (const pagina of respostas) {
      // Página que falhou é ignorada, não interrompe o resto: uma resposta lenta
      // no meio não pode derrubar a lista inteira. Ela também NÃO conta como
      // fim — senão um erro de rede viraria "a clínica tem 40 conversas".
      if (!pagina) continue;
      if (typeof pagina.total === "number" && pagina.total > 0) total = pagina.total;
      if (!Array.isArray(pagina.linhas)) continue;
      if (pagina.linhas.length < opts.porPagina) algumaIncompleta = true;
      for (const linha of pagina.linhas as T[]) {
        // Páginas pedidas ao mesmo tempo sobre uma lista que se reordena podem
        // trazer a mesma linha duas vezes.
        const id = opts.idDe(linha);
        if (!id || vistos.has(id)) continue;
        vistos.add(id);
        linhas.push(linha);
      }
    }

    if (algumaIncompleta) {
      chegouAoFim = true;
      break;
    }
  }

  // Duas coisas truncam: estourar o tempo (marcado acima) ou gastar todas as
  // páginas sem nunca ver uma incompleta.
  if (!chegouAoFim) truncado = true;

  return { linhas, total: total || linhas.length, truncado };
}
