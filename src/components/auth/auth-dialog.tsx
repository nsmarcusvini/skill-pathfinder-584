import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoogleButton } from "./google-button";
import { useAuth } from "@/hooks/use-auth";
import { loginSchema, signUpSchema, type LoginValues, type SignUpValues } from "@/lib/auth-schemas";

export type AuthDialogMode = "entrar" | "criar";

export interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMode?: AuthDialogMode;
  title?: string;
  description?: string;
  onSuccess?: () => void;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-caption text-danger">{message}</p>;
}

export function AuthDialog({
  open,
  onOpenChange,
  defaultMode = "criar",
  title,
  description,
  onSuccess,
}: AuthDialogProps) {
  const auth = useAuth();
  const [mode, setMode] = React.useState<AuthDialogMode>(defaultMode);
  const [conflictEmail, setConflictEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setMode(defaultMode);
      setConflictEmail(null);
    }
  }, [open, defaultMode]);

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signUpForm = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "", passwordConfirm: "" },
  });

  async function handleLogin(values: LoginValues) {
    const { error } = await auth.signIn(values.email, values.password);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Bem-vindo de volta.");
    onOpenChange(false);
    onSuccess?.();
  }

  async function handleSignUp(values: SignUpValues) {
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
        ? "Conta criada. Enviamos um e-mail de verificação para você."
        : "Conta criada.",
    );
    onOpenChange(false);
    onSuccess?.();
  }

  async function handleGoogle() {
    const { error } = await auth.signInWithGoogle();
    if (error) toast.error(error);
  }

  /** O visitante já tem conta: entrar descarta a análise da sessão anônima. */
  async function handleDiscardAndSignIn() {
    setConflictEmail(null);
    setMode("entrar");
    loginForm.setValue("email", conflictEmail ?? "");
    await auth.signOut();
    toast.info("Sessão anônima descartada. Entre na sua conta existente.");
  }

  if (conflictEmail) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" aria-hidden />
              Este e-mail já tem conta
            </DialogTitle>
            <DialogDescription>
              Já existe uma conta RUMVIA com <strong>{conflictEmail}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="border border-divider bg-neutral-100 p-3 text-caption text-neutral-700">
            Se você entrar na conta existente, <strong>a análise feita nesta sessão anônima
            será descartada</strong> — o CV enviado agora não será transferido. Se preferir
            manter esta análise, use outro e-mail para criar a conta.
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <Button variant="destructive" onClick={handleDiscardAndSignIn}>
              Descartar e entrar na conta existente
            </Button>
            <Button variant="outline" onClick={() => setConflictEmail(null)}>
              Voltar e usar outro e-mail
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {title ?? (mode === "criar" ? "Crie sua conta" : "Entrar no RUMVIA")}
          </DialogTitle>
          <DialogDescription>
            {description ??
              (mode === "criar"
                ? "Sua análise atual é preservada — o cadastro apenas transforma esta sessão em conta permanente."
                : "Use o e-mail e a senha da sua conta.")}
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4 flex border border-divider">
          <button
            type="button"
            onClick={() => setMode("criar")}
            data-active={mode === "criar" ? "true" : undefined}
            className="flex-1 cursor-pointer px-3 py-2 text-caption text-neutral-700 data-[active=true]:bg-accent-700 data-[active=true]:text-white"
          >
            Criar conta
          </button>
          <button
            type="button"
            onClick={() => setMode("entrar")}
            data-active={mode === "entrar" ? "true" : undefined}
            className="flex-1 cursor-pointer border-l border-divider px-3 py-2 text-caption text-neutral-700 data-[active=true]:bg-accent-700 data-[active=true]:text-white"
          >
            Já tenho conta
          </button>
        </div>

        {mode === "criar" ? (
          <form className="flex flex-col gap-3" onSubmit={signUpForm.handleSubmit(handleSignUp)}>
            <div>
              <label className="label-h6 text-neutral-700" htmlFor="ad-nome">
                Nome completo
              </label>
              <Input id="ad-nome" autoComplete="name" {...signUpForm.register("fullName")} />
              <FieldError message={signUpForm.formState.errors.fullName?.message} />
            </div>
            <div>
              <label className="label-h6 text-neutral-700" htmlFor="ad-email">
                E-mail
              </label>
              <Input id="ad-email" type="email" autoComplete="email" {...signUpForm.register("email")} />
              <FieldError message={signUpForm.formState.errors.email?.message} />
            </div>
            <div>
              <label className="label-h6 text-neutral-700" htmlFor="ad-senha">
                Senha
              </label>
              <Input
                id="ad-senha"
                type="password"
                autoComplete="new-password"
                {...signUpForm.register("password")}
              />
              <FieldError message={signUpForm.formState.errors.password?.message} />
            </div>
            <div>
              <label className="label-h6 text-neutral-700" htmlFor="ad-senha2">
                Confirmar senha
              </label>
              <Input
                id="ad-senha2"
                type="password"
                autoComplete="new-password"
                {...signUpForm.register("passwordConfirm")}
              />
              <FieldError message={signUpForm.formState.errors.passwordConfirm?.message} />
            </div>
            <Button type="submit" loading={signUpForm.formState.isSubmitting}>
              Criar conta e manter minha análise
            </Button>
          </form>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={loginForm.handleSubmit(handleLogin)}>
            <div>
              <label className="label-h6 text-neutral-700" htmlFor="ad-login-email">
                E-mail
              </label>
              <Input
                id="ad-login-email"
                type="email"
                autoComplete="email"
                {...loginForm.register("email")}
              />
              <FieldError message={loginForm.formState.errors.email?.message} />
            </div>
            <div>
              <label className="label-h6 text-neutral-700" htmlFor="ad-login-senha">
                Senha
              </label>
              <Input
                id="ad-login-senha"
                type="password"
                autoComplete="current-password"
                {...loginForm.register("password")}
              />
              <FieldError message={loginForm.formState.errors.password?.message} />
            </div>
            <Button type="submit" loading={loginForm.formState.isSubmitting}>
              Entrar
            </Button>
          </form>
        )}

        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-divider" />
          <span className="text-caption text-neutral-600">ou</span>
          <span className="h-px flex-1 bg-divider" />
        </div>

        <GoogleButton
          onClick={handleGoogle}
          label={auth.isAnonymous ? "Vincular conta Google" : "Continuar com Google"}
        />
      </DialogContent>
    </Dialog>
  );
}
