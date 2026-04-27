import { CopyButton } from "../CopyButton";
import { nextStepsToText } from "../../lib/report-to-text";

interface NextStepsCardProps {
  steps: readonly string[];
}

export function NextStepsCard({ steps }: NextStepsCardProps) {
  if (steps.length === 0) return null;

  return (
    <div className="card">
      <div className="section-header">
        <h3 className="section-title">Next Steps</h3>
        <span className="section-subtitle">
          {steps.length} follow-up action{steps.length !== 1 ? "s" : ""}
        </span>
        <CopyButton
          label="Copy all next steps"
          getValue={() => nextStepsToText(steps)}
        />
      </div>

      <div className="next-steps-list">
        {steps.map((step, i) => (
          <div key={i} className="next-step-row copyable-row">
            <span className="next-step-number">{i + 1}.</span>
            <span className="next-step-text">{step}</span>
            <CopyButton label={`Copy step ${i + 1}`} value={step} />
          </div>
        ))}
      </div>
    </div>
  );
}
