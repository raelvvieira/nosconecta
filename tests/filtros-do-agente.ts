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
const LIGADO: EstadoDoAgente = {
  ligado: true,
  circuitoAbertoAte: null,
  soParaNaoPaciente: true,
  soParaConversaNova: true,
};
const LIVRE: EstadoDaSessao = { humanoAssumiuEm: null };

function msg(p: Partial<MensagemRecebida> = {}): MensagemRecebida {
  return {
    conteudo: p.conteudo === undefined ? "quanto custa uma limpeza?" : p.conteudo,
    daClinica: p.daClinica ?? false,
    privada: p.privada ?? false,
    ehGrupo: p.ehGrupo ?? false,
    // O padrão do teste é o contato que a IA DEVE atender: chegou agora, sem
    // ficha. Assim todo caso abaixo que não fala de paciente continua medindo
    // o que media antes.
    ehPaciente: p.ehPaciente ?? false,
    conversaNova: p.conversaNova ?? true,
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

// ── Quem a IA pode atender ───────────────────────────────────────────────
//
// O pedido foi específico: ela responde por nós o contato NOVO que ainda não é
// paciente — o que chegou pelo anúncio. Paciente tem tratamento em curso e
// combinado com a recepção; lead de três meses atrás não é contato novo, é
// lead esquecido.

conferir("contato novo sem ficha é atendido", motivo(LIGADO, LIVRE, msg()), null);
conferir(
  "paciente não é atendido",
  motivo(LIGADO, LIVRE, msg({ ehPaciente: true })),
  "conversa de paciente",
);
conferir(
  "conversa antiga não é atendida",
  motivo(LIGADO, LIVRE, msg({ conversaNova: false })),
  "conversa antiga",
);

// Paciente antes de antiga: é propriedade da pessoa e não muda, enquanto a
// idade muda quando alguém mexe na janela.
conferir(
  "paciente em conversa antiga: o motivo é o paciente",
  motivo(LIGADO, LIVRE, msg({ ehPaciente: true, conversaNova: false })),
  "conversa de paciente",
);

// Grupo continua ganhando dos dois. Se perdesse, um grupo sairia com o motivo
// errado — e grupo é o caso que fala na frente de todo mundo.
conferir(
  "grupo ganha de paciente",
  motivo(LIGADO, LIVRE, msg({ ehGrupo: true, ehPaciente: true })),
  "mensagem de grupo",
);
conferir(
  "grupo ganha de conversa antiga",
  motivo(LIGADO, LIVRE, msg({ ehGrupo: true, conversaNova: false })),
  "mensagem de grupo",
);
// E humano-assumiu continua acima de tudo isso: gravar "conversa de paciente"
// quando a razão real foi o takeover esconderia o takeover da auditoria.
conferir(
  "humano assumiu ganha de paciente",
  motivo(LIGADO, { humanoAssumiuEm: "2026-09-22T11:00:00Z" }, msg({ ehPaciente: true })),
  "humano assumiu a conversa",
);

// ── O caso que justifica a POSIÇÃO na ordem ──────────────────────────────
//
// "mensagem da própria clínica" é o motivo que `atender` transforma em
// `human_took_over_at`. Numa conversa de paciente a IA nunca vai responder de
// qualquer jeito — então marcar takeover ali é sujeira de sessão numa conversa
// que nunca foi dela. Por isso paciente e antiga vêm ANTES.
//
// Se alguém mover estas duas checagens para baixo, é esta linha que quebra.
conferir(
  "recepção falando com paciente NÃO vira takeover",
  motivo(LIGADO, LIVRE, msg({ ehPaciente: true, daClinica: true })),
  "conversa de paciente",
);
conferir(
  "mas com contato novo, a mensagem da clínica ainda é takeover",
  motivo(LIGADO, LIVRE, msg({ daClinica: true })),
  "mensagem da própria clínica",
);

// ── Os interruptores ─────────────────────────────────────────────────────
// Existem para afrouxar a regra sem deploy. Se não funcionassem, o único jeito
// de a clínica mudar de ideia seria mexer no código.
{
  const semFiltroDePaciente: EstadoDoAgente = { ...LIGADO, soParaNaoPaciente: false };
  conferir(
    "filtro de paciente desligado: ela atende paciente",
    motivo(semFiltroDePaciente, LIVRE, msg({ ehPaciente: true })),
    null,
  );
  const semFiltroDeIdade: EstadoDoAgente = { ...LIGADO, soParaConversaNova: false };
  conferir(
    "filtro de idade desligado: ela atende conversa antiga",
    motivo(semFiltroDeIdade, LIVRE, msg({ conversaNova: false })),
    null,
  );
  // Desligar um não desliga o outro.
  conferir(
    "desligar o de paciente não solta a conversa antiga",
    motivo(semFiltroDePaciente, LIVRE, msg({ conversaNova: false })),
    "conversa antiga",
  );
}

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens dos filtros do agente`);
