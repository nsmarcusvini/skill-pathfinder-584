import * as React from "react";
import { ChevronDown, ChevronsUpDown, ChevronUp, Search } from "lucide-react";
import { Blueprint } from "./blueprint";
import { EmptyState } from "./states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Valor renderizado na célula. */
  cell: (row: T) => React.ReactNode;
  /** Valor usado para ordenar e buscar. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right";
  /** Aplica numeração tabular monoespaçada. */
  numeric?: boolean;
  width?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  pageSize?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  pageSize = 10,
  searchable = true,
  searchPlaceholder = "Buscar…",
  emptyTitle = "Nenhum resultado",
  emptyDescription = "Ajuste os filtros ou a busca para ver dados aqui.",
  className,
}: DataTableProps<T>) {
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [page, setPage] = React.useState(0);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((row) =>
      columns.some((col) => String(col.sortValue?.(row) ?? "").toLowerCase().includes(q)),
    );
  }, [rows, columns, query]);

  const sorted = React.useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const out = [...filtered].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv), "pt-BR");
    });
    return sortDir === "asc" ? out : out.reverse();
  }, [filtered, columns, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  return (
    <Blueprint className={cn("flex flex-col", className)}>
      {searchable ? (
        <div className="flex items-center gap-2 border-b border-divider p-2">
          <Search className="size-4 shrink-0 text-neutral-500" aria-hidden />
          <input
            className="field h-7 border-0 p-0 focus:shadow-none"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          className="border-0"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                {columns.map((col) => {
                  const active = sortKey === col.key;
                  const Icon = !active ? ChevronsUpDown : sortDir === "asc" ? ChevronUp : ChevronDown;
                  return (
                    <th
                      key={col.key}
                      style={col.width ? { width: col.width } : undefined}
                      className={col.align === "right" ? "text-right" : undefined}
                      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      {col.sortValue ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className={cn(
                            "inline-flex cursor-pointer items-center gap-1 hover:text-accent-700",
                            active && "text-accent-700",
                            col.align === "right" && "flex-row-reverse",
                          )}
                        >
                          {col.header}
                          <Icon className="size-3" aria-hidden />
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(col.align === "right" && "text-right", col.numeric && "num")}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sorted.length > 0 ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-divider p-2">
          <p className="caption min-w-0 truncate">
            <span className="num">{sorted.length}</span> registro(s) · página{" "}
            <span className="num">{current + 1}</span>/<span className="num">{pageCount}</span>
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      ) : null}
    </Blueprint>
  );
}
