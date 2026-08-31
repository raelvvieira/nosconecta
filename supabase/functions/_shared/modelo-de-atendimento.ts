// A chamada ao modelo que responde o paciente.
//
// Separada do resto para que `atendimento.ts` não dependa do provedor: quem
// orquestra não precisa saber qual IA responde, e a simulação roda o caminho
// inteiro trocando só esta peça.
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.122.0";

/** Teto de saída. Curto de propósito: a resposta vai para o WhatsApp, e um
 *  paredão de texto é justamente o que a segmentação existe para evitar. */
const MAX_TOKENS = 2000;

export function temChave(): boolean {
  return !!Deno.env.get("ANTHROPIC_API_KEY");
}

export function clienteDaIa(): Anthropic {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error(
      "A chave da IA não está configurada. No Lovable: Cloud → Secrets → ANTHROPIC_API_KEY.",
    );
  }
  return new Anthropic({ apiKey });
}

/**
 * Responde uma mensagem do paciente.
 *
 * A instrução vai em `system` — é ela que carrega o manual e as regras que não
 * podem ser quebradas. O histórico vai como conteúdo do usuário, não como
 * turnos alternados de verdade: o CRM é a fonte da conversa, e remontar turnos
 * a partir dele daria margem a inverter quem disse o quê. Rótulo explícito
 * ("VOCÊ" / "PACIENTE") é mais difícil de errar.
 *
 * Esforço baixo de propósito: responder uma pergunta de paciente com o método
 * já escrito não é tarefa de raciocínio longo, e latência aqui é alguém
 * esperando no WhatsApp.
 */
export async function responderPaciente(
  instrucao: string,
  historico: string,
  mensagem: string,
): Promise<string> {
  const partes = [
    historico ? `Conversa até agora:\n${historico}` : "Esta é a primeira mensagem da conversa.",
    "",
    `Mensagem que acabou de chegar do paciente:\n${mensagem}`,
    "",
    "Responda como a clínica responderia. Só a mensagem, sem aspas e sem",
    "explicar o que você está fazendo.",
  ].join("\n");

  const resposta = await clienteDaIa().messages.create({
    model: "claude-opus-5",
    max_tokens: MAX_TOKENS,
    system: instrucao,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    messages: [{ role: "user", content: partes }],
  });

  // Uma recusa do modelo NÃO vira mensagem para o paciente. Cair calado aqui é
  // melhor do que mandar um texto de recusa para quem perguntou sobre limpeza.
  if (resposta.stop_reason === "refusal") return "";

  return resposta.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
}
