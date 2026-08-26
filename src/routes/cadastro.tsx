import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

import { AuthLayout, FieldError } from "@/components/auth/auth-layout";
import { GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { signUpSchema, type SignUpValues } from "@/lib/auth-schemas";

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [
      { title: "Criar conta — RUMVIA" },
      {
        name: "description",
        content: "Crie sua conta RUMVIA e mantenha a análise do seu CV salva com seu histórico.",
      },
      { property: "og:title", content: "Criar conta — RUMVIA" },
      { property: "og:description", content: "Crie sua conta RUMVIA em menos de um minuto." },
    ],
  }),
  component: CadastroPage,
});

function CadastroPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [conflictEmail, setConflictEmail] = React.useState<string | null>(null);

  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "", passwordConfirm: "" },
  });

  async function onSubmit(values: SignUpValues) {
    // Visitante anônimo: convertemos a MESMA conta, preservando o user.id
    // e tudo que já foi analisado nesta sessão.
    const result = auth.isAnonymous
      ? await auth.convertAnonymousAccount(values.email, values.password, values.fullName)
      : await auth.signUp(values.email, values.password, values.fullName);

    if (result.emailTaken) {
      setConflictEmail(values.email);
      return;
    }
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.needsEmailConfirmation
        ? "Conta criada. Verifique seu e-mail para confirmar o endereço."
        : "Conta criada.",
    );
    void navigate({ to: "/onboarding", replace: true });
  }

  if (conflictEmail) {
    return (
      <AuthLayout title="Este e-mail já tem conta">
        <div className="flex items-start gap-2 border border-divider bg-neutral-100 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-caption text-neutral-700">
            Já existe uma conta RUMVIA com <strong>{conflictEmail}</strong>. Se você entrar nela,{" "}
            <strong>a análise desta sessão anônima será descartada</strong> e o CV enviado agora
            não será transferido.
          </p>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            variant="destructive"
            onClick={async () => {
              await auth.signOut();
              void navigate({ to: "/login", replace: true });
            }}
          >
            Descartar e entrar na conta existente
          </Button>
          <Button variant="outline" onClick={() => setConflictEmail(null)}>
            Voltar e usar outro e-mail
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Criar conta"
      subtitle={
        auth.isAnonymous
          ? "Sua análise atual continua válida: o cadastro apenas transforma esta sessão em conta permanente."
          : "Leva menos de um minuto."
      }
      footer={
        <p className="text-caption text-neutral-700">
          Já é cliente?{" "}
          <Link to="/login" className="text-accent-700 underline">
            Entrar
          </Link>
        </p>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={form.handleSubmit(onSubmit)}>
        <div>
          <label className="label-h6 text-neutral-700" htmlFor="nome">
            Nome completo
          </label>
          <Input id="nome" autoComplete="name" {...form.register("fullName")} />
          <FieldError message={form.formState.errors.fullName?.message} />
        </div>
        <div>
          <label className="label-h6 text-neutral-700" htmlFor="email">
            E-mail
          </label>
          <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
          <FieldError message={form.formState.errors.email?.message} />
        </div>
        <div>
          <label className="label-h6 text-neutral-700" htmlFor="senha">
            Senha
          </label>
          <Input
            id="senha"
            type="password"
            autoComplete="new-password"
            {...form.register("password")}
          />
          <FieldError message={form.formState.errors.password?.message} />
        </div>
        <div>
          <label className="label-h6 text-neutral-700" htmlFor="senha2">
            Confirmar senha
          </label>
          <Input
            id="senha2"
            type="password"
            autoComplete="new-password"
            {...form.register("passwordConfirm")}
          />
          <FieldError message={form.formState.errors.passwordConfirm?.message} />
        </div>
        <Button type="submit" loading={form.formState.isSubmitting}>
          Criar conta
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-divider" />
        <span className="text-caption text-neutral-600">ou</span>
        <span className="h-px flex-1 bg-divider" />
      </div>

      <GoogleButton
        label={auth.isAnonymous ? "Vincular conta Google" : "Continuar com Google"}
        onClick={async () => {
          const { error } = await auth.signInWithGoogle();
          if (error) toast.error(error);
        }}
      />
    </AuthLayout>
  );
}
