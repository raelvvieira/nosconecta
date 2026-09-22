// Qual conexão atende — e quando é mais seguro não mandar nada.
//
// ── O que este arquivo decidia antes ────────────────────────────────────
//
// Por onde a mensagem sairia: pela Evolution própria ou pelo CRM. Havia duas
// conexões possíveis, e escolher errado mandava a mensagem pelo caminho que já
// tinha perdido a sessão do número — ou, pior, pelo número errado.
//
// O CRM acabou. Sobrou uma pergunta mais simples, mas **não trivial**.
//
// ── O caso que esta decisão existe para não estragar ────────────────────
//
// A regra antiga protegia contra o chip de teste: alguém pareia OUTRO número
// para experimentar alguma coisa, e o disparo da clínica inteiro sai por ele,
// para pacientes de verdade, com um número que ninguém reconhece. A proteção
// era comparar com o número que o CRM dizia atender.
//
// Sem o CRM não existe mais esse segundo ponto de referência — e pegar "a
// conexão aberta mais recente" traria o problema de volta inteiro, porque o
// chip de teste é, por definição, o que acabou de ser pareado.
//
// Então a regra passa a ser: **uma conexão aberta é a da clínica; duas ou mais
// não dá para saber, e não saber é motivo para não mandar.** Recusar aparece
// como erro na fila, e alguém desconecta a que sobra. Adivinhar aparece como
// mensagem entregue pelo número errado, e ninguém fica sabendo.

/** Uma conexão da Evolution, como o banco a devolve. */
export interface ConexaoAberta {
  instancia: string;
  telefone: string | null;
}

export type EscolhaDaConexao =
  | { instancia: string; motivo: null }
  | { instancia: null; motivo: "nenhuma conexão aberta" | "mais de uma conexão aberta" };

/**
 * A conexão que atende.
 *
 * `motivo` preenchido é a razão de não haver uma — e ele sobe até a mensagem
 * de erro de quem tentou enviar, porque "não enviou" sem motivo é o que faz
 * alguém abrir o banco às onze da noite.
 */
export function conexaoQueAtende(abertas: ConexaoAberta[]): EscolhaDaConexao {
  const validas = abertas.filter((c) => c?.instancia?.trim());

  if (validas.length === 0) return { instancia: null, motivo: "nenhuma conexão aberta" };

  if (validas.length > 1) {
    // Duas sessões abertas ao mesmo tempo é sempre um engano de alguém — um
    // chip de teste que ficou pareado, uma reconexão que não fechou a
    // anterior. Qualquer escolha automática aqui é um palpite sobre qual
    // número a clínica quer usar, e o palpite errado fala com paciente.
    return { instancia: null, motivo: "mais de uma conexão aberta" };
  }

  return { instancia: validas[0].instancia, motivo: null };
}

/** A frase que quem tentou enviar vai ler. */
export function explicarSemConexao(motivo: EscolhaDaConexao["motivo"]): string {
  if (motivo === "mais de uma conexão aberta") {
    return (
      "Há mais de um WhatsApp conectado nesta clínica, e não dá para saber por qual mandar. " +
      "Desconecte o que não for o número oficial em Atendimentos."
    );
  }
  return "O WhatsApp da clínica não está conectado. Conecte o número em Atendimentos para poder enviar.";
}
