// Checagens de quando o agente de IA responde — e, principalmente, de quando
// ele NÃO responde.
//
// Este é o arquivo em que um erro fala com paciente. Não é uma tela torta nem
// um número errado: é a clínica dizendo, no WhatsApp, algo que ninguém
// escreveu. Os dois casos que mais doem:
//
//   **Grupo.** São 12 na base, todos internos — "#NÓS Floripa - Gestão",
//   "Grupo de Estudos Dr. Mauro K". Um agente solto ali responde à conversa da
//   equipe sobre os pacientes, na frente de todos, achando que fala com alguém
//   que perguntou preço de limpeza.
//
//   **Humano assumiu.** A recepcionista entrou na conversa e a IA volta a
//   falar por cima dela na mensagem seguinte. O paciente recebe duas vozes.
import {
  LIMITE_DE_FALHAS,
  decidirSeResponde,
  registrarFalha,
  registrarSucesso,
  type EstadoDaSessao,
  type EstadoDoAgente,
  type MensagemRecebida,
} from "../supabase/functions/_shared/filtros-do-agente.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const AGORA = new Date("2026-09-22T12:00:00Z");
const LIGADO: EstadoDoAgente = { ligado: true, circuitoAbertoAte: null };
const LIVRE: EstadoDaSessao = { humanoAssumiuEm: null };

function msg(p: Partial<MensagemRecebida> = {}): MensagemRecebida {
  return {
    conteudo: p.conteudo === undefined ? "quanto custa uma limpeza?" : p.conteudo,
    daClinica: p.daClinica ?? false,
    privada: p.privada ?? false,
    ehGrupo: p.ehGrupo ?? false,
  };
}

const motivo = (
  agente: EstadoDoAgente,
  sessao: EstadoDaSessao,
  mensagem: MensagemRecebida,
  agora = AGORA,
) => {
  const d = decidirSeResponde(agente, sessao, mensagem, agora);
  return d.responde ? null : d.motivo;
};

// ── O caso normal ────────────────────────────────────────────────────────
conferir("paciente perguntou algo", decidirSeResponde(LIGADO, LIVRE, msg(), AGORA), {
  responde: true,
});

// ── GRUPO ────────────────────────────────────────────────────────────────
// A trava que não existia. Enquanto o número esteve no CRM isto nem se
// colocava: o CRM não entregava grupo. A conexão própria entrega.
conferir("grupo nunca", motivo(LIGADO, LIVRE, msg({ ehGrupo: true })), "mensagem de grupo");

// E vem ANTES de "mensagem da própria clínica": se viesse depois, a mensagem
// de alguém da equipe num grupo seria lida como "uma pessoa assumiu a
// conversa" e gravaria isso na sessão de um grupo — sujando o registro de uma
// conversa que nunca deveria ter existido.
conferir(
  "equipe escrevendo no grupo é grupo, não takeover",
  motivo(LIGADO, LIVRE, msg({ ehGrupo: true, daClinica: true })),
  "mensagem de grupo",
);
// Grupo ganha até de mensagem sem texto — o motivo mais forte é o que fica
// gravado, e "é grupo" explica melhor do que "sem texto".
conferir(
  "grupo ganha de sem texto",
  motivo(LIGADO, LIVRE, msg({ ehGrupo: true, conteudo: "" })),
  "mensagem de grupo",
);

// ── Desligado ────────────────────────────────────────────────────────────
// O primeiro de todos: é o estado de hoje, e o mais definitivo.
conferir(
  "agente desligado",
  motivo({ ligado: false, circuitoAbertoAte: null }, LIVRE, msg()),
  "agente desligado",
);
conferir(
  "desligado ganha até de grupo",
  motivo({ ligado: false, circuitoAbertoAte: null }, LIVRE, msg({ ehGrupo: true })),
  "agente desligado",
);

// ── Disjuntor ────────────────────────────────────────────────────────────
conferir(
  "disjuntor aberto",
  motivo({ ligado: true, circuitoAbertoAte: "2026-09-22T12:00:30Z" }, LIVRE, msg()),
  "disjuntor aberto",
);
// Meio segundo depois de fechar, volta a responder.
conferir(
  "disjuntor já fechou",
  motivo({ ligado: true, circuitoAbertoAte: "2026-09-22T11:59:59Z" }, LIVRE, msg()),
  null,
);

// ── Humano assumiu ───────────────────────────────────────────────────────
// Permanente, não por mensagem: quem devolve a conversa é uma pessoa, na tela.
conferir(
  "humano assumiu",
  motivo(LIGADO, { humanoAssumiuEm: "2026-09-20T10:00:00Z" }, msg()),
  "humano assumiu a conversa",
);

// ── A própria clínica ────────────────────────────────────────────────────
// Sem isto o agente responderia a própria resposta, em laço.
conferir(
  "mensagem da clínica",
  motivo(LIGADO, LIVRE, msg({ daClinica: true })),
  "mensagem da própria clínica",
);

// ── Nota interna ─────────────────────────────────────────────────────────
conferir("nota interna", motivo(LIGADO, LIVRE, msg({ privada: true })), "nota interna");

// ── Sem texto ────────────────────────────────────────────────────────────
// Foto sem legenda, áudio, figurinha. Um agente que responde "não entendi" a
// cada figurinha é pior que um que fica quieto.
conferir("sem texto", motivo(LIGADO, LIVRE, msg({ conteudo: "" })), "mensagem sem texto");
conferir("só espaços", motivo(LIGADO, LIVRE, msg({ conteudo: "   " })), "mensagem sem texto");
conferir("conteúdo nulo", motivo(LIGADO, LIVRE, msg({ conteudo: null })), "mensagem sem texto");

// ── A ordem dos motivos ──────────────────────────────────────────────────
// Do mais definitivo para o mais específico, para o motivo gravado ser sempre
// a razão MAIS FORTE de não responder — e não a primeira que por acaso foi
// checada.
conferir(
  "desligado vence disjuntor",
  motivo({ ligado: false, circuitoAbertoAte: "2026-09-22T12:00:30Z" }, LIVRE, msg()),
  "agente desligado",
);
conferir(
  "disjuntor vence humano",
  motivo(
    { ligado: true, circuitoAbertoAte: "2026-09-22T12:00:30Z" },
    { humanoAssumiuEm: "2026-09-20T10:00:00Z" },
    msg(),
  ),
  "disjuntor aberto",
);
conferir(
  "humano vence grupo",
  motivo(LIGADO, { humanoAssumiuEm: "2026-09-20T10:00:00Z" }, msg({ ehGrupo: true })),
  "humano assumiu a conversa",
);

// ── Disjuntor: a contagem ────────────────────────────────────────────────
{
  let estado = { falhas: 0, abertoAte: null as string | null };
  for (let i = 1; i < LIMITE_DE_FALHAS; i++) estado = registrarFalha(estado, AGORA);
  conferir("antes do limite, só conta", estado.abertoAte, null);
  conferir("contou certo", estado.falhas, LIMITE_DE_FALHAS - 1);

  estado = registrarFalha(estado, AGORA);
  conferir("no limite, abre", estado.abertoAte !== null, true);
  // Zera junto: senão a próxima falha sozinha reabriria imediatamente.
  conferir("e zera o contador", estado.falhas, 0);
}
// Sucesso zera tudo: o que importa são falhas SEGUIDAS.
conferir("sucesso limpa", registrarSucesso(), { falhas: 0, abertoAte: null });

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens dos filtros do agente`);
