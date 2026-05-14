import { useCallback, useState } from "react";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";

interface CopyButtonProps {
  /** Static value to copy. */
  value?: string | null;
  /** Function to compute value lazily (preferred for large/expensive payloads). */
  getValue?: () => string | null | undefined;
  /** Tooltip / aria label. */
  label?: string;
  /** Optional small label rendered next to the icon (e.g. "Copy report"). */
  text?: string;
  /** Visual style — defaults to ghost so it sits unobtrusively next to titles. */
  variant?: "ghost" | "outline";
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  /** Stop propagation (useful inside clickable rows). */
  stopPropagation?: boolean;
}

export function CopyButton({
  value,
  getValue,
  label = "Copy",
  text,
  variant = "ghost",
  size = "sm",
  className,
  disabled,
  stopPropagation,
}: CopyButtonProps) {
  const { copy } = useCopyToClipboard();
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      if (stopPropagation) event.stopPropagation();
      const resolved = getValue ? getValue() : value;
      if (!resolved) return;
      const ok = await copy(resolved);
      if (ok) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }
    },
    [copy, getValue, stopPropagation, value],
  );

  const variantClass = variant === "outline" ? "btn-outline" : "btn-ghost";
  const sizeClass = size === "sm" ? "btn-sm" : "";
  const classes = [
    "btn",
    "copy-btn",
    variantClass,
    sizeClass,
    copied ? "copy-btn-copied" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      onClick={handleClick}
      disabled={disabled}
      aria-label={label}
      title={copied ? "Copied!" : label}
    >
      <span className="copy-btn-icon" aria-hidden="true">
        {copied ? "✓" : "⧉"}
      </span>
      {text ? (
        <span className="copy-btn-text">{copied ? "Copied" : text}</span>
      ) : null}
    </button>
  );
}
