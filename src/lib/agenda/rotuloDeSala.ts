/**
 * O nome de uma cadeira como se lê na tela: cadeira · sala · unidade.
 *
 * ── Por que existe ────────────────────────────────────────────────────────
 *
 * O rótulo era montado em dois lugares — a lista de cadeiras juntava
 * `cadeira · sala`, e o seletor do agendamento acrescentava `— unidade` em
 * cima. Quando a clínica batiza a SALA com o nome da unidade (o que é natural:
 * a sala de Florianópolis chama "NÓS Florianópolis"), o resultado saía
 * "Cadeira de Odontologia · NÓS Florianópolis — NÓS Florianópolis".
 *
 * ── A comparação é por PARTE inteira, nunca por trecho ───────────────────
 *
 * "NÓS Porto Alegre" e "NÓS Florianópolis" compartilham o "NÓS", e descartar
 * por trecho apagaria a unidade de uma delas — deixando duas cadeiras com o
 * mesmo rótulo na lista, que é pior do que a repetição que isto conserta.
 * Acento e caixa são ignorados: "nós florianopolis" e "NÓS Florianópolis" são
 * o mesmo lugar escrito de dois jeitos.
 */
export function rotuloDeSala(partes: (string | null | undefined)[]): string {
  const vistas = new Set<string>();
  const finais: string[] = [];

  for (const parte of partes) {
    const texto = (parte ?? "").trim();
    if (!texto) continue;
    const chave = normalizar(texto);
    if (!chave || vistas.has(chave)) continue;
    vistas.add(chave);
    finais.push(texto);
  }

  return finais.join(" · ");
}

function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}
