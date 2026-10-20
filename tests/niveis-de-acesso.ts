// Quem vê o quê — e, sobretudo, quem NÃO vê.
//
// O erro aqui não dá tela de erro: dá a recepcionista abrindo o faturamento
// da clínica, ou a dentista lendo as conversas de venda. Era o estado até
// 20/10, quando o nível era gravado e nenhuma linha de código o lia.
//
// As três formas de errar que estas checagens fecham:
//
//   **Área nova sem decisão.** Uma página nova que ninguém mapeou cai em
//   `areaDaRota` como `null` e passa para todo mundo.
//
//   **Nível desconhecido.** Uma linha do banco com `role` que o código não
//   conhece não pode virar "vê tudo".
//
//   **Prefixo frouxo.** `/pacientes/<id>` tem de ser pacientes, e
//   `/planejamento` tem de ser financeiro — não é o mesmo prefixo de nada.
import {
  AREAS_DO_NIVEL,
  NIVEIS,
  areaDaRota,
  podeAbrir,
  podeVerArea,
  type AreaDoApp,
  type NivelDeAcesso,
} from "../src/lib/auth/niveis-de-acesso.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── O combinado com a clínica, linha por linha ──────────────────────────

conferir("administrador vê as sete áreas", AREAS_DO_NIVEL.admin.length, 7);
conferir(
  "recepção vê quatro",
  [...AREAS_DO_NIVEL.reception],
  ["inicio", "agenda", "pacientes", "atendimentos"],
);
conferir("dentista vê três", [...AREAS_DO_NIVEL.dentist], ["inicio", "agenda", "pacientes"]);
conferir("financeiro vê duas", [...AREAS_DO_NIVEL.finance], ["inicio", "financeiro"]);

// O Início é de todos: um nível sem página nenhuma é uma conta que entra e não
// mostra nada.
for (const n of NIVEIS) {
  conferir(`${n.rotulo} tem Início`, podeVerArea(n.valor, "inicio"), true);
}

// ── O que o nível fecha ─────────────────────────────────────────────────

conferir("recepção não vê o financeiro", podeVerArea("reception", "financeiro"), false);
conferir("recepção não vê configurações", podeVerArea("reception", "configuracoes"), false);
conferir("recepção não vê o agente de IA", podeVerArea("reception", "agente_ia"), false);
conferir("dentista não vê as conversas", podeVerArea("dentist", "atendimentos"), false);
conferir("dentista não vê o financeiro", podeVerArea("dentist", "financeiro"), false);
conferir("financeiro não vê pacientes", podeVerArea("finance", "pacientes"), false);
conferir("financeiro não vê a agenda", podeVerArea("finance", "agenda"), false);
conferir("só administrador abre configurações", podeVerArea("admin", "configuracoes"), true);

// Nível que o código não conhece não vira "vê tudo". A linha pode vir de uma
// migration antiga, de um papel que deixou de existir, ou de alguém editando o
// banco à mão.
for (const estranho of ["superadmin", "", "ADMIN", null, undefined]) {
  conferir(
    `${JSON.stringify(estranho)} não vê o financeiro`,
    podeVerArea(estranho as NivelDeAcesso, "financeiro"),
    false,
  );
  conferir(
    `${JSON.stringify(estranho)} ainda vê o início`,
    podeVerArea(estranho as NivelDeAcesso, "inicio"),
    true,
  );
}

// ── A rota vira área ────────────────────────────────────────────────────

const ROTAS: [string, AreaDoApp | null][] = [
  ["/", "inicio"],
  ["/inicio", "inicio"],
  ["/agenda", "agenda"],
  ["/pacientes", "pacientes"],
  ["/pacientes/9f0c-abc", "pacientes"],
  ["/atendimentos", "atendimentos"],
  ["/atendimentos/chat", "atendimentos"],
  ["/atendimentos/automacoes/funil/novo", "atendimentos"],
  ["/agente-ia", "agente_ia"],
  ["/configuracoes", "configuracoes"],
  ["/configuracoes/dias-de-viagem", "configuracoes"],
  // As quatro telas financeiras, e três delas não começam com "financeiro".
  ["/financeiro", "financeiro"],
  ["/recebimentos", "financeiro"],
  ["/pagamentos", "financeiro"],
  ["/planejamento", "financeiro"],
  // Fora dos módulos: quem barra é a autenticação, não o nível.
  ["/auth", null],
  ["/convite/abc123", null],
];
for (const [rota, area] of ROTAS) {
  conferir(`${rota} é ${area}`, areaDaRota(rota), area);
}

// Query string não muda a área — um link com `?mes=2026-10` é a mesma página.
conferir("a query string é ignorada", areaDaRota("/recebimentos?mes=2026-10"), "financeiro");

// Prefixo não pode ser frouxo: uma rota futura chamada "/agendamentos" não é a
// agenda, e tratá-la como tal daria acesso de graça.
conferir("prefixo não vaza", areaDaRota("/agendamentos"), null);
conferir("nem no financeiro", areaDaRota("/financeiro-antigo"), null);

// ── A pergunta que o app faz ────────────────────────────────────────────

conferir("recepção abre a agenda", podeAbrir("reception", "/agenda"), true);
conferir("recepção não abre pagamentos", podeAbrir("reception", "/pagamentos"), false);
conferir("dentista não abre o chat", podeAbrir("dentist", "/atendimentos/chat"), false);
conferir("financeiro abre planejamento", podeAbrir("finance", "/planejamento"), true);
conferir("financeiro não abre a ficha de um paciente", podeAbrir("finance", "/pacientes/1"), false);
conferir("administrador abre tudo", podeAbrir("admin", "/configuracoes/dias-de-viagem"), true);
// A tela de login não é de módulo nenhum: barrá-la por nível deixaria quem não
// tem nível sem conseguir nem entrar.
conferir("o login passa sem nível", podeAbrir(null, "/auth"), true);
conferir("o convite também", podeAbrir(null, "/convite/xyz"), true);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens dos níveis de acesso`);
