import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Blueprint } from "@/components/rumvia/blueprint";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex h-12 items-center border-b border-divider px-4">
        <Link to="/" className="label-h6 text-accent-700">
          RUMVIA
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-10">
        <Blueprint className="w-full max-w-md p-6">
          <h1 className="font-heading text-h3">{title}</h1>
          {subtitle ? <p className="mt-1 text-caption text-neutral-700">{subtitle}</p> : null}
          <div className="mt-5">{children}</div>
          {footer ? <div className="mt-5 border-t border-divider pt-4">{footer}</div> : null}
        </Blueprint>
      </main>
    </div>
  );
}

export function FieldError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return <p className="mt-1 text-caption text-danger">{message}</p>;
}
