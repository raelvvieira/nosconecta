import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  conviteDeConsultorioPublico,
  criarConsultorio,
  criarContaDoDono,
} from "@/lib/plataforma/plataforma.functions";

/**
 * O convite para abrir um consultório novo no sistema.
 *
 * Diferente de `/convite/$token`, que põe uma pessoa na equipe de um
 * consultório que já existe: aqui quem abre vira DONO de um consultório novo,
 * com o plano e o teste que a plataforma definiu no convite.
 *
 * Pública como `/convite`: o prefixo `/convite` já a deixa fora do login
 * obrigatório e do `MembershipGate` (quem chega aqui ainda não tem
 * consultório nenhum).
 */
export const Route = createFileRoute("/convite-consultorio/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Seu consultório · NÓS Conecta" },
      { name: "description", content: "Crie a conta do seu consultório na NÓS Conecta." },
    ],
  }),
  component: PaginaDoConvite,
});

function PaginaDoConvite() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const buscar = useServerFn(conviteDeConsultorioPublico);
  const criarConta = useServerFn(criarContaDoDono);
  const criar = useServerFn(criarConsultorio);

  const convite = useQuery({
    queryKey: ["convite-consultorio", token],
    queryFn: () => buscar({ data: { token } }),
    retry: false,
  });

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [senha, setSenha] = useState("");
  const [consultorio, setConsultorio] = useState<string | null>(null);
  const [cidade, setCidade] = useState("");
  const [salvando, setSalvando] = useState(false);

  // O nome e o e-mail que vieram no convite entram já preenchidos, e a pessoa
  // pode corrigir.
  const nomeDoConsultorio = consultorio ?? convite.data?.nomeConsultorio ?? "";
  const emailDigitado = email || convite.data?.email || "";

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return toast.error("Diga seu nome.");
    if (!nomeDoConsultorio.trim()) return toast.error("Diga o nome do consultório.");
    if (senha.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    setSalvando(true);
    try {
      const conta = await criarConta({
        data: { token, email: emailDigitado, senha, nome: nome.trim(), telefone: whatsapp },
      });
      // E-mail que já tem conta: entra com a senha digitada, se for a dela.
      if (!conta.ok && conta.motivo !== "email_em_uso") {
        toast.error(
          conta.motivo === "convite_invalido"
            ? "Este convite não vale mais. Peça um novo."
            : conta.motivo === "senha_fraca"
              ? "Esta senha é muito comum. Escolha uma mais forte."
              : "Não foi possível criar sua conta. Tente de novo.",
        );
        return;
      }
      const { error: erroEntrar } = await supabase.auth.signInWithPassword({
        email: emailDigitado,
        password: senha,
      });
      if (erroEntrar) {
        toast.error(
          conta.ok
            ? "Sua conta foi criada, mas não deu para entrar. Tente entrar com e-mail e senha."
            : "Este e-mail já tem conta e a senha não confere.",
        );
        return;
      }
      const r = await criar({
        data: { nome: nomeDoConsultorio, cidade, whatsapp, convite: token },
      });
      if (!r.ok) {
        toast.error(
          r.motivo === "ja_tem_consultorio"
            ? "Esta conta já faz parte de um consultório."
            : r.motivo === "convite_invalido"
              ? "Este convite não vale mais. Peça um novo."
              : "Não foi possível criar o consultório. Tente de novo.",
        );
        return;
      }
      await qc.invalidateQueries({ queryKey: ["membership-status"] });
      toast.success("Pronto! Seu consultório está criado.");
      navigate({ to: "/inicio", replace: true });
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível concluir.");
    } finally {
      setSalvando(false);
    }
  }

  if (convite.isPending) {
    return (
      <Moldura>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Verificando o convite…</p>
      </Moldura>
    );
  }

  if (!convite.data?.ok) {
    return (
      <Moldura>
        <ShieldAlert className="h-7 w-7 text-destructive" />
        <h1 className="mt-3 text-lg font-semibold">Convite inválido ou vencido</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Este link já foi usado ou venceu. Peça um novo para quem te convidou.
        </p>
      </Moldura>
    );
  }

  return (
    <div className="min-h-dvh w-full bg-surface-subtle px-4 py-10">
      <div className="mx-auto w-full max-w-[460px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <span
            className="marca-nos w-[140px] text-foreground"
            role="img"
            aria-label="NÓS Conecta"
          />
          <h1 className="mt-3 text-xl font-semibold">Crie a conta do seu consultório</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {convite.data.diasDeTeste > 0
              ? `São ${convite.data.diasDeTeste} dias para testar tudo. `
              : ""}
            Leva um minuto, e depois o sistema te mostra o que cadastrar primeiro.
          </p>
        </div>

        <form className="surface-card space-y-4 p-6" onSubmit={enviar}>
          <Campo id="nome" rotulo="Seu nome">
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </Campo>
          <Campo id="email" rotulo="E-mail">
            <Input
              id="email"
              type="email"
              value={emailDigitado}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Campo>
          <Campo id="senha" rotulo="Senha (mínimo 8 caracteres)">
            <Input
              id="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </Campo>
          <hr className="border-border" />
          <Campo id="consultorio" rotulo="Nome do consultório">
            <Input
              id="consultorio"
              value={nomeDoConsultorio}
              onChange={(e) => setConsultorio(e.target.value)}
              required
            />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="cidade" rotulo="Cidade">
              <Input id="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
            </Campo>
            <Campo id="whatsapp" rotulo="WhatsApp do consultório">
              <Input
                id="whatsapp"
                inputMode="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </Campo>
          </div>
          <Button type="submit" variant="premium" className="w-full" disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar meu consultório
          </Button>
        </form>
      </div>
    </div>
  );
}

function Campo({
  id,
  rotulo,
  children,
}: {
  id: string;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>{rotulo}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh w-full place-items-center bg-surface-subtle px-4">
      <div className="surface-card flex w-full max-w-[420px] flex-col items-center p-8 text-center">
        {children}
      </div>
    </div>
  );
}
