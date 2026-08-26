import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export function PublicHeader() {
  const { isAuthenticated, isOnboarded } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center border-b border-divider bg-bg px-4">
      <Link to="/" className="label-h6 text-accent-700">
        RUMVIA
      </Link>

      <nav className="ml-auto flex items-center gap-2">
        {isAuthenticated ? (
          <Button asChild size="sm">
            <Link to={isOnboarded ? "/dashboard" : "/onboarding"}>
              {isOnboarded ? "Meu painel" : "Concluir cadastro"}
            </Link>
          </Button>
        ) : (
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/login">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/cadastro">Criar conta</Link>
            </Button>
          </>
        )}
      </nav>
    </header>
  );
}
