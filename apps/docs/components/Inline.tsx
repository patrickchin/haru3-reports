import Link from "next/link";
import { Fragment } from "react";

/**
 * Tiny inline renderer for guide step bodies.
 * Supports: **bold**, `code`, [text](href). No newlines, no block syntax.
 */
export function Inline({ children }: { children: string }) {
  return <>{render(children)}</>;
}

function render(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  // Tokenise: links, bold, code, plain.
  const re = /(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      const [, label, href] = lm;
      const internal = href.startsWith("/");
      nodes.push(
        internal ? (
          <Link key={key++} href={href} className="h3-link">
            {label}
          </Link>
        ) : (
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="h3-link"
          >
            {label}
          </a>
        ),
      );
    } else if (tok.startsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-semibold text-foreground">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok.startsWith("`")) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[13px] text-primary"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.map((n, i) => <Fragment key={i}>{n}</Fragment>);
}
