// Por onde a mensagem sai: pela Evolution própria ou pelo CRM.
//
// ── Por que não é uma bandeira de configuração ──────────────────────────
//
// Uma chave "usar_evolution: true" precisaria ser virada por alguém, no
// minuto exato, e esquecer de virar é o sistema mudo. A decisão sai do
// ESTADO real das duas conexões, então ela acontece sozinha na hora em que o
// número muda de lado — e voltar atrás é reconectar, não um deploy.
//
// ── O caso que essa decisão existe para não estragar ────────────────────
//
// O teste é feito com OUTRO número — um chip velho. Nesse momento existem
// duas conexões abertas ao mesmo tempo: a do chip de teste, aqui, e a do
// número da clínica, no CRM. Uma regra ingênua ("se tem instância conectada,
// manda por ela") faria toda campanha da clínica sair pelo chip de teste,
// para pacientes de verdade, com o número errado.
//
// Daí as duas perguntas abaixo, nesta ordem.

/** O que se sabe das duas conexões, já lido do banco. */
export interface EstadoDasConexoes {
  /** Nome da instância da Evolution com sessão aberta, ou `null`. */
  instancia: string | null;
  /** Número pareado nessa instância, em dígitos. */
  telefoneDaInstancia: string | null;
  /** `whatsapp_status` do CRM — "open" quando ele ainda atende. */
  statusDoCrm: string | null;
  /** Número que o CRM diz atender. */
  telefoneDoCrm: string | null;
}

export type Caminho = "evolution" | "crm";

/** Só os dígitos, para comparar dois números escritos de jeitos diferentes. */
function digitos(valor: unknown): string {
  return String(valor ?? "").replace(/\D/g, "");
}

/**
 * A decisão.
 *
 * 1. **O número da clínica migrou.** A instância aberta está com o MESMO
 *    número que o CRM diz atender: a virada aconteceu, e o CRM só ainda não
 *    percebeu. Vai pela Evolution.
 * 2. **O CRM não atende mais e a Evolution atende.** É a virada já refletida
 *    dos dois lados. Vai pela Evolution.
 * 3. **Qualquer outra coisa** — inclusive o teste com outro chip, em que as
 *    duas estão abertas com números diferentes — continua pelo CRM, que é
 *    quem tem a sessão do número da clínica.
 */
export function caminhoDeEnvio(estado: EstadoDasConexoes): Caminho {
  if (!estado.instancia) return "crm";

  const daInstancia = digitos(estado.telefoneDaInstancia);
  const doCrm = digitos(estado.telefoneDoCrm);

  if (daInstancia && doCrm) {
    // Os dois números são conhecidos, então não há o que adivinhar.
    // Diferentes = a instância aberta aqui NÃO é o número da clínica. É o chip
    // de teste, e ele nunca manda pela clínica — nem que o CRM pisque
    // "conectando" por um minuto, o que sozinho bastaria para sequestrar um
    // disparo inteiro para o número errado.
    return daInstancia === doCrm ? "evolution" : "crm";
  }

  if (estado.statusDoCrm !== "open") return "evolution";

  return "crm";
}
