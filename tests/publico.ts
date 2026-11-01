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

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`publico: ${ok} checagens ok`);
