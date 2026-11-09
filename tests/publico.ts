// O público de uma conversa: atendimento, paciente modelo ou mentoria.
import { publicoDoContato } from "../supabase/functions/_shared/publico.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

conferir(
  "anúncio de paciente modelo",
  publicoDoContato({
    anuncioTitulo: "Pacientes modelo · HOF a partir de R$ 500",
    anuncioCopy: "Estou selecionando pacientes modelo para a mentoria de Harmonização Orofacial",
  }),
  "paciente_modelo",
);
conferir(
  "anúncio da mentoria para profissionais",
  publicoDoContato({
    anuncioTitulo: "Recaba mais Informações",
    anuncioCopy:
      "Você domina as técnicas de Harmonização Facial, mas será que está preparada para transformar seu conhecimento em um negócio? Mentoria FullFace",
  }),
  "mentoria",
);
conferir(
  "anúncio do combo é atendimento",
  publicoDoContato({
    anuncioTitulo: "Fale Comigo",
    anuncioCopy: "COMBO ESPECIAL! Limpeza + Clareamento",
  }),
  "atendimento",
);
conferir(
  "sem anúncio, a mensagem decide: mentoria",
  publicoDoContato({
    mensagens: ["Olá! Tenho interesse na mentoria e gostaria de saber mais informações..."],
  }),
  "mentoria",
);
conferir(
  "sem anúncio, a mensagem decide: paciente modelo",
  publicoDoContato({ mensagens: ["Bom dia", "Vcs precisam de paciente modelo?"] }),
  "paciente_modelo",
);
conferir("sem nada é atendimento", publicoDoContato({}), "atendimento");
conferir(
  "paciente modelo vence a mentoria no mesmo texto",
  publicoDoContato({ mensagens: ["quero ser paciente modelo da mentoria"] }),
  "paciente_modelo",
);

// ── A mensagem da pessoa vence o anúncio ───────────────────────────────────
const anuncioDeModelo = {
  anuncioTitulo: "Pacientes modelo · HOF",
  anuncioCopy: "Estou selecionando pacientes modelo para a mentoria",
};
conferir(
  "anúncio de paciente modelo, mas a pessoa diz que quer ser aluna: mentoria",
  publicoDoContato({ ...anuncioDeModelo, mensagens: ["Oi, quero ser aluna da mentoria"] }),
  "mentoria",
);
conferir(
  "anúncio de paciente modelo e mensagem vaga: vale o anúncio (é pista)",
  publicoDoContato({ ...anuncioDeModelo, mensagens: ["vi o anúncio"] }),
  "paciente_modelo",
);
conferir(
  "anúncio de mentoria, mas a pessoa quer ser paciente modelo",
  publicoDoContato({
    anuncioTitulo: "Mentoria FullFace",
    anuncioCopy: "Mentoria para profissionais",
    mensagens: ["Vocês precisam de paciente modelo? Quero participar"],
  }),
  "paciente_modelo",
);

// ── O "como reconhecer" cadastrado soma às palavras fixas ──────────────────
conferir(
  "termo cadastrado reconhece o paciente modelo",
  publicoDoContato({
    mensagens: ["Posso ser atendida por aluno na prática supervisionada?"],
    termos: { paciente_modelo: ["prática supervisionada", "atendimento feito por aluno"] },
  }),
  "paciente_modelo",
);
conferir(
  "termo cadastrado reconhece a mentoria",
  publicoDoContato({
    mensagens: ["tem vaga de aluna na próxima turma?"],
    termos: { mentoria: ["vaga de aluna", "turma"] },
  }),
  "mentoria",
);
conferir(
  "termo curto demais é ignorado",
  publicoDoContato({ mensagens: ["quero um teste"], termos: { mentoria: ["te"] } }),
  "atendimento",
);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`publico: ${ok} checagens ok`);
