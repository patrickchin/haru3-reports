import "./index.css";

const T = {
  bg: "#f8f6f1",
  fg: "#1a1a2e",
  card: "#ffffff",
  border: "#c2bfb5",
  muted: "#5c5c6e",
  orange: "#f47316",
};

const features = [
  ["orange", "VOICE", "Speak, don't type", "Dictate site observations and let AI structure the report."],
  ["blue", "AI", "Reports in seconds", "Generate daily reports with weather, manpower, issues, and next steps."],
  ["green", "EDIT", "Refine inline", "Edit generated sections before saving and sharing."],
  ["purple", "PROJECTS", "Multi-site ready", "Track active, delayed, and completed projects in one app."],
  ["red", "ISSUES", "Severity tagging", "Issues are grouped and prioritised for action."],
  ["teal", "SECURE", "Private by design", "Data is encrypted and stays inside your organisation."],
] as const;

const steps = [
  ["01", "Open a project"],
  ["02", "Speak your notes"],
  ["03", "Generate report"],
  ["04", "Review and save"],
] as const;

export default function App() {
  return (
    <div className="page" style={{ background: T.bg, color: T.fg }}>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <div className="brand">
            <span className="brand-box">H</span>
            <span className="brand-text">Harpa Pro</span>
          </div>
          <a className="btn btn-dark" href="#download">Get the app</a>
        </div>
      </header>

      <section className="hero section-line textured">
        <div className="wrap hero-grid">
          <div>
            <div className="chip chip-orange">AI-Powered · Field-Ready</div>
            <h1 className="h1">Site reports<br /><span className="underline">written for you.</span></h1>
            <p className="lead">Speak your observations on site. Harpa Pro transforms voice notes into professional construction reports in seconds.</p>
            <div className="row gap12">
              <a className="btn btn-orange" href="#download">Download for iOS</a>
              <a className="btn btn-light" href="#features">See features</a>
            </div>
            <div className="stats-bar">
              <div><b>&lt;10s</b><span>Generation</span></div>
              <div><b>100%</b><span>Voice-first</span></div>
              <div><b>All trades</b><span>Supported</span></div>
            </div>
          </div>

          <div className="card phone">
            <div className="phone-head">HARPA PRO <span>GENERATING</span></div>
            <div className="stats-grid">
              <div><b>24</b><span>WORKERS</span></div>
              <div><b>6</b><span>ACTIVITIES</span></div>
              <div><b>2</b><span>ISSUES</span></div>
            </div>
            <div className="stack">
              {["SUMMARY", "WEATHER", "MANPOWER", "ACTIVITIES"].map((v) => (
                <div className="row-item" key={v}>[{v}]</div>
              ))}
              <div className="row-item issue-item">
                <span className="severity">HIGH</span>
                Missing fall protection L3
              </div>
              <div className="row-item">[NEXT STEPS]</div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="section-line grid-dots">
        <div className="wrap section">
          <div className="label">FEATURES</div>
          <h2 className="h2">Blocky, fast, field-first reporting</h2>
          <div className="feature-grid">
            {features.map(([color, tag, title, body]) => (
              <article key={title} className={`feature-cell feature-${color}`}>
                <div className="chip">{tag}</div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-dark">
        <div className="wrap section">
          <div className="label label-light">HOW IT WORKS</div>
          <h2 className="h2 h2-light">From site to report in 4 steps</h2>
          <div className="steps-grid steps-dark">
            {steps.map(([n, title]) => (
              <div key={n} className="step-cell">
                <div className="step-no">{n}</div>
                <div className="step-bar"></div>
                <div className="step-title">{title}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="download" className="section-line textured">
        <div className="wrap section">
          <div className="download card">
            <div>
              <div className="label">DOWNLOAD</div>
              <h2 className="h2">Ready to save hours on site?</h2>
              <p className="lead small">Start free and generate your first report today.</p>
              <div className="row gap12">
                <a className="btn btn-dark" href="#">App Store</a>
                <a className="btn btn-light" href="#">Google Play</a>
              </div>
            </div>
            <div className="accent">H</div>
          </div>
        </div>
      </section>
    </div>
  );
}
