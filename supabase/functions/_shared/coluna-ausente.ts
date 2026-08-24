// Gravar numa tabela que talvez ainda não tenha a coluna nova.
//
// O motivo é operacional, não teórico: neste projeto a migration e o deploy da
// Edge Function são DOIS passos manuais no Lovable, e nada garante a ordem
// entre eles. Publicar a função antes de aplicar a migration fazia o insert
// morrer com `column "name" of relation "whatsapp_broadcasts" does not exist` —
// um erro que não diz à clínica o que fazer, logo depois de outro que também
// não dizia.
//
// A saída não é adivinhar o schema antes: é tentar gravar tudo e, se o Postgres
// nomear uma coluna OPCIONAL que não existe, tirar essa e tentar de novo. Com a
// migration aplicada, grava tudo na primeira. Sem ela, o disparo SAI com menos
// informação em vez de falhar.
//
// Isto não substitui a migration — só tira a ordem dos dois passos do caminho
// crítico.

/** O nome da coluna que o Postgres disse não existir, ou `null`. */
export function colunaInexistente(erro: unknown): string | null {
  const texto = typeof erro === "string" ? erro : ((erro as any)?.message ?? String(erro ?? ""));
  // PostgREST devolve `column "x" of relation "y" does not exist` (código
  // 42703). O meio precisa aceitar ASPAS: entre o nome da coluna e o "does not
  // exist" vem `of relation "tabela"`, e um `[^"]*` no lugar do `.*?` casava
  // só na variante curta — a mensagem real passava batido, que é justamente o
  // caso que este arquivo existe para tratar.
  const m = /column "([^"]+)".*?does not exist/i.exec(texto);
  return m?.[1] ?? null;
}

/**
 * Insere removendo, a cada tentativa, a coluna opcional que o banco recusou.
 *
 * `opcionais` é a lista do que pode faltar sem prejuízo real — nunca as colunas
 * que dão sentido à linha. Se `message` sumisse, a fila sairia sem mensagem, e
 * aí o erro DEVE subir.
 */
export async function inserirTolerandoColunaAusente<T extends Record<string, unknown>>(
  executar: (linha: T) => Promise<{ data: any; error: any }>,
  linha: T,
  opcionais: string[],
): Promise<{ data: any; removidas: string[] }> {
  const atual: Record<string, unknown> = { ...linha };
  const removidas: string[] = [];

  // Teto = quantas colunas opcionais existem. Sem ele, um erro que sempre
  // nomeia a mesma coluna viraria laço infinito dentro da Edge Function.
  for (let tentativa = 0; tentativa <= opcionais.length; tentativa++) {
    const { data, error } = await executar(atual as T);
    if (!error) return { data, removidas };

    const coluna = colunaInexistente(error);
    // Coluna obrigatória ausente, ou erro de outra natureza: sobe. Insistir
    // aqui seria esconder um problema de verdade.
    if (!coluna || !opcionais.includes(coluna) || !(coluna in atual)) throw error;

    delete atual[coluna];
    removidas.push(coluna);
  }
  throw new Error("Não foi possível gravar o disparo: colunas ausentes demais na tabela.");
}
