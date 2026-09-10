import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { AuthLayout, FieldError } from "@/components/auth/auth-layout";
import { GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { newPasswordSchema, type NewPasswordValues } from "@/lib/auth-schemas";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Confirmando acesso — RUMVIA" },
      { name: "description", content: "Estamos concluindo a autenticação da sua conta RUMVIA." },
      { property: "og:title", content: "Confirmando acesso — RUMVIA" },
      { property: "og:description", content: "Conclusão do login no RUMVIA." },
    ],
  }),
  component: AuthCallbackPage,
});

/** Tempo máximo em "processando" antes de admitir que algo travou. */
const TIMEOUT_MS = 12_000;

type ErroCallback = { codigo: string; descricao: string };

/**
 * O GoTrue devolve erro de OAuth ora na query string, ora no fragmento
 * (`#error=...`), e no caso do `identity_already_exists` nos dois. Ler só um
 * dos lados era o que prendia a tela em "Confirmando acesso" para sempre.
 */
function lerErroDaUrl(): ErroCallback | null {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const erro = query.get("error") ?? hash.get("error");
  const codigo = query.get("error_code") ?? hash.get("error_code");
  const descricao = query.get("error_description") ?? hash.get("error_description");
  if (!erro && !codigo) return null;
  return { codigo: codigo ?? erro ?? "unknown", descricao: descricao ?? "" };
}

function mensagemDeErro({ codigo, descricao }: ErroCallback): string {
  switch (codigo) {
    case "otp_expired":
      return "Este link expirou ou já foi usado. Peça um novo e-mail e tente de novo.";
    case "access_denied":
      return "O acesso foi negado no provedor. Se você fechou a tela do Google, é só tentar de novo.";
    case "timeout":
      return "Não conseguimos concluir a validação da sessão. Tente entrar novamente.";
    default:
      return descricao || "Não foi possível concluir a autenticação.";
  }
}

function AuthCallbackPage() {
  const navigate = useNavigate();
  const { isOnboarded, isAuthenticated, loading, signOut, signInWithGoogle } = useAuth();
  const [mode, setMode] = React.useState<"processando" | "recuperacao" | "confirmado" | "erro">(
    "processando",
  );
  const [erro, setErro] = React.useState<ErroCallback | null>(null);
  const redirecionadoRef = React.useRef(false);

  React.useEffect(() => {
    // Erro vem antes de qualquer outra leitura: quando o GoTrue recusa não há
    // `type` nem sessão para processar, só o motivo da recusa.
    const erroDaUrl = lerErroDaUrl();
    if (erroDaUrl) {
      setErro(erroDaUrl);
      setMode("erro");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const tipo = params.get("type") ?? hash.get("type");
    const isRecovery = params.get("tipo") === "recuperacao" || tipo === "recovery";
    // signup: confirmação de cadastro via signUp() sem sessão anônima prévia.
    // email_change: caminho principal — convertAnonymousAccount() dispara
    // "Change Email Address" no GoTrue, não "Confirm signup" (ver comentário
    // em supabase/templates/confirm-signup.html).
    const isConfirmacaoDeCadastro = tipo === "signup" || tipo === "email_change";
    if (isRecovery) setMode("recuperacao");
    else if (isConfirmacaoDeCadastro) setMode("confirmado");
  }, []);

  React.useEffect(() => {
    if (mode !== "processando" || loading) return;
    if (isAuthenticated) {
      void navigate({ to: isOnboarded ? "/dashboard" : "/onboarding", replace: true });
    }
  }, [mode, loading, isAuthenticated, isOnboarded, navigate]);

  // Rede de segurança: nenhum caminho pode terminar em spinner eterno. Se em
  // TIMEOUT_MS não apareceu sessão permanente nem erro na URL, a tela vira
  // saída — com link para o login — em vez de continuar girando.
  React.useEffect(() => {
    if (mode !== "processando") return;
    const id = window.setTimeout(() => {
      setErro((atual) => atual ?? { codigo: "timeout", descricao: "" });
      setMode((atual) => (atual === "processando" ? "erro" : atual));
    }, TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [mode]);

  // Confirmar o e-mail de criação de conta não deve logar a pessoa direto no
  // painel (que hoje é área paga, regra 12) — manda para o login e exige a
  // senha de novo, mesmo que o link do GoTrue já tenha criado uma sessão.
  React.useEffect(() => {
    if (mode !== "confirmado" || loading || redirecionadoRef.current) return;
    redirecionadoRef.current = true;
    void (async () => {
      if (isAuthenticated) await signOut();
      toast.success("E-mail confirmado. Faça login para continuar.");
      void navigate({ to: "/login", replace: true });
    })();
  }, [mode, loading, isAuthenticated, signOut, navigate]);

  const form = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", passwordConfirm: "" },
  });

  if (mode === "recuperacao") {
    return (
      <AuthLayout title="Definir nova senha" subtitle="Escolha uma senha nova para sua conta.">
        <form
          className="flex flex-col gap-3"
          onSubmit={form.handleSubmit(async (values) => {
            const { error } = await supabase.auth.updateUser({ password: values.password });
            if (error) {
              toast.error(error.message);
              return;
            }
            toast.success("Senha atualizada.");
            void navigate({ to: "/dashboard", replace: true });
          })}
        >
          <div>
            <label className="label-h6 text-neutral-700" htmlFor="nova">
              Nova senha
            </label>
            <Input
              id="nova"
              type="password"
              autoComplete="new-password"
              {...form.register("password")}
            />
            <FieldError message={form.formState.errors.password?.message} />
          </div>
          <div>
            <label className="label-h6 text-neutral-700" htmlFor="nova2">
              Confirmar nova senha
            </label>
            <Input
              id="nova2"
              type="password"
              autoComplete="new-password"
              {...form.register("passwordConfirm")}
            />
            <FieldError message={form.formState.errors.passwordConfirm?.message} />
          </div>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Salvar nova senha
          </Button>
        </form>
      </AuthLayout>
    );
  }

  // A conta Google já pertence a outra conta RUMVIA: vincular à sessão anônima
  // é impossível, mas entrar na conta existente é exatamente o que a pessoa
  // queria. Um clique resolve — dizendo antes o que fica para trás.
  if (mode === "erro" && erro?.codigo === "identity_already_exists") {
    return (
      <AuthLayout
        title="Esta conta Google já tem cadastro"
        subtitle="Não dá para vincular este Google à sessão atual porque ele já pertence a uma conta RUMVIA."
        footer={
          <p className="text-caption text-neutral-700">
            Prefere e-mail e senha?{" "}
            <Link to="/login" className="text-accent-700 underline">
              Entrar de outro jeito
            </Link>
          </p>
        }
      >
        <div className="mb-4 border border-divider bg-neutral-100 p-3 text-caption text-neutral-700">
          Ao entrar na conta existente,{" "}
          <strong>uma análise feita nesta sessão sem cadastro não é transferida</strong> — o que já
          estava na sua conta continua lá, intacto.
        </div>
        <GoogleButton
          label="Entrar na conta existente com Google"
          onClick={async () => {
            const { error } = await signInWithGoogle("entrar");
            if (error) toast.error(error);
          }}
        />
      </AuthLayout>
    );
  }

  if (mode === "erro" && erro) {
    return (
      <AuthLayout
        title="Não foi possível entrar"
        subtitle={mensagemDeErro(erro)}
        footer={
          <p className="text-caption text-neutral-700">
            <Link to="/" className="text-accent-700 underline">
              Voltar para a página inicial
            </Link>
          </p>
        }
      >
        <Button onClick={() => void navigate({ to: "/login", replace: true })}>
          Ir para o login
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Confirmando acesso" subtitle="Um instante enquanto validamos sua sessão…">
      <p className="text-caption text-neutral-700">
        Se esta tela demorar, volte para a página inicial e tente entrar novamente.
      </p>
    </AuthLayout>
  );
}
