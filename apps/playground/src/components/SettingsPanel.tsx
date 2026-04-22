import { useState } from "react";
import { getProviderKeys, setProviderKeys, type ProviderKeys } from "../lib/access";

const PROVIDERS: { key: keyof ProviderKeys; label: string; placeholder: string }[] = [
  { key: "kimi", label: "Kimi (Moonshot)", placeholder: "sk-..." },
  { key: "openai", label: "OpenAI", placeholder: "sk-proj-..." },
  { key: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { key: "google", label: "Google AI", placeholder: "AI..." },
];

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [keys, setKeys] = useState<ProviderKeys>(() => getProviderKeys());
  const [saved, setSaved] = useState(false);

  if (!open) return null;

  const handleChange = (provider: keyof ProviderKeys, value: string) => {
    setKeys((prev) => ({ ...prev, [provider]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    setProviderKeys(keys);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const filledCount = Object.values(keys).filter((v) => v?.trim()).length;

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h3 className="settings-title">API Keys</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <p className="settings-hint">
          Keys are stored in your browser only and sent to the edge function per
          request. They override server-side keys when set.
        </p>

        <div className="settings-fields">
          {PROVIDERS.map(({ key, label, placeholder }) => (
            <div key={key} className="settings-field">
              <label className="settings-label">
                {label}
                {keys[key]?.trim() ? (
                  <span className="settings-dot settings-dot-set" />
                ) : (
                  <span className="settings-dot" />
                )}
              </label>
              <input
                type="password"
                className="settings-input"
                placeholder={placeholder}
                value={keys[key] ?? ""}
                onChange={(e) => handleChange(key, e.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="settings-footer">
          <span className="settings-count">
            {filledCount} of {PROVIDERS.length} configured
          </span>
          <button className="btn btn-primary btn-sm" onClick={handleSave}>
            {saved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
