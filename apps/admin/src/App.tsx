import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type DependencyList,
  type FormEvent,
  type ReactNode,
} from "react";
import "./index.css";
import {
  compactNumber,
  fetchAdminActivity,
  fetchAdminAnalytics,
  fetchAdminAudit,
  fetchAdminBootstrap,
  fetchAdminOrgs,
  fetchAdminReportDetail,
  fetchAdminReports,
  fetchAdminSiteDetail,
  fetchAdminSites,
  fetchAdminUsers,
  formatDate,
  formatDateTime,
  readStoredSession,
  restoreAdminSession,
  signInAdmin,
  signOutAdmin,
  updateAdminOrg,
  updateAdminSite,
  type AdminActivityRow,
  type AdminAnalytics,
  type AdminAuditRow,
  type AdminBootstrap,
  type AdminOrgRow,
  type AdminReportDetail,
  type AdminReportRow,
  type AdminSession,
  type AdminSiteDetail,
  type AdminSiteRow,
  type AdminUserRow,
} from "./admin-api";

type RouteKey =
  | "overview"
  | "sites"
  | "reports"
  | "users"
  | "accounts"
  | "activity"
  | "audit";

type LoadState<T> = {
  loading: boolean;
  error: string | null;
  data: T | null;
};

type NavItem = {
  key: RouteKey;
  label: string;
  description: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", description: "Live platform summary" },
  { key: "sites", label: "Sites", description: "Project operations and status" },
  { key: "reports", label: "Reports", description: "Generated report review" },
  { key: "users", label: "Users", description: "Mobile user footprint" },
  { key: "accounts", label: "Accounts", description: "Organizations and plans" },
  { key: "activity", label: "Activity", description: "Cross-platform event feed" },
  { key: "audit", label: "Audit", description: "Admin action history" },
];

const SITE_STATUSES = ["", "active", "delayed", "completed", "archived"] as const;
const REPORT_TYPES = ["", "daily", "safety", "incident", "inspection", "site_visit", "progress"] as const;
const REPORT_STATUSES = ["", "draft", "final"] as const;
const ACTIVITY_KINDS = ["", "site", "report", "member", "ai", "admin"] as const;
const ACCOUNT_PLANS = ["free", "pro", "enterprise"] as const;

export default function App() {
  const configured = Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
  );
  const [session, setSession] = useState<AdminSession | null>(null);
  const [bootstrap, setBootstrap] = useState<LoadState<AdminBootstrap>>({
    loading: true,
    error: null,
    data: null,
  });

  useEffect(() => {
    if (!configured) {
      setBootstrap({
        loading: false,
        error: "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured.",
        data: null,
      });
      return;
    }

    const stored = readStoredSession();
    if (!stored) {
      setBootstrap({ loading: false, error: null, data: null });
      return;
    }

    let active = true;
    void (async () => {
      try {
        const restored = await restoreAdminSession(stored);
        const nextBootstrap = await fetchAdminBootstrap(restored);
        if (!active) return;
        setSession(restored);
        setBootstrap({ loading: false, error: null, data: nextBootstrap });
      } catch (error) {
        if (!active) return;
        signOutAdmin();
        setSession(null);
        setBootstrap({
          loading: false,
          error: error instanceof Error ? error.message : "Failed to restore admin session.",
          data: null,
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [configured]);

  if (!configured) {
    return (
      <Centered>
        <InlineNotice tone="danger" title="Environment not configured">
          Set the web Supabase URL and anon key so the internal admin app can call the admin edge functions.
        </InlineNotice>
      </Centered>
    );
  }

  if (!session) {
    return (
      <Centered>
        <LoginCard
          loading={bootstrap.loading}
          initialError={bootstrap.error}
          onSignedIn={(nextSession, nextBootstrap) => {
            setSession(nextSession);
            setBootstrap({ loading: false, error: null, data: nextBootstrap });
          }}
        />
      </Centered>
    );
  }

  return (
    <AdminApp
      session={session}
      bootstrap={bootstrap.data}
      onBootstrapChange={(nextBootstrap) =>
        setBootstrap({ loading: false, error: null, data: nextBootstrap })}
      onSignOut={() => {
        signOutAdmin();
        setSession(null);
        setBootstrap({ loading: false, error: null, data: null });
      }}
    />
  );
}

function AdminApp({
  session,
  bootstrap,
  onBootstrapChange,
  onSignOut,
}: {
  session: AdminSession;
  bootstrap: AdminBootstrap | null;
  onBootstrapChange: (value: AdminBootstrap) => void;
  onSignOut: () => void;
}) {
  const [route, setRoute] = useHashRoute();
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const nextBootstrap = await fetchAdminBootstrap(session);
        if (!active) return;
        onBootstrapChange(nextBootstrap);
      } catch {
        // Ignore bootstrap refresh failures here; route views surface their own errors.
      }
    })();

    return () => {
      active = false;
    };
  }, [session, refreshTick, onBootstrapChange]);

  const currentNav = NAV_ITEMS.find((item) => item.key === route) ?? NAV_ITEMS[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">H</div>
          <div>
            <p className="label">haru3-reports-admin</p>
            <h1>Platform Admin</h1>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`nav-item ${item.key === route ? "nav-item-active" : ""}`}
              onClick={() => startTransition(() => setRoute(item.key))}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-meta">
          <div className="meta-block">
            <span className="meta-kicker">Admin</span>
            <strong>{session.admin.displayName}</strong>
            <span>{session.admin.username}</span>
          </div>
          {bootstrap ? (
            <div className="stats-strip">
              <span>{bootstrap.stats.users} users</span>
              <span>{bootstrap.stats.sites} sites</span>
              <span>{bootstrap.stats.reports} reports</span>
            </div>
          ) : null}
          <Button variant="outline" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </aside>

      <main className="main-shell">
        <header className="screen-header">
          <div>
            <p className="label">{currentNav.label}</p>
            <h2>{currentNav.description}</h2>
          </div>
          <div className="header-actions">
            <StatusPill>Internal only</StatusPill>
            <Button variant="secondary" onClick={() => setRefreshTick((current) => current + 1)}>
              Refresh
            </Button>
          </div>
        </header>

        {route === "overview" ? <OverviewScreen session={session} refreshTick={refreshTick} /> : null}
        {route === "sites" ? <SitesScreen session={session} refreshTick={refreshTick} /> : null}
        {route === "reports" ? <ReportsScreen session={session} refreshTick={refreshTick} /> : null}
        {route === "users" ? <UsersScreen session={session} refreshTick={refreshTick} /> : null}
        {route === "accounts" ? <AccountsScreen session={session} refreshTick={refreshTick} /> : null}
        {route === "activity" ? <ActivityScreen session={session} refreshTick={refreshTick} /> : null}
        {route === "audit" ? <AuditScreen session={session} refreshTick={refreshTick} /> : null}
      </main>
    </div>
  );
}

function OverviewScreen({ session, refreshTick }: { session: AdminSession; refreshTick: number }) {
  const state = useLoadState<AdminAnalytics>(
    () => fetchAdminAnalytics(session),
    [session, refreshTick],
  );

  return (
    <AsyncSection state={state}>
      {state.data ? (
        <div className="screen-stack">
          <div className="stat-grid">
            <StatTile label="Users" value={state.data.overview.totalUsers} />
            <StatTile label="Accounts" value={state.data.overview.accounts} />
            <StatTile label="Active Sites" value={state.data.overview.activeSites} />
            <StatTile label="Reports" value={state.data.overview.totalReports} />
            <StatTile
              label="Draft Reports"
              value={state.data.overview.draftReports}
              tone={state.data.overview.draftReports > 0 ? "warning" : "default"}
            />
            <StatTile label="Monthly Tokens" value={compactNumber(state.data.overview.monthlyTokens)} />
            <StatTile
              label="Delayed Sites"
              value={state.data.overview.delayedSites}
              tone={state.data.overview.delayedSites > 0 ? "warning" : "default"}
            />
            <StatTile label="Member Assignments" value={state.data.overview.memberAssignments} />
          </div>

          <div className="overview-grid">
            <SurfaceCard>
              <SectionHeader
                title="7-Day Activity"
                subtitle="Real report creation and AI token volume from the last week."
              />
              <BarChart data={state.data.timeline} />
            </SurfaceCard>

            <SurfaceCard>
              <SectionHeader
                title="AI Providers"
                subtitle="Current provider/model usage from token tracking."
              />
              <div className="stack-list">
                {state.data.providers.map((provider) => (
                  <div key={`${provider.provider}:${provider.model}`} className="list-card">
                    <div className="row-head">
                      <strong>{provider.provider}</strong>
                      <StatusBadge variant="info">{provider.runs} runs</StatusBadge>
                    </div>
                    <span>{provider.model}</span>
                    <span>
                      {compactNumber(provider.totalTokens)} tokens · {provider.cacheRatio}% cached
                    </span>
                  </div>
                ))}
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <SectionHeader
                title="Attention"
                subtitle="Operational issues inferred from real site and report data."
              />
              <div className="stack-list">
                {state.data.attention.length ? (
                  state.data.attention.map((item) => (
                    <NoticePanel key={item.id} severity={item.severity}>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                      <span>{formatDateTime(item.createdAt)}</span>
                    </NoticePanel>
                  ))
                ) : (
                  <EmptyState>No urgent items in the current dataset.</EmptyState>
                )}
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <SectionHeader
                title="Site Coverage"
                subtitle="The busiest live sites in the current platform data."
              />
              <div className="stack-list">
                {state.data.sites.map((site) => (
                  <div key={site.id} className="list-card">
                    <div className="row-head">
                      <strong>{site.name}</strong>
                      <StatusBadge variant={site.status}>{site.status}</StatusBadge>
                    </div>
                    <span>{site.ownerName}</span>
                    <span>
                      {site.reportCount} reports · {site.memberCount} members · {compactNumber(site.tokenCount)} tokens
                    </span>
                  </div>
                ))}
              </div>
            </SurfaceCard>

            <SurfaceCard className="wide-card">
              <SectionHeader
                title="Recent Activity"
                subtitle="Sites, reports, memberships, and admin actions from the live backend."
              />
              <div className="stack-list">
                {state.data.activity.map((item) => (
                  <div key={item.id} className="timeline-row">
                    <div className="timeline-dot" />
                    <div className="timeline-copy">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                      <span>{formatDateTime(item.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </SurfaceCard>
          </div>
        </div>
      ) : null}
    </AsyncSection>
  );
}

function SitesScreen({ session, refreshTick }: { session: AdminSession; refreshTick: number }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const deferredSearch = useDeferredValue(search);

  const listState = useLoadState(
    () =>
      fetchAdminSites(session, {
        search: deferredSearch,
        status,
        limit: 100,
      }),
    [session, deferredSearch, status, refreshTick],
  );

  const selectedId = useAutoSelectedId(listState.data?.data, (row) => row.id);
  const detailState = useLoadState<AdminSiteDetail>(
    () => (selectedId ? fetchAdminSiteDetail(session, selectedId) : Promise.resolve(null)),
    [session, selectedId, refreshTick],
  );

  const [siteActionLoading, setSiteActionLoading] = useState(false);

  async function handleSiteUpdate(siteId: string, updates: { status?: string; archive?: boolean; restore?: boolean }) {
    setSiteActionLoading(true);
    try {
      await updateAdminSite(session, siteId, updates);
      window.location.hash = "#sites";
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to update site.");
    } finally {
      setSiteActionLoading(false);
    }
  }

  return (
    <div className="screen-stack">
      <Toolbar>
        <input
          className="text-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search sites by name, client, address, or owner"
        />
        <select className="select-input" value={status} onChange={(event) => setStatus(event.target.value)}>
          {SITE_STATUSES.map((value) => (
            <option key={value || "all"} value={value}>
              {value || "All statuses"}
            </option>
          ))}
        </select>
      </Toolbar>

      <div className="split-layout">
        <SurfaceCard>
          <SectionHeader
            title="Sites"
            subtitle="Real project/site records from the mobile app backend."
          />
          <AsyncSection state={listState}>
            {listState.data?.data?.length ? (
              <div className="select-list">
                {listState.data.data.map((site) => (
                  <SelectableRow
                    key={site.id}
                    active={site.id === selectedId}
                    onClick={() => setHashSelection(site.id)}
                    title={site.name}
                    subtitle={`${site.owner?.full_name ?? "Unknown owner"} · ${site.report_count} reports`}
                    meta={<StatusBadge variant={site.status}>{site.status}</StatusBadge>}
                  />
                ))}
              </div>
            ) : (
              <EmptyState>No sites matched the current filter.</EmptyState>
            )}
          </AsyncSection>
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeader
            title="Site Detail"
            subtitle="Site state, members, reports, and usage events."
          />
          <AsyncSection state={detailState}>
            {detailState.data ? (
              <SiteDetailPanel
                detail={detailState.data}
                loading={siteActionLoading}
                onSiteUpdate={handleSiteUpdate}
              />
            ) : (
              <EmptyState>Select a site to inspect it.</EmptyState>
            )}
          </AsyncSection>
        </SurfaceCard>
      </div>
    </div>
  );
}

function ReportsScreen({ session, refreshTick }: { session: AdminSession; refreshTick: number }) {
  const [search, setSearch] = useState("");
  const [reportType, setReportType] = useState("");
  const [reportStatus, setReportStatus] = useState("");
  const deferredSearch = useDeferredValue(search);

  const listState = useLoadState(
    () =>
      fetchAdminReports(session, {
        search: deferredSearch,
        report_type: reportType,
        status: reportStatus,
        limit: 100,
      }),
    [session, deferredSearch, reportType, reportStatus, refreshTick],
  );

  const selectedId = useAutoSelectedId(listState.data?.data, (row) => row.id);
  const detailState = useLoadState<AdminReportDetail>(
    () => (selectedId ? fetchAdminReportDetail(session, selectedId) : Promise.resolve(null)),
    [session, selectedId, refreshTick],
  );

  return (
    <div className="screen-stack">
      <Toolbar>
        <input
          className="text-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search reports by title"
        />
        <select className="select-input" value={reportType} onChange={(event) => setReportType(event.target.value)}>
          {REPORT_TYPES.map((value) => (
            <option key={value || "all"} value={value}>
              {value ? value.replace("_", " ") : "All report types"}
            </option>
          ))}
        </select>
        <select className="select-input" value={reportStatus} onChange={(event) => setReportStatus(event.target.value)}>
          {REPORT_STATUSES.map((value) => (
            <option key={value || "all"} value={value}>
              {value || "All statuses"}
            </option>
          ))}
        </select>
      </Toolbar>

      <div className="split-layout">
        <SurfaceCard>
          <SectionHeader
            title="Reports"
            subtitle="Real report rows and ownership context from the backend."
          />
          <AsyncSection state={listState}>
            {listState.data?.data?.length ? (
              <div className="select-list">
                {listState.data.data.map((report) => (
                  <SelectableRow
                    key={report.id}
                    active={report.id === selectedId}
                    onClick={() => setHashSelection(report.id)}
                    title={report.title}
                    subtitle={`${report.projects?.name ?? "Unknown site"} · ${report.profiles?.full_name ?? report.profiles?.phone ?? "Unknown owner"}`}
                    meta={<StatusBadge variant={report.status}>{report.status}</StatusBadge>}
                  />
                ))}
              </div>
            ) : (
              <EmptyState>No reports matched the current filter.</EmptyState>
            )}
          </AsyncSection>
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeader
            title="Report Detail"
            subtitle="Stored report payload and related token usage."
          />
          <AsyncSection state={detailState}>
            {detailState.data ? <ReportDetailPanel detail={detailState.data} /> : <EmptyState>Select a report.</EmptyState>}
          </AsyncSection>
        </SurfaceCard>
      </div>
    </div>
  );
}

function UsersScreen({ session, refreshTick }: { session: AdminSession; refreshTick: number }) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const state = useLoadState(
    () => fetchAdminUsers(session, { search: deferredSearch, limit: 100 }),
    [session, deferredSearch, refreshTick],
  );

  return (
    <div className="screen-stack">
      <Toolbar>
        <input
          className="text-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, phone, or company"
        />
      </Toolbar>

      <SurfaceCard>
        <SectionHeader
          title="Mobile Users"
          subtitle="Read-only operational view of actual app users and their footprint."
        />
        <AsyncSection state={state}>
          {state.data?.data?.length ? (
            <div className="data-table">
              <div className="table-head users-table">
                <span>User</span>
                <span>Owned work</span>
                <span>Usage</span>
              </div>
              {state.data.data.map((user) => (
                <div key={user.id} className="table-row users-table">
                  <div className="cell-stack">
                    <strong>{user.full_name ?? user.phone}</strong>
                    <span>{user.company_name ?? "No company"}</span>
                    <span>{user.phone}</span>
                  </div>
                  <div className="cell-stack">
                    <span>{user.project_count} owned sites</span>
                    <span>{user.report_count} reports</span>
                    <span>{user.member_count} site memberships</span>
                  </div>
                  <div className="cell-stack">
                    <span>{compactNumber(user.total_tokens)} tokens</span>
                    <span>Roles: {user.roles.length ? user.roles.join(", ") : "none"}</span>
                    <span>Last active {formatDateTime(user.last_activity)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>No users matched the current filter.</EmptyState>
          )}
        </AsyncSection>
      </SurfaceCard>
    </div>
  );
}

function AccountsScreen({ session, refreshTick }: { session: AdminSession; refreshTick: number }) {
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("");
  const deferredSearch = useDeferredValue(search);
  const state = useLoadState(
    () => fetchAdminOrgs(session, { search: deferredSearch, plan, limit: 100 }),
    [session, deferredSearch, plan, refreshTick],
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { plan: AdminOrgRow["plan"]; max_seats: number }>>({});

  async function saveAccount(org: AdminOrgRow) {
    const draft = drafts[org.id];
    if (!draft) return;
    setSavingId(org.id);
    try {
      await updateAdminOrg(session, org.id, draft);
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to update account.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="screen-stack">
      <Toolbar>
        <input
          className="text-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search accounts by name, slug, or owner"
        />
        <select className="select-input" value={plan} onChange={(event) => setPlan(event.target.value)}>
          <option value="">All plans</option>
          {ACCOUNT_PLANS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </Toolbar>

      <SurfaceCard>
        <SectionHeader
          title="Accounts"
          subtitle="Organization-level administration using the real organization records."
        />
        <AsyncSection state={state}>
          {state.data?.data?.length ? (
            <div className="data-table">
              <div className="table-head accounts-table">
                <span>Account</span>
                <span>Footprint</span>
                <span>Plan</span>
              </div>
              {state.data.data.map((org) => {
                const draft = drafts[org.id] ?? { plan: org.plan, max_seats: org.max_seats };
                const changed = draft.plan !== org.plan || draft.max_seats !== org.max_seats;

                return (
                  <div key={org.id} className="table-row accounts-table">
                    <div className="cell-stack">
                      <strong>{org.name}</strong>
                      <span>{org.slug}</span>
                      <span>Owner {org.owner_name ?? "Unknown"}</span>
                    </div>
                    <div className="cell-stack">
                      <span>{org.member_count} members</span>
                      <span>{org.site_count} sites · {org.active_site_count} active</span>
                      <span>{compactNumber(org.token_count)} tokens · {org.report_count} reports</span>
                    </div>
                    <div className="inline-form">
                      <select
                        className="select-input"
                        value={draft.plan}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [org.id]: {
                              ...draft,
                              plan: event.target.value as AdminOrgRow["plan"],
                            },
                          }))}
                      >
                        {ACCOUNT_PLANS.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                      <input
                        className="text-input input-small"
                        type="number"
                        min={1}
                        value={draft.max_seats}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [org.id]: {
                              ...draft,
                              max_seats: Number(event.target.value),
                            },
                          }))}
                      />
                      <Button
                        onClick={() => saveAccount(org)}
                        disabled={!changed || savingId === org.id}
                      >
                        {savingId === org.id ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState>No accounts matched the current filter.</EmptyState>
          )}
        </AsyncSection>
      </SurfaceCard>
    </div>
  );
}

function ActivityScreen({ session, refreshTick }: { session: AdminSession; refreshTick: number }) {
  const [kind, setKind] = useState("");
  const state = useLoadState(
    () => fetchAdminActivity(session, { kind, limit: 150 }),
    [session, kind, refreshTick],
  );

  return (
    <div className="screen-stack">
      <Toolbar>
        <select className="select-input" value={kind} onChange={(event) => setKind(event.target.value)}>
          {ACTIVITY_KINDS.map((value) => (
            <option key={value || "all"} value={value}>
              {value || "All activity"}
            </option>
          ))}
        </select>
      </Toolbar>

      <SurfaceCard>
        <SectionHeader
          title="Activity Feed"
          subtitle="Synthetic live feed built from real sites, reports, memberships, AI usage, and audit actions."
        />
        <AsyncSection state={state}>
          {state.data?.data?.length ? (
            <div className="stack-list">
              {state.data.data.map((item) => (
                <div key={item.id} className="timeline-row">
                  <div className="timeline-dot" />
                  <div className="timeline-copy">
                    <div className="row-head">
                      <strong>{item.title}</strong>
                      <StatusBadge variant="info">{item.kind}</StatusBadge>
                    </div>
                    <span>{item.detail}</span>
                    <span>{formatDateTime(item.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>No activity matched the current filter.</EmptyState>
          )}
        </AsyncSection>
      </SurfaceCard>
    </div>
  );
}

function AuditScreen({ session, refreshTick }: { session: AdminSession; refreshTick: number }) {
  const state = useLoadState(
    () => fetchAdminAudit(session, { limit: 100 }),
    [session, refreshTick],
  );

  return (
    <SurfaceCard>
      <SectionHeader
        title="Audit Trail"
        subtitle="Internal admin actions captured by the admin web functions."
      />
      <AsyncSection state={state}>
        {state.data?.data?.length ? (
          <div className="stack-list">
            {state.data.data.map((item) => (
              <div key={item.id} className="audit-row">
                <div className="cell-stack">
                  <strong>{item.action}</strong>
                  <span>{item.target_type} · {item.target_id}</span>
                  <span>{formatDateTime(item.created_at)}</span>
                </div>
                <pre className="code-block code-inline">{JSON.stringify(item.metadata, null, 2)}</pre>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>No audit events found.</EmptyState>
        )}
      </AsyncSection>
    </SurfaceCard>
  );
}

function SiteDetailPanel({
  detail,
  loading,
  onSiteUpdate,
}: {
  detail: AdminSiteDetail;
  loading: boolean;
  onSiteUpdate: (siteId: string, updates: { status?: string; archive?: boolean; restore?: boolean }) => Promise<void>;
}) {
  const site = detail.site as {
    id: string;
    name: string;
    address: string | null;
    client_name: string | null;
    status: string;
    deleted_at: string | null;
    owner?: { full_name: string | null; company_name: string | null } | null;
  };
  const [draftStatus, setDraftStatus] = useState(site.status);

  useEffect(() => {
    setDraftStatus(site.status);
  }, [site.status]);

  return (
    <div className="detail-stack">
      <div className="detail-header">
        <div className="cell-stack">
          <strong>{site.name}</strong>
          <span>{site.address ?? "No address"}</span>
          <span>{site.client_name ?? "No client set"}</span>
          <span>Owner {site.owner?.full_name ?? "Unknown"}</span>
        </div>
        <StatusBadge variant={site.status}>{site.status}</StatusBadge>
      </div>

      <div className="inline-form">
        <select className="select-input" value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)}>
          {SITE_STATUSES.slice(1).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <Button
          onClick={() => onSiteUpdate(site.id, { status: draftStatus })}
          disabled={loading || draftStatus === site.status}
        >
          {loading ? "Saving..." : "Save status"}
        </Button>
        {site.deleted_at ? (
          <Button variant="secondary" onClick={() => onSiteUpdate(site.id, { restore: true })} disabled={loading}>
            Restore
          </Button>
        ) : (
          <Button variant="outline" onClick={() => onSiteUpdate(site.id, { archive: true })} disabled={loading}>
            Archive
          </Button>
        )}
      </div>

      <div className="detail-columns">
        <div className="detail-block">
          <p className="label">Reports</p>
          <div className="stack-list">
            {detail.reports.length ? (
              detail.reports.map((report) => (
                <div key={report.id} className="list-card">
                  <div className="row-head">
                    <strong>{report.title}</strong>
                    <StatusBadge variant={report.status}>{report.status}</StatusBadge>
                  </div>
                  <span>{report.report_type}</span>
                  <span>{formatDate(report.visit_date ?? report.created_at)}</span>
                </div>
              ))
            ) : (
              <EmptyState>No reports for this site.</EmptyState>
            )}
          </div>
        </div>

        <div className="detail-block">
          <p className="label">Members</p>
          <div className="stack-list">
            {detail.members.length ? (
              detail.members.map((member) => {
                const typedMember = member as {
                  id: string;
                  full_name: string | null;
                  company_name: string | null;
                  phone: string | null;
                  role: string;
                };
                return (
                  <div key={typedMember.id} className="list-card">
                    <div className="row-head">
                      <strong>{typedMember.full_name ?? typedMember.phone ?? "Unknown user"}</strong>
                      <StatusBadge variant="info">{typedMember.role}</StatusBadge>
                    </div>
                    <span>{typedMember.company_name ?? "No company"}</span>
                  </div>
                );
              })
            ) : (
              <EmptyState>No members on this site.</EmptyState>
            )}
          </div>
        </div>
      </div>

      <div className="detail-block">
        <p className="label">Usage Events</p>
        <div className="stack-list">
          {detail.usage.length ? (
            detail.usage.map((event) => (
              <div key={event.id} className="list-card">
                <div className="row-head">
                  <strong>{event.provider}</strong>
                  <span>{event.model}</span>
                </div>
                <span>{compactNumber(event.input_tokens + event.output_tokens)} tokens</span>
                <span>{formatDateTime(event.created_at)}</span>
              </div>
            ))
          ) : (
            <EmptyState>No usage events recorded for this site.</EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportDetailPanel({ detail }: { detail: AdminReportDetail }) {
  return (
    <div className="detail-stack">
      <div className="detail-block">
        <p className="label">Usage Events</p>
        <div className="stack-list">
          {detail.usageEvents.length ? (
            detail.usageEvents.map((event) => (
              <div key={event.id} className="list-card">
                <div className="row-head">
                  <strong>{event.provider}</strong>
                  <span>{event.model}</span>
                </div>
                <span>{compactNumber(event.input_tokens + event.output_tokens)} tokens</span>
                <span>{formatDateTime(event.created_at)}</span>
              </div>
            ))
          ) : (
            <EmptyState>No token usage events linked to this report.</EmptyState>
          )}
        </div>
      </div>

      <div className="detail-block">
        <p className="label">Stored Report Payload</p>
        <pre className="code-block">{JSON.stringify(detail.report, null, 2)}</pre>
      </div>
    </div>
  );
}

function LoginCard({
  loading,
  initialError,
  onSignedIn,
}: {
  loading: boolean;
  initialError: string | null;
  onSignedIn: (session: AdminSession, bootstrap: AdminBootstrap) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(initialError);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const nextSession = await signInAdmin(username, password);
      const nextBootstrap = await fetchAdminBootstrap(nextSession);
      onSignedIn(nextSession, nextBootstrap);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Admin sign-in failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SurfaceCard className="login-card">
      <p className="label">haru3-reports-admin</p>
      <h1>Sign in</h1>
      <p className="muted-copy">
        This uses the separate internal admin credential flow, not the mobile app’s end-user authentication.
      </p>
      <form className="form-stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>Username</span>
          <input
            className="text-input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="admin username"
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            className="text-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="admin password"
          />
        </label>
        {loading ? <InlineNotice tone="info" title="Checking saved session">Please wait...</InlineNotice> : null}
        {error ? <InlineNotice tone="danger" title="Sign-in failed">{error}</InlineNotice> : null}
        <Button type="submit" disabled={saving}>
          {saving ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </SurfaceCard>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="centered-shell">{children}</div>;
}

function SurfaceCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`surface-card ${className}`.trim()}>{children}</section>;
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="section-header">
      <div>
        <p className="label">{title}</p>
        <h3>{title}</h3>
      </div>
      <p>{subtitle}</p>
    </div>
  );
}

function AsyncSection<T>({ state, children }: { state: LoadState<T>; children: ReactNode }) {
  if (state.loading) return <EmptyState>Loading...</EmptyState>;
  if (state.error) {
    return (
      <InlineNotice tone="danger" title="Request failed">
        {state.error}
      </InlineNotice>
    );
  }
  return <>{children}</>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

function InlineNotice({
  children,
  title,
  tone,
}: {
  children: ReactNode;
  title: string;
  tone: "info" | "danger";
}) {
  return (
    <div className={`inline-notice inline-notice-${tone}`}>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function NoticePanel({
  children,
  severity,
}: {
  children: ReactNode;
  severity: "high" | "medium" | "low";
}) {
  return <div className={`notice-panel notice-panel-${severity}`}>{children}</div>;
}

function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warning";
}) {
  return (
    <div className={`stat-tile stat-tile-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

function Button({
  children,
  onClick,
  type = "button",
  variant = "default",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "default" | "secondary" | "outline";
  disabled?: boolean;
}) {
  return (
    <button type={type} className={`button button-${variant}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function StatusBadge({ children, variant }: { children: ReactNode; variant: string }) {
  const normalized =
    variant === "active" || variant === "final" || variant === "completed"
      ? "success"
      : variant === "delayed" || variant === "draft"
      ? "warning"
      : "info";

  return <span className={`status-badge status-badge-${normalized}`}>{children}</span>;
}

function StatusPill({ children }: { children: ReactNode }) {
  return <span className="status-pill">{children}</span>;
}

function BarChart({ data }: { data: AdminAnalytics["timeline"] }) {
  const maxReports = Math.max(...data.map((item) => item.reports), 1);
  const maxTokens = Math.max(...data.map((item) => item.tokens), 1);

  return (
    <div className="bar-chart">
      {data.map((item) => (
        <div key={item.date} className="bar-column">
          <div className="bar-stack">
            <div className="bar-bar bar-bar-primary" style={{ height: `${Math.max(12, (item.reports / maxReports) * 100)}%` }} />
            <div className="bar-bar bar-bar-secondary" style={{ height: `${Math.max(12, (item.tokens / maxTokens) * 100)}%` }} />
          </div>
          <span>{new Date(item.date).toLocaleDateString("en-US", { weekday: "short" })}</span>
        </div>
      ))}
    </div>
  );
}

function SelectableRow({
  active,
  onClick,
  title,
  subtitle,
  meta,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  meta: ReactNode;
}) {
  return (
    <button type="button" className={`select-row ${active ? "select-row-active" : ""}`} onClick={onClick}>
      <div className="cell-stack">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      {meta}
    </button>
  );
}

function useLoadState<T>(
  loader: () => Promise<T | null>,
  deps: DependencyList,
): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({
    loading: true,
    error: null,
    data: null,
  });

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));

    void (async () => {
      try {
        const data = await loader();
        if (!active) return;
        setState({ loading: false, error: null, data });
      } catch (error) {
        if (!active) return;
        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Request failed.",
          data: null,
        });
      }
    })();

    return () => {
      active = false;
    };
  }, deps);

  return state;
}

function useHashRoute(): [RouteKey, (route: RouteKey) => void] {
  const read = () => {
    const value = window.location.hash.replace(/^#/, "").split(":")[0];
    return NAV_ITEMS.some((item) => item.key === value) ? (value as RouteKey) : "overview";
  };

  const [route, setRoute] = useState<RouteKey>(read);

  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return [
    route,
    (nextRoute) => {
      window.location.hash = `#${nextRoute}`;
      setRoute(nextRoute);
    },
  ];
}

function useAutoSelectedId<T>(
  rows: T[] | undefined,
  getId: (row: T) => string,
) {
  const read = () => window.location.hash.split(":")[1] ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(read);

  useEffect(() => {
    const current = read();
    if (current) {
      setSelectedId(current);
      return;
    }
    if (rows?.length) {
      setSelectedId(getId(rows[0]));
    } else {
      setSelectedId(null);
    }
  }, [rows, getId]);

  return selectedId;
}

function setHashSelection(id: string) {
  const base = (window.location.hash.replace(/:.*/, "").split(":")[0]) || "#overview";
  window.location.hash = `${base}:${id}`;
}
