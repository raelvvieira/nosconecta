import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Lock, Mail, Phone, Sparkles, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerPendingMembership } from "@/lib/auth/membership.functions";

export const Route = createFileRoute("/cadastro-equipe")({
  // Rota pública: sem loader nenhum, muito menos um que chame server function
  // autenticada — a checagem de sessão aqui é só client-side, como em /auth.
  ssr: false,
  head: () => ({ meta: [{ title: "Cadastro da equipe · NÓS Conecta" }] }),
  component: CadastroEquipePage,
});

function CadastroEquipePage() {
  const navigate = useNavigate();
  const registerPending = useServerFn(registerPendingMembership);
  const [loading, setLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas não conferem.");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          phone,
          // Marca a origem para o MembershipGate saber, no primeiro login
          // (quando a confirmação de e-mail está ligada e a sessão não volta
          // aqui), que pode criar a linha pendente sozinho.
          signup_source: "cadastro-equipe",
        },
      },
    });

    if (error) {
      setLoading(false);
      toast.error(
        error.message === "User already registered"
          ? "Já existe uma conta com este e-mail. Tente entrar."
          : error.message,
      );
      return;
    }

    if (!data.session) {
      // Confirmação de e-mail ligada no projeto: a linha pendente só nasce no
      // primeiro login (o MembershipGate cuida disso lendo o user_metadata).
      setLoading(false);
      setAwaitingConfirmation(true);
      return;
    }

    try {
      await registerPending({ data: { name, email, phone: phone || null } });
    } catch (err) {
      // Falha aqui não é fatal: o MembershipGate tenta de novo no primeiro
      // carregamento do app usando o mesmo user_metadata.
      console.error(err);
    }
    setLoading(false);
    toast.success("Cadastro enviado! Aguarde a aprovação do administrador.");
    navigate({ to: "/inicio", replace: true });
  }

  return (
    <div className="min-h-dvh w-full bg-surface-subtle flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[440px]">
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-[20px] bg-gradient-primary grid place-items-center shadow-soft mb-4">
            <Sparkles className="h-7 w-7 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">NÓS Conecta</h1>
          <p className="text-sm text-muted-foreground mt-1">Cadastro da equipe</p>
        </div>

        <div className="surface-card p-8">
          {awaitingConfirmation ? (
            <div className="flex flex-col items-center text-center gap-3">
              <CheckCircle2 className="h-10 w-10 text-coral" />
              <h2 className="text-xl font-semibold">Confirme seu e-mail</h2>
              <p className="text-sm text-muted-foreground">
                Enviamos um link de confirmação para <strong>{email}</strong>. Depois de confirmar, é só entrar —
                seu cadastro fica pendente de aprovação do administrador.
              </p>
              <Button variant="outline" className="mt-2" onClick={() => navigate({ to: "/auth" })}>
                Ir para o login
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold">Criar minha conta</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-6">
                Preencha seus dados. Depois de enviar, seu acesso fica pendente até o administrador aprovar seu
                papel e sua unidade.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Nome completo" icon={<User className="h-4 w-4" />}>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" required autoFocus />
                </Field>
                <Field label="E-mail" icon={<Mail className="h-4 w-4" />}>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@clinica.com"
                    required
                    autoComplete="email"
                  />
                </Field>
                <Field label="Telefone" icon={<Phone className="h-4 w-4" />}>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(48) 99999-9999"
                    autoComplete="tel"
                  />
                </Field>
                <Field label="Senha (mín. 8 caracteres)" icon={<Lock className="h-4 w-4" />}>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="Confirmar senha" icon={<Lock className="h-4 w-4" />}>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </Field>
                <Button type="submit" variant="premium" className="w-full h-12" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar conta"}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Já tem uma conta? <a href="/auth" className="underline underline-offset-2">Entrar</a>
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}
