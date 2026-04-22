import { useState, useEffect } from "react";

interface LivePulseProps {
  noteCount?: number;
}

export function LivePulse({ noteCount }: LivePulseProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const id = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="live-pulse-container">
      <span className="live-dot" />
      <span className="live-text">
        Generating{noteCount ? ` from ${noteCount} notes` : ""}… {elapsed}s
      </span>
    </div>
  );
}
