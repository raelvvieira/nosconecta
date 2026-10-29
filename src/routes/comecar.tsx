import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarConsultorio } from "@/lib/plataforma/plataforma.functions";
import { criarContaParaTestar } from "@/lib/plataforma/onboarding.functions";

/**
 * "Testar 14 dias grátis": o cadastro aberto, pela página de vendas.
 *
 * Uma tela só, com o mínimo para o consultório nascer: quem é a pessoa, o
 * nome do consultório, a cidade e o WhatsApp. O resto (endereço, horários,
 * dentistas, preços) o "Primeiros passos" do Início pede depois, um de cada
 * vez. Pública como `/auth` (ver `__root.tsx` e `MembershipGate`).
 */
export const Route = createFileRoute("/comecar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Testar grátis · NÓS Conecta" },
      {
        name: "description",
        content: "Crie a conta do seu consultório e teste a NÓS Conecta por 14 dias.",
      },
    ],
  }),
  component: PaginaDoComeco,
});

function PaginaDoComeco() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const criarConta = useServerFn(criarContaParaTestar);
  const criar = useServerFn(criarConsultorio);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [senha, setSenha] = useState("");
  const [consultorio, setConsultorio] = useState("");
  const [cidade, setCidade] = useState("");
  const [salvando, setSalvando] = useState(false);

  const nomeDoConsultorio = consultorio;
  const emailDigitado = email;
  // Já entrou (uma conta sem consultório, vinda do aviso do sistema): não
  // pede nome, e-mail nem senha de novo, só o consultório.
  const [jaLogado, setJaLogado] = useState(false);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setJaLogado(!!data.session));
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeDoConsultorio.trim()) return toast.error("Diga o nome do consultório.");
    if (jaLogado) {
      setSalvando(true);
      try {
        await criarOConsultorio();
      } finally {
        setSalvando(false);
      }
      return;
    }
    if (!nome.trim()) return toast.error("Diga seu nome.");
    if (senha.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    setSalvando(true);
    try {
      const conta = await criarConta({
        data: { email: emailDigitado, senha, nome: nome.trim(), telefone: whatsapp },
      });
      // E-mail que já tem conta: entra com a senha digitada, se for a dela.
      if (!conta.ok && conta.motivo !== "email_em_uso") {
        toast.error(
          conta.motivo === "senha_fraca"
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
      await criarOConsultorio();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível concluir.");
    } finally {
      setSalvando(false);
    }
  }

  async function criarOConsultorio() {
    try {
      const r = await criar({
        data: { nome: nomeDoConsultorio, cidade, whatsapp, convite: null },
      });
      if (!r.ok) {
        toast.error(
          r.motivo === "ja_tem_consultorio"
            ? "Esta conta já faz parte de um consultório. Entre pelo login."
            : "Não foi possível criar o consultório. Tente de novo.",
        );
        return;
      }
      await qc.invalidateQueries({ queryKey: ["membership-status"] });
      toast.success("Pronto! Seus 14 dias de teste começaram.");
      navigate({ to: "/inicio", replace: true });
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível concluir.");
    }
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
          <h1 className="mt-3 text-xl font-semibold">Teste 14 dias grátis</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Leva um minuto. Depois o sistema te mostra o que cadastrar primeiro.
          </p>
        </div>

        <form className="surface-card space-y-4 p-6" onSubmit={enviar}>
          {!jaLogado && (
            <>
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
            </>
          )}
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
            Começar meu teste
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Já tem conta?{" "}
            <a
              href="/auth"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Entrar
            </a>
          </p>
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
