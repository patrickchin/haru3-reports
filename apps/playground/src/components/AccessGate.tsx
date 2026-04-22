import { useState } from "react";

interface AccessGateProps {
  onKeySubmit: (key: string) => void;
  error?: string | null;
}

export function AccessGate({ onKeySubmit, error }: AccessGateProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onKeySubmit(trimmed);
  };

  return (
    <div className="gate-backdrop">
      <form className="gate-card" onSubmit={handleSubmit}>
        <div className="gate-icon">🔒</div>
        <h2 className="gate-title">Access key required</h2>
        <p className="gate-subtitle">
          Paste the access key to use the playground.
        </p>

        {error && <div className="gate-error">{error}</div>}

        <input
          type="password"
          className="gate-input"
          placeholder="Paste your key…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />

        <button
          type="submit"
          className="btn btn-primary"
          disabled={!value.trim()}
        >
          Continue
        </button>
      </form>
    </div>
  );
}
