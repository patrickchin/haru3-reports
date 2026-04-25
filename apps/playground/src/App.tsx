import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from "react";
import { getKey, setKey, clearKey, clearProviderKeys, getProviderKeys, type ProviderKeys } from "./lib/access";
import { useReportGeneration } from "./hooks/useReportGeneration";
import { fetchServerProviders } from "./lib/playground-client";
import { AccessGate } from "./components/AccessGate";
import { Header } from "./components/Header";
import { NotesPanel } from "./components/NotesPanel";
import { NoteInput } from "./components/NoteInput";
import { SampleNotesMenu } from "./components/SampleNotesMenu";
import { ReportPanel } from "./components/ReportPanel";
import { LivePulse } from "./components/LivePulse";
import { SettingsPanel } from "./components/SettingsPanel";

const REPORT_TEMPLATE = {
  report: {
    meta: {
      title: "(string) Report title",
      reportType: "(string) e.g. site_visit",
      summary: "(string) Brief overview of the report",
      visitDate: "(string | null) ISO date of site visit",
    },
    weather: {
      conditions: "(string | null) e.g. Sunny, Rainy",
      temperature: "(string | null) e.g. 28°C",
      wind: "(string | null) e.g. Light breeze",
      impact: "(string | null) Weather impact on work",
    },
    manpower: {
      totalWorkers: "(number | null) Total workers on site",
      workerHours: "(string | null) e.g. 8am–5pm",
      workersCostPerDay: "(string | null) Daily cost per worker",
      workersCostCurrency: "(string | null) e.g. USD",
      notes: "(string | null) Additional manpower notes",
      roles: [
        {
          role: "(string) Role name e.g. Electrician",
          count: "(number | null) Number of workers",
          notes: "(string | null) Role-specific notes",
        },
      ],
    },
    siteConditions: [
      {
        topic: "(string) Condition topic e.g. Ground, Access",
        details: "(string) Description of condition",
      },
    ],
    activities: [
      {
        name: "(string) Activity name",
        description: "(string | null) Detailed description",
        location: "(string | null) Where on site",
        status: "(string) e.g. in_progress, completed, reported",
        summary: "(string) Brief activity summary",
        contractors: "(string | null) Contractor names",
        engineers: "(string | null) Engineer names",
        visitors: "(string | null) Visitor names",
        startDate: "(string | null) ISO date",
        endDate: "(string | null) ISO date",
        sourceNoteIndexes: ["(number) 1-based index of source note"],
        manpower: {
          totalWorkers: "(number | null)",
          workerHours: "(string | null)",
          workersCostPerDay: "(string | null)",
          workersCostCurrency: "(string | null)",
          notes: "(string | null)",
          roles: [],
        },
        materials: [
          {
            name: "(string) Material name",
            quantity: "(string | null)",
            quantityUnit: "(string | null)",
            unitCost: "(string | null)",
            unitCostCurrency: "(string | null)",
            totalCost: "(string | null)",
            totalCostCurrency: "(string | null)",
            condition: "(string | null)",
            status: "(string | null)",
            notes: "(string | null)",
          },
        ],
        equipment: [
          {
            name: "(string) Equipment name",
            quantity: "(string | null)",
            cost: "(string | null)",
            costCurrency: "(string | null)",
            condition: "(string | null)",
            ownership: "(string | null)",
            status: "(string | null)",
            hoursUsed: "(string | null)",
            notes: "(string | null)",
          },
        ],
        issues: [
          {
            title: "(string) Issue title",
            category: "(string) e.g. safety, quality, other",
            severity: "(string) e.g. low, medium, high, critical",
            status: "(string) e.g. open, resolved, monitoring",
            details: "(string) Issue details",
            actionRequired: "(string | null) Required action",
            sourceNoteIndexes: [],
          },
        ],
        observations: ["(string) Observation note"],
      },
    ],
    issues: [
      {
        title: "(string) Issue title",
        category: "(string) e.g. safety, quality, other",
        severity: "(string) e.g. low, medium, high, critical",
        status: "(string) e.g. open, resolved, monitoring",
        details: "(string) Issue details",
        actionRequired: "(string | null) Required action",
        sourceNoteIndexes: ["(number) 1-based index of source note"],
      },
    ],
    nextSteps: ["(string) Next step description"],
    sections: [
      {
        title: "(string) Section title",
        content: "(string) Section body text",
        sourceNoteIndexes: ["(number) 1-based index of source note"],
      },
    ],
  },
};

const REPORT_TEMPLATE_JSON = JSON.stringify(REPORT_TEMPLATE, null, 2);
const MOBILE_TAB_ORDER = ["notes", "setup", "report"] as const;
type MobileTab = (typeof MOBILE_TAB_ORDER)[number];

export default function App() {
  const [hasKey, setHasKey] = useState(() => !!getKey());
  const [gateError, setGateError] = useState<string | null>(null);
  const [provider, setProvider] = useState("kimi");
  const [notesList, setNotesList] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providerKeys, setProviderKeysState] = useState<ProviderKeys>(() => getProviderKeys());
  const [serverProviders, setServerProviders] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"report" | "json" | "prompt" | "template">("report");
  const [mobileTab, setMobileTab] = useState<MobileTab>("notes");
  const [reportUnread, setReportUnread] = useState(false);
  const notesEndRef = useRef<HTMLDivElement>(null);
  const mobileTabRefs = useRef<Record<MobileTab, HTMLButtonElement | null>>({
    notes: null,
    setup: null,
    report: null,
  });

  // Fetch server-side available providers on mount
  useEffect(() => {
    if (hasKey) {
      fetchServerProviders().then(setServerProviders);
    }
  }, [hasKey]);

  const handleInvalidKey = useCallback(() => {
    setHasKey(false);
    setGateError("That key was rejected by the server. Try again.");
  }, []);

  const {
    report,
    isUpdating,
    error,
    generate,
    setReport,
    handleFullRegenerate,
    setLastProcessedCount,
    lastResponse,
  } = useReportGeneration(notesList, provider, handleInvalidKey);

  // Scroll notes to bottom when new note added
  useEffect(() => {
    notesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [notesList.length]);

  // Clear the unread dot whenever the user opens the Report tab
  useEffect(() => {
    if (mobileTab === "report") setReportUnread(false);
  }, [mobileTab]);

  // Mark Report tab unread when a new report arrives while Notes tab is active
  const prevReportRef = useRef(report);
  useEffect(() => {
    if (report && report !== prevReportRef.current && mobileTab !== "report") {
      setReportUnread(true);
    }
    prevReportRef.current = report;
  }, [report, mobileTab]);

  const handleKeySubmit = useCallback((key: string) => {
    setKey(key);
    setHasKey(true);
    setGateError(null);
  }, []);

  const handleClearKey = useCallback(() => {
    clearKey();
    clearProviderKeys();
    setHasKey(false);
    setNotesList([]);
    setReport(null);
    setLastProcessedCount(0);
  }, [setReport, setLastProcessedCount]);

  const handleAddNote = useCallback(
    (note: string) => {
      setNotesList((prev) => [...prev, note]);
    },
    [],
  );

  const handleRemoveNote = useCallback(
    (index: number) => {
      setNotesList((prev) => prev.filter((_, i) => i !== index));
    },
    [],
  );

  const handleLoadSample = useCallback(
    (notes: string[]) => {
      setNotesList(notes);
      setReport(null);
      setLastProcessedCount(0);
    },
    [setReport, setLastProcessedCount],
  );

  const handleReset = useCallback(() => {
    setNotesList([]);
    setReport(null);
    setLastProcessedCount(0);
  }, [setReport, setLastProcessedCount]);

  const handleGenerate = useCallback(() => {
    setMobileTab("report");
    generate();
  }, [generate]);

  const handleRegenerate = useCallback(() => {
    setMobileTab("report");
    handleFullRegenerate();
  }, [handleFullRegenerate]);

  const handleMobileTabKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    const tabs = MOBILE_TAB_ORDER.map((tab) => mobileTabRefs.current[tab]).filter(
      (tab): tab is HTMLButtonElement => tab !== null,
    );
    if (tabs.length === 0) {
      return;
    }

    const focusedIndex = tabs.findIndex((tab) => tab === document.activeElement);
    if (focusedIndex < 0) {
      return;
    }

    event.preventDefault();

    let nextIndex = focusedIndex;
    if (event.key === "ArrowLeft") {
      nextIndex = focusedIndex === 0 ? tabs.length - 1 : focusedIndex - 1;
    } else if (event.key === "ArrowRight") {
      nextIndex = focusedIndex === tabs.length - 1 ? 0 : focusedIndex + 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }

    const nextTab = tabs[nextIndex];
    if (!nextTab) {
      return;
    }
    nextTab.focus();
    const tabValue = nextTab.dataset.tab as MobileTab | undefined;
    if (tabValue === "notes" || tabValue === "setup" || tabValue === "report") {
      setMobileTab(tabValue);
    }
  }, []);

  const setMobileTabRef = (tab: MobileTab) => (node: HTMLButtonElement | null) => {
    mobileTabRefs.current[tab] = node;
  };

  const renderProviderSwitcher = () => (
    <div className="provider-switcher">
      {([
        { id: "kimi", label: "Kimi K2" },
        { id: "openai", label: "GPT-4o Mini" },
        { id: "anthropic", label: "Claude Sonnet" },
        { id: "google", label: "Gemini Flash" },
      ] as const).map(({ id, label }) => {
        const hasClientKey = !!providerKeys[id]?.trim();
        const hasServerKey = serverProviders.includes(id);
        const hasKey = hasClientKey || hasServerKey;
        return (
          <button
            key={id}
            className={`provider-btn ${provider === id ? "provider-btn-active" : ""} ${!hasKey ? "provider-btn-nokey" : ""}`}
            onClick={() => setProvider(id)}
            disabled={isUpdating || !hasKey}
            title={hasKey ? (hasClientKey ? `${id} (client key)` : `${id} (server key)`) : `${id} - no API key set`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  if (!hasKey) {
    return <AccessGate onKeySubmit={handleKeySubmit} error={gateError} />;
  }

  return (
    <div className="app">
      <Header
        noteCount={notesList.length}
        onClearKey={handleClearKey}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <SettingsPanel open={settingsOpen} onClose={() => { setSettingsOpen(false); setProviderKeysState(getProviderKeys()); }} />

      <nav
        className="mobile-tabs"
        role="tablist"
        aria-label="Playground view"
        onKeyDown={handleMobileTabKeyDown}
      >
        <button
          type="button"
          id="tab-notes"
          role="tab"
          data-tab="notes"
          aria-controls="panel-notes"
          aria-selected={mobileTab === "notes"}
          tabIndex={mobileTab === "notes" ? 0 : -1}
          className={`mobile-tab ${mobileTab === "notes" ? "mobile-tab-active" : ""}`}
          onClick={() => setMobileTab("notes")}
          ref={setMobileTabRef("notes")}
        >
          Notes
          {notesList.length > 0 && (
            <span className="mobile-tab-count">{notesList.length}</span>
          )}
        </button>
        <button
          type="button"
          id="tab-setup"
          role="tab"
          data-tab="setup"
          aria-controls="panel-setup"
          aria-selected={mobileTab === "setup"}
          tabIndex={mobileTab === "setup" ? 0 : -1}
          className={`mobile-tab ${mobileTab === "setup" ? "mobile-tab-active" : ""}`}
          onClick={() => setMobileTab("setup")}
          ref={setMobileTabRef("setup")}
        >
          Setup
        </button>
        <button
          type="button"
          id="tab-report"
          role="tab"
          data-tab="report"
          aria-controls="panel-report"
          aria-selected={mobileTab === "report"}
          tabIndex={mobileTab === "report" ? 0 : -1}
          className={`mobile-tab ${mobileTab === "report" ? "mobile-tab-active" : ""}`}
          onClick={() => setMobileTab("report")}
          ref={setMobileTabRef("report")}
        >
          Report
          {reportUnread && <span className="mobile-tab-dot" aria-label="updated" />}
        </button>
      </nav>

      <main className="layout" data-mobile-tab={mobileTab}>
        {/* Left panel — notes */}
        <div className="panel-left" id="panel-notes" role="tabpanel" aria-labelledby="tab-notes">
          <div className="notes-scroll">
            <NotesPanel notes={notesList} onRemove={handleRemoveNote} />
            <div ref={notesEndRef} />
          </div>

          <div className="panel-left-footer">
            <NoteInput onAdd={handleAddNote} disabled={isUpdating} />
            <button
              className="btn btn-primary btn-generate"
              onClick={handleGenerate}
              disabled={notesList.length === 0 || isUpdating}
            >
              {isUpdating ? "Generating…" : report ? "Update Report" : "Generate Report"}
            </button>
            <div className="desktop-only">
              {renderProviderSwitcher()}
              <SampleNotesMenu
                onLoad={handleLoadSample}
                onReset={handleReset}
                onRegenerate={handleRegenerate}
                hasNotes={notesList.length > 0}
                isUpdating={isUpdating}
              />
            </div>
          </div>
        </div>

        <div className="panel-setup mobile-only" id="panel-setup" role="tabpanel" aria-labelledby="tab-setup">
          <div className="panel-setup-content">
            {renderProviderSwitcher()}
            <SampleNotesMenu
              onLoad={handleLoadSample}
              onReset={handleReset}
              onRegenerate={handleRegenerate}
              hasNotes={notesList.length > 0}
              isUpdating={isUpdating}
            />
            <button
              className="btn btn-primary btn-generate"
              onClick={handleGenerate}
              disabled={notesList.length === 0 || isUpdating}
            >
              {isUpdating ? "Generating…" : report ? "Update Report" : "Generate Report"}
            </button>
          </div>
        </div>

        {/* Right panel — report */}
        <div className="panel-right" id="panel-report" role="tabpanel" aria-labelledby="tab-report">
          {isUpdating && <LivePulse noteCount={notesList.length} />}

          {error && <div className="error-banner">{error}</div>}

          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === "report" ? "view-toggle-btn-active" : ""}`}
              onClick={() => setViewMode("report")}
            >
              Report
            </button>
            <button
              className={`view-toggle-btn ${viewMode === "json" ? "view-toggle-btn-active" : ""}`}
              onClick={() => setViewMode("json")}
            >
              JSON
            </button>
            <button
              className={`view-toggle-btn ${viewMode === "prompt" ? "view-toggle-btn-active" : ""}`}
              onClick={() => setViewMode("prompt")}
            >
              Prompt
            </button>
            <button
              className={`view-toggle-btn ${viewMode === "template" ? "view-toggle-btn-active" : ""}`}
              onClick={() => setViewMode("template")}
            >
              Template
            </button>
          </div>

          {viewMode === "template" ? (
            <pre className="json-view template-view">{REPORT_TEMPLATE_JSON}</pre>
          ) : report ? (
            <>
              {viewMode === "report" ? (
                <ReportPanel report={report} />
              ) : viewMode === "json" ? (
                <pre className="json-view">{JSON.stringify(report, null, 2)}</pre>
              ) : (
                <pre className="json-view">{lastResponse?.systemPrompt ?? "System prompt not available"}</pre>
              )}
            </>
          ) : (
            <div className="report-empty">
              <p className="report-empty-title">No report yet</p>
              <p className="report-empty-hint">
                Add a note to generate a report, or load a sample set.
              </p>
            </div>
          )}

          {lastResponse && (
            <div className="model-info">
              {lastResponse.provider} · {lastResponse.model}
              {lastResponse.usage && (
                <span>
                  {" "}
                  · {lastResponse.usage.inputTokens} in / {lastResponse.usage.outputTokens} out
                </span>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
