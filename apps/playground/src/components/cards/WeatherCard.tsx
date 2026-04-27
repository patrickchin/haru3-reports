import type { GeneratedSiteReport } from "../../lib/generated-report";
import { weatherToText } from "../../lib/report-to-text";
import { CopyButton } from "../CopyButton";

interface WeatherCardProps {
  report: GeneratedSiteReport;
}

export function WeatherCard({ report }: WeatherCardProps) {
  const weather = report.report.weather;
  if (!weather) return null;

  const items = [
    weather.conditions ? { icon: "☁️", text: weather.conditions } : null,
    weather.temperature ? { icon: "🌡️", text: weather.temperature } : null,
    weather.wind ? { icon: "💨", text: weather.wind } : null,
  ].filter(Boolean) as { icon: string; text: string }[];

  if (items.length === 0) return null;

  return (
    <div className="card weather-card">
      <div className="weather-card-header">
        <div className="weather-items">
          {items.map((item) => (
            <span key={item.text} className="weather-chip">
              {item.icon} {item.text}
            </span>
          ))}
        </div>
        <CopyButton
          label="Copy weather"
          getValue={() => weatherToText(report)}
        />
      </div>
      {weather.impact && (
        <p className="card-muted" style={{ marginTop: 8 }}>
          Impact: {weather.impact}
        </p>
      )}
    </div>
  );
}
