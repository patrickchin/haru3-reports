import { useCallback, useEffect, useRef, useState } from "react";

const RESET_MS = 1500;

/**
 * Browser clipboard helper. Falls back to a hidden textarea + execCommand
 * when the async Clipboard API isn't available (older browsers, insecure
 * contexts, some webviews).
 */
async function writeToClipboard(value: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fall through
    }
  }

  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function useCopyToClipboard() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = useCallback(
    async (value: string | null | undefined, key?: string) => {
      if (!value) return false;
      const ok = await writeToClipboard(value);
      if (!ok) return false;
      setCopiedKey(key ?? value);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopiedKey(null), RESET_MS);
      return true;
    },
    [],
  );

  const isCopied = useCallback(
    (key: string) => copiedKey === key,
    [copiedKey],
  );

  return { copy, isCopied, copiedKey };
}
