import { cn } from "@/lib/utils";

export interface SparklineProps {
  /** Uma posição por período, do mais antigo ao mais recente. */
  values: number[];
  /**
   * Descrição para leitor de tela. Obrigatória: um gráfico sem texto
   * alternativo simplesmente não existe para quem navega por áudio, e aqui ele
   * costuma ser a única pista de que o cliente usa ou não usa o produto.
   */
  label: string;
  /** Altura do desenho, em px. */
  height?: number;
  className?: string;
}

/**
 * Barras de contagem por período, sem eixo e sem legenda.
 *
 * Barras, e não linha: a série é contagem de eventos por dia, quase sempre com
 * buracos (fim de semana, férias). Uma linha interpola esses buracos e sugere
 * uso onde não houve nenhum; a barra deixa o zero visível, que é justamente o
 * dado que interessa em retenção.
 *
 * Cantos retos e `fill-current` para herdar a cor de quem chama — a régua do
 * Design System (base Industry) vale aqui como em qualquer outro componente.
 */
export function Sparkline({ values, label, height = 28, className }: SparklineProps) {
  const total = values.length;
  const maximo = Math.max(1, ...values);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${Math.max(1, total)} 100`}
      // A série tem largura fixa em dias e altura fixa em px: esticar sem
      // manter proporção é o que faz 30 barras caberem em qualquer largura de
      // coluna sem recalcular nada em JS.
      preserveAspectRatio="none"
      style={{ height }}
      className={cn("w-full", className)}
    >
      {/* Linha de base: sem ela, uma série inteira de zeros vira um retângulo
          vazio que parece erro de carregamento em vez de "não usou". */}
      <rect
        x="0"
        y="99"
        width={Math.max(1, total)}
        height="1"
        className="fill-current opacity-25"
      />
      {values.map((v, i) => {
        if (v <= 0) return null;
        // Mínimo de 6%: um dia com 1 evento contra um pico de 300 renderizaria
        // uma barra de 0,3px — invisível, e a ausência mentiria sobre o uso.
        const altura = Math.max(6, (v / maximo) * 100);
        return (
          <rect
            key={i}
            x={i + 0.15}
            y={100 - altura}
            width={0.7}
            height={altura}
            className="fill-current"
          />
        );
      })}
    </svg>
  );
}
