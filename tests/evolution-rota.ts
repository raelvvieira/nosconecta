// Checagens de qual conexão atende.
//
// ── O que estas checagens protegiam antes ───────────────────────────────
//
// Havia duas conexões possíveis — a do CRM e a própria — e escolher errado
// mandava campanha de verdade, para paciente de verdade, pelo número errado. O
// caso concreto: o teste da conexão nova era feito com um chip velho, e uma
// regra ingênua ("se tem instância conectada, manda por ela") faria todo
// disparo da clínica sair por aquele chip.
//
// O CRM acabou, e com ele o segundo ponto de referência que dizia qual era o
// número de verdade da clínica. O perigo NÃO acabou: continua sendo possível
// alguém parear outro número para experimentar alguma coisa.
//
// A regra nova é a única honesta sem esse ponto de referência: uma conexão
// aberta é a da clínica; duas ou mais, não dá para saber — e não saber é
// motivo para não mandar. Recusar vira erro na fila e alguém desconecta a que
// sobra. Adivinhar vira mensagem entregue pelo número errado, calada.
import {
  conexaoQueAtende,
  explicarSemConexao,
} from "../supabase/functions/_shared/evolution-rota.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const conexao = (instancia: string, telefone: string | null = "554884195309") => ({
  instancia,
  telefone,
});

// ── O caso normal ────────────────────────────────────────────────────────
conferir("uma conexão aberta é a da clínica", conexaoQueAtende([conexao("nos-teste")]), {
  instancia: "nos-teste",
  motivo: null,
});
// Sem telefone registrado ainda — acabou de conectar e o evento não chegou.
// Continua sendo a única, e é ela que atende.
conferir(
  "uma conexão sem telefone ainda atende",
  conexaoQueAtende([conexao("nos-teste", null)]).instancia,
  "nos-teste",
);

// ── Nenhuma ──────────────────────────────────────────────────────────────
conferir("nenhuma aberta", conexaoQueAtende([]), {
  instancia: null,
  motivo: "nenhuma conexão aberta",
});

// ── O CASO QUE IMPORTA: duas abertas ─────────────────────────────────────
// O chip de teste pareado ao lado do número da clínica. Escolher qualquer uma
// é um palpite sobre com qual número a clínica quer falar — e o palpite errado
// fala com paciente.
{
  const r = conexaoQueAtende([
    conexao("nos-clinica", "554884195309"),
    conexao("chip-de-teste", "5551999990000"),
  ]);
  conferir("duas abertas: não escolhe", r.instancia, null);
  conferir("e diz por quê", r.motivo, "mais de uma conexão aberta");
}
// Nem se forem três, nem se os telefones forem desconhecidos.
conferir(
  "três abertas também não",
  conexaoQueAtende([conexao("a"), conexao("b"), conexao("c")]).instancia,
  null,
);
conferir(
  "duas sem telefone também não",
  conexaoQueAtende([conexao("a", null), conexao("b", null)]).motivo,
  "mais de uma conexão aberta",
);

// ── Lixo na lista não conta como conexão ─────────────────────────────────
// Uma linha sem nome de instância não é uma conexão — e se contasse, ela
// sozinha bloquearia o envio da clínica inteira por "mais de uma".
conferir(
  "linha sem nome é ignorada",
  conexaoQueAtende([conexao("nos-teste"), { instancia: "", telefone: null }]).instancia,
  "nos-teste",
);
conferir(
  "só espaços também é ignorada",
  conexaoQueAtende([conexao("nos-teste"), { instancia: "   ", telefone: null }]).instancia,
  "nos-teste",
);
conferir(
  "lista só de lixo é nenhuma",
  conexaoQueAtende([{ instancia: "", telefone: null }]).motivo,
  "nenhuma conexão aberta",
);

// ── O motivo vira frase ──────────────────────────────────────────────────
// Ela sobe até a tela de quem tentou enviar. "Não enviou" sem motivo é o que
// faz alguém abrir o banco às onze da noite.
conferir(
  "frase de duas conexões diz o que fazer",
  explicarSemConexao("mais de uma conexão aberta").includes("Desconecte"),
  true,
);
conferir(
  "frase de nenhuma conexão diz o que fazer",
  explicarSemConexao("nenhuma conexão aberta").includes("Conecte o número"),
  true,
);
// As duas frases são diferentes: se fossem iguais, quem lesse iria conectar de
// novo justamente quando o problema é ter conexão demais.
conferir(
  "as duas frases são diferentes",
  explicarSemConexao("mais de uma conexão aberta") !== explicarSemConexao("nenhuma conexão aberta"),
  true,
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da conexão que atende`);
