import { formatBRL } from "@/lib/finance/format";

/**
 * A mensagem que a pessoa manda no WhatsApp.
 *
 * ── Por que ela é assim ───────────────────────────────────────────────────
 *
 * Quem recebe não conhece o programa e provavelmente nem a clínica. Então a
 * mensagem abre pelo que ela ganha, explica o que é a NÓS em uma linha, diz o
 * que fazer, e só então manda o link. Uma mensagem que começa por "faço parte
 * de um clube" não é lida até o fim.
 *
 * O valor vem da configuração da clínica, nunca cravado: a mensagem promete
 * dinheiro, e uma promessa de valor errado é pior que promessa nenhuma.
 */
export function convite({
  deQuem,
  valor,
  link,
}: {
  deQuem: string;
  valor: number;
  link: string;
}): string {
  return [
    `Você ganhou ${formatBRL(valor)} em Créditos NÓS 🎁`,
    "",
    `${deQuem} te indicou para o NÓS Club — o clube de benefícios da NÓS, clínica de odontologia e estética em Florianópolis.`,
    "",
    `Criando sua conta você já entra com ${formatBRL(valor)} para usar em procedimentos. E, sempre que indicar alguém que for atendido, ganha mais ${formatBRL(valor)}.`,
    "",
    "É só criar sua conta aqui:",
    link,
  ].join("\n");
}
