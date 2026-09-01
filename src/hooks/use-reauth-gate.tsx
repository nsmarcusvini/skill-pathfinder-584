import * as React from "react";

export interface ReauthGate {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: () => Promise<void>;
  /** Abre o diálogo de reautenticação; `action` só roda depois da senha confirmada. */
  request: (action: () => void | Promise<void>) => void;
}

/**
 * Guarda de "modo sudo" para ações sensíveis: `request(action)` abre o
 * <ReauthDialog> e só executa `action` depois que a senha atual é
 * reconfirmada. Uso:
 *
 *   const reauth = useReauthGate();
 *   <Button onClick={() => reauth.request(excluirConta)}>Excluir</Button>
 *   <ReauthDialog {...reauth} />
 */
export function useReauthGate(): ReauthGate {
  const [open, setOpen] = React.useState(false);
  const pendingAction = React.useRef<(() => void | Promise<void>) | null>(null);

  const request = React.useCallback((action: () => void | Promise<void>) => {
    pendingAction.current = action;
    setOpen(true);
  }, []);

  const onConfirmed = React.useCallback(async () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action) await action();
  }, []);

  return { open, onOpenChange: setOpen, onConfirmed, request };
}
