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
      </div>

      <div className="next-steps-list">
        {steps.map((step, i) => (
          <div key={i} className="next-step-row">
            <span className="next-step-number">{i + 1}.</span>
            <span className="next-step-text">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
