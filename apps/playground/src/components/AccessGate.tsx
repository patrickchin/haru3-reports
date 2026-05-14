import { useState } from "react";
import { validatePlaygroundKey } from "../lib/playground-client";

interface AccessGateProps {
  onKeySubmit: (key: string) => void;
  error?: string | null;
}

export function AccessGate({ onKeySubmit, error }: AccessGateProps) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [validating, setValidating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || validating) return;

    setLocalError(null);
    setValidating(true);
    try {
      const result = await validatePlaygroundKey(trimmed);
      if (result.ok) {
        onKeySubmit(trimmed);
      } else if (result.reason === "invalid") {
        setLocalError("That key was rejected by the server. Try again.");
      } else if (result.reason === "rate_limited") {
        setLocalError("Too many attempts — try again in a minute.");
      } else {
        setLocalError("Server error — try again shortly.");
      }
    } catch {
      setLocalError("Network error — check your connection and try again.");
    } finally {
      setValidating(false);
    }
  };

  const shownError = localError ?? error;

  return (
    <div className="gate-backdrop">
      <form className="gate-card" onSubmit={handleSubmit}>
        <div className="gate-icon">🔒</div>
        <h2 className="gate-title">Access key required</h2>
        <p className="gate-subtitle">
          Paste the access key to use the playground.
        </p>

        {shownError && <div className="gate-error">{shownError}</div>}

        <div className="gate-input-row">
          <input
            type={show ? "text" : "password"}
            className="gate-input"
            placeholder="Paste your key…"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (localError) setLocalError(null);
            }}
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={validating}
          />
          <button
            type="button"
            className="gate-show-btn"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide key" : "Show key"}
            tabIndex={-1}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={!value.trim() || validating}
        >
          {validating ? "Checking…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
