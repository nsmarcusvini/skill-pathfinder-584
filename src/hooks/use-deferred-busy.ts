import * as React from "react";

export interface DeferredBusyOptions {
  /** Espera antes de mostrar. Abaixo disso, a operação acabou antes de incomodar. */
  atrasoMs?: number;
  /** Tempo mínimo em tela depois que apareceu. */
  minimoMs?: number;
}

/**
 * Converte "está carregando" em "vale a pena mostrar que está carregando".
 *
 * Dois problemas opostos, e os dois são piores que o carregamento em si:
 *
 *   PISCA-PISCA — a operação termina em 120ms e o indicador aparece e some. O
 *                 olho registra o susto, não a informação. Daí o ATRASO: só
 *                 vira visível o que demorou o bastante para ser percebido
 *                 como espera.
 *   LAMPEJO     — o indicador aparece e some no quadro seguinte, porque o
 *                 atraso venceu quase junto com a resposta. Daí o MÍNIMO: uma
 *                 vez em tela, fica tempo de ser lido.
 *
 * Os padrões (180ms / 420ms) são a faixa usual de percepção: abaixo de ~200ms
 * a resposta parece imediata, e abaixo de ~400ms em tela nada é legível.
 */
export function useDeferredBusy(
  ativo: boolean,
  { atrasoMs = 180, minimoMs = 420 }: DeferredBusyOptions = {},
): boolean {
  const [visivel, setVisivel] = React.useState(false);
  // Ref, e não estado: entra nas contas do efeito sem entrar nas dependências.
  // Como estado, cada troca reagendaria o próprio efeito que a produziu.
  const apareceuEm = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (ativo) {
      const id = setTimeout(() => {
        apareceuEm.current = Date.now();
        setVisivel(true);
      }, atrasoMs);
      return () => clearTimeout(id);
    }

    // Terminou sem nunca ter aparecido: não há o que esconder, e segurar o
    // mínimo aqui criaria justamente o lampejo que o mínimo existe para evitar.
    if (apareceuEm.current === null) {
      setVisivel(false);
      return undefined;
    }

    const restante = Math.max(0, minimoMs - (Date.now() - apareceuEm.current));
    const id = setTimeout(() => {
      apareceuEm.current = null;
      setVisivel(false);
    }, restante);
    return () => clearTimeout(id);
  }, [ativo, atrasoMs, minimoMs]);

  return visivel;
}
