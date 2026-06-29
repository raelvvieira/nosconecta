import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Lock, Mail, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const searchSchema = z.object({
  redirect: z.string().optional(),
  invite: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Entrar · NÓS Conecta" }] }),
  component: AuthPage,
});

type Invitation = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
};

function AuthPage() {
  const navigate = useNavigate();
  const { redirect, invite } = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "invite">(invite ? "invite" : "signin");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: (redirect as string) || "/", replace: true });
    });
  }, [navigate, redirect]);

  // Load invitation by token
  useEffect(() => {
    if (!invite) return;
    setMode("invite");
    (async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("id,email,role,expires_at,accepted_at")
        .eq("token", invite)
        .maybeSingle();
      if (error || !data) {
        setInviteError("Convite inválido ou expirado.");
        return;
      }
      if (data.accepted_at) {
        setInviteError("Este convite já foi utilizado.");
        return;
      }
      if (new Date(data.expires_at) < new Date()) {
        setInviteError("Este convite expirou.");
        return;
      }
      setInvitation(data as Invitation);
      setEmail(data.email);
    })();
  }, [invite]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message === "Invalid login credentials" ? "Email ou senha incorretos." : error.message);
      return;
    }
    toast.success("Bem-vindo de volta!");
    navigate({ to: (redirect as string) || "/", replace: true });
  }

  async function handleAcceptInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!invitation) return;
    if (password.length < 8) {
      toast.error("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Mark invitation as accepted (best-effort)
    await supabase.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id);
    if (data.session) {
      toast.success("Conta criada com sucesso!");
      navigate({ to: "/", replace: true });
    } else {
      toast.success("Conta criada! Verifique seu e-mail para confirmar.");
      setMode("signin");
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#FAFAFA] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[440px]">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-[20px] bg-gradient-primary grid place-items-center shadow-soft mb-4">
            <Sparkles className="h-7 w-7 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">NÓS Conecta</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestão financeira para clínicas</p>
        </div>

        <div className="surface-card p-8">
          {mode === "invite" ? (
            <>
              <h2 className="text-xl font-semibold">Aceitar convite</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-6">
                Crie sua senha para acessar o sistema.
              </p>
              {inviteError ? (
                <div className="rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm p-4">
                  {inviteError}
                </div>
              ) : (
                <form onSubmit={handleAcceptInvite} className="space-y-4">
                  <Field label="Nome completo">
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Seu nome"
                      required
                      autoFocus
                    />
                  </Field>
                  <Field label="E-mail" icon={<Mail className="h-4 w-4" />}>
                    <Input value={email} disabled className="bg-muted/50" />
                  </Field>
                  <Field label="Senha (mín. 8 caracteres)" icon={<Lock className="h-4 w-4" />}>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={8}
                    />
                  </Field>
                  <Button type="submit" variant="premium" className="w-full h-12" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar conta e entrar"}
                  </Button>
                </form>
              )}
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold">Entrar</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-6">
                Use suas credenciais para acessar.
              </p>
              <form onSubmit={handleSignIn} className="space-y-4">
                <Field label="E-mail" icon={<Mail className="h-4 w-4" />}>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@clinica.com"
                    required
                    autoFocus
                    autoComplete="email"
                  />
                </Field>
                <Field label="Senha" icon={<Lock className="h-4 w-4" />}>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                </Field>
                <Button type="submit" variant="premium" className="w-full h-12" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          O cadastro é feito apenas por convite do administrador.
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
