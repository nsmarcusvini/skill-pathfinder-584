import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { AuthLayout, FieldError } from "@/components/auth/auth-layout";
import { GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { loginSchema, type LoginValues } from "@/lib/auth-schemas";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — RUMVIA" },
      { name: "description", content: "Acesse sua conta RUMVIA e acompanhe sua aderência ao mercado." },
      { property: "og:title", content: "Entrar — RUMVIA" },
      { property: "og:description", content: "Acesse sua conta RUMVIA." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search["redirect"] === "string" ? { redirect: search["redirect"] } : {},
  component: LoginPage,
});

function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    const { error } = await auth.signIn(values.email, values.password);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Bem-vindo de volta.");
    void navigate({ to: (redirect ?? "/dashboard") as never, replace: true });
  }

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Use o e-mail e a senha da sua conta RUMVIA."
      footer={
        <p className="text-caption text-neutral-700">
          Ainda não tem conta?{" "}
          <Link to="/cadastro" className="text-accent-700 underline">
            Criar conta
          </Link>
        </p>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={form.handleSubmit(onSubmit)}>
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
            autoComplete="current-password"
            {...form.register("password")}
          />
          <FieldError message={form.formState.errors.password?.message} />
        </div>
        <Link to="/recuperar-senha" className="text-caption text-accent-700 underline">
          Esqueci minha senha
        </Link>
        <Button type="submit" loading={form.formState.isSubmitting}>
          Entrar
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-divider" />
        <span className="text-caption text-neutral-600">ou</span>
        <span className="h-px flex-1 bg-divider" />
      </div>

      <GoogleButton
        onClick={async () => {
          const { error } = await auth.signInWithGoogle();
          if (error) toast.error(error);
        }}
      />
    </AuthLayout>
  );
}
