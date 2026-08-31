import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

import { AuthLayout, FieldError } from "@/components/auth/auth-layout";
import { GoogleButton } from "@/components/auth/google-button";
import { LoadingState } from "@/components/rumvia/states";
import { AVISO_ACESSO_PAGO } from "@/lib/plan-copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentCv, hasExtractedCv } from "@/hooks/use-current-cv";
import { signUpSchema, type SignUpValues } from "@/lib/auth-schemas";
import { markSignupAttempt, secondsUntilSignupAllowed } from "@/lib/signup-guard";

export const Route = createFileRoute("/cadastro")({
  // Depende de sessão (useAuth) e de uma leitura no banco (useCurrentCv) para
  // decidir se deixa renderizar o formulário — precisa rodar no cliente,
  // mesmo padrão de /analise.
  ssr: false,
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
  const cvQuery = useCurrentCv();

  // Só cria conta quem já extraiu o currículo. Sem isso a conta nasce vazia e
  // a primeira coisa que a pessoa vê no dashboard é um EmptyState — o CV é o
  // que dá substância à análise, então ele vem antes, nunca depois.
  //
  // O bloqueio é AQUI, na rota de destino, e não só nos botões que levam até
  // ela: um link direto, o botão Voltar do navegador ou uma aba salva não
  // passam pelos CTAs que já mandam para /analise primeiro, e sem o guard
  // aqui todos esses caminhos abririam o formulário sem CV nenhum.
  const carregando = auth.loading || (Boolean(auth.user) && cvQuery.isLoading);
  const semCv = !carregando && !hasExtractedCv(cvQuery.data);

  React.useEffect(() => {
    if (semCv) {
      void navigate({ to: "/analise", search: { cv: undefined }, replace: true });
    }
  }, [semCv, navigate]);

  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "", passwordConfirm: "" },
  });

  // Trava SÍNCRONA, checada e setada como a primeira linha do handler — não
  // depende de re-render nenhum. form.formState.isSubmitting do
  // react-hook-form também protege, mas é assíncrono (só muda depois da
  // validação do zod resolver rodar, um microtask): num duplo clique bem
  // rápido, o segundo clique pode chegar antes do botão desabilitar.
  const enviandoRef = React.useRef(false);

  const onSubmit = React.useCallback(
    async (values: SignUpValues) => {
      if (enviandoRef.current) return;

      // Cooldown por e-mail ANTES de qualquer chamada de rede — impede o
      // 429 em vez de só reagir a ele. Cobre também o caso de um 429
      // anterior: markSignupAttempt roda mesmo quando a tentativa falha
      // (linha abaixo), então o próximo clique nos 60s nem chega a sair
      // do navegador.
      const restante = secondsUntilSignupAllowed(values.email);
      if (restante > 0) {
        toast.info(`Aguarde ${restante}s antes de tentar de novo com este e-mail.`);
        return;
      }

      enviandoRef.current = true;
      markSignupAttempt(values.email);
      try {
        // Visitante anônimo: convertemos a MESMA conta, preservando o
        // user.id e tudo que já foi analisado nesta sessão.
        const result = auth.isAnonymous
          ? await auth.convertAnonymousAccount(values.email, values.password, values.fullName)
          : await auth.signUp(values.email, values.password, values.fullName);

        if (result.emailTaken) {
          setConflictEmail(values.email);
          return;
        }
        if (result.error) {
          // Sem retry automático aqui — 429 inclusive. O cooldown que acabou
          // de ser marcado é o que impede a próxima tentativa imediata.
          toast.error(result.error);
          return;
        }
        toast.success(
          result.needsEmailConfirmation
            ? "Conta criada. Verifique seu e-mail para confirmar o endereço."
            : "Conta criada.",
        );
        // Conta criada ≠ conta liberada. O acesso ao painel só abre com a
        // assinatura paga, então o próximo passo é o pagamento — nunca o
        // onboarding, que já é área paga.
        void navigate({ to: "/assinatura", search: { bloqueado: "1" }, replace: true });
      } finally {
        enviandoRef.current = false;
      }
    },
    [auth, navigate],
  );

  if (carregando || semCv) {
    return <LoadingState label="Verificando sua análise…" />;
  }

  if (conflictEmail) {
    return (
      <AuthLayout title="Este e-mail já tem conta">
        <div className="flex items-start gap-2 border border-divider bg-neutral-100 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-caption text-neutral-700">
            Já existe uma conta RUMVIA com <strong>{conflictEmail}</strong>. Se você entrar nela,{" "}
            <strong>a análise desta sessão anônima será descartada</strong> e o CV enviado agora não
            será transferido.
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
          ? "Sua análise atual continua válida: o cadastro apenas transforma esta sessão em conta permanente. O passo seguinte é a assinatura."
          : "Leva menos de um minuto. O passo seguinte é a assinatura."
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
          Criar conta e ir para o pagamento
        </Button>
        {/* Dito antes do clique, não depois: ninguém deve descobrir o paywall
            só ao ser redirecionado. */}
        <p className="text-caption text-neutral-600">{AVISO_ACESSO_PAGO}</p>
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
