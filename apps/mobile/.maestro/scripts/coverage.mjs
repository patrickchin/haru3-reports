#!/usr/bin/env node
/**
 * Maestro coverage report.
 *
 * Maestro has no built-in coverage metric. We compute two proxies:
 *
 *   1. Route coverage  — % of files in apps/mobile/app/** that at least one
 *                        flow visits (heuristic: filename stem appears as a
 *                        tapped testID, route segment, or text match in any
 *                        flow YAML).
 *   2. testID coverage — % of unique testID="..." values declared anywhere
 *                        under apps/mobile/{app,components,hooks,lib} that
 *                        appear in any flow YAML.
 *
 * The thresholds are configurable via env vars; default 90 each. Process
 * exits 1 if either is below the threshold so this can gate CI.
 *
 * Usage:
 *   node .maestro/scripts/coverage.mjs           # text report
 *   node .maestro/scripts/coverage.mjs --json    # machine-readable
 *   ROUTE_THRESHOLD=85 TESTID_THRESHOLD=90 node .maestro/scripts/coverage.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const MOBILE_ROOT = join(__filename, "..", "..", "..");
const REPO_ROOT = join(MOBILE_ROOT, "..", "..");

const APP_DIR = join(MOBILE_ROOT, "app");
const SRC_DIRS = ["app", "components", "hooks", "lib"].map((d) =>
  join(MOBILE_ROOT, d),
);
const FLOW_DIR = join(MOBILE_ROOT, ".maestro");

const ROUTE_THRESHOLD = Number(process.env.ROUTE_THRESHOLD ?? 90);
const TESTID_THRESHOLD = Number(process.env.TESTID_THRESHOLD ?? 90);

const ROUTE_IGNORE = new Set([
  "_layout.tsx",
  "+not-found.tsx",
]);

function walk(dir, predicate, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, predicate, acc);
    else if (predicate(full)) acc.push(full);
  }
  return acc;
}

// 1. Collect all routes (every file under app/ that isn't a layout / not-found).
function collectRoutes() {
  const files = walk(APP_DIR, (f) => /\.(tsx|ts)$/.test(f));
  return files
    .filter((f) => !ROUTE_IGNORE.has(basename(f)))
    .map((f) => {
      const rel = relative(APP_DIR, f).replace(/\\/g, "/");
      // Convert `(tabs)/projects.tsx` -> `/projects`,
      //         `projects/[projectId]/index.tsx` -> `/projects/[projectId]`,
      //         `projects/[projectId]/reports/[reportId].tsx`
      //              -> `/projects/[projectId]/reports/[reportId]`.
      let route = rel
        .replace(/\.[tj]sx?$/, "")
        .replace(/\/index$/, "")
        .replace(/\(tabs\)\//g, "")
        .replace(/^\/?/, "/");
      if (route === "/" || route === "") route = "/";
      return { file: rel, route };
    });
}

// 2. Collect all testIDs declared in source.
function collectDeclaredTestIds() {
  const ids = new Map(); // id -> [file]
  const re = /testID\s*=\s*[{]?\s*[`"']([a-zA-Z0-9_:.\-${}]+)[`"']/g;
  for (const root of SRC_DIRS) {
    const files = walk(root, (f) => /\.(tsx|ts)$/.test(f) && !/\.test\./.test(f));
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      let m;
      // Normalize to forward slashes so Windows ('app\foo.tsx') and POSIX
      // ('app/foo.tsx') produce identical map keys. Without this, the
      // route-coverage lookup `fileToIds.get(\`app/${r.file}\`)` always
      // misses on Windows because r.file uses '/' but the map key uses '\'.
      const fileKey = relative(MOBILE_ROOT, file).replace(/\\/g, "/");
      while ((m = re.exec(src)) !== null) {
        // Skip template literals containing ${...} — they are dynamic and
        // the flow side has to know the runtime form already.
        const id = m[1];
        if (id.includes("${")) continue;
        if (!ids.has(id)) ids.set(id, []);
        ids.get(id).push(fileKey);
      }
    }
  }
  return ids;
}

// 3. Concatenate every flow YAML so we can substring-match cheaply.
function collectFlowText() {
  const files = walk(FLOW_DIR, (f) => f.endsWith(".yaml"));
  const map = new Map(); // file -> text
  for (const f of files) map.set(f, readFileSync(f, "utf8"));
  return map;
}

function flowMentions(flowText, needle) {
  for (const text of flowText.values()) {
    if (text.includes(needle)) return true;
  }
  return false;
}

function whichFlowsMention(flowText, needle) {
  const out = [];
  for (const [file, text] of flowText) {
    if (text.includes(needle)) out.push(relative(FLOW_DIR, file));
  }
  return out;
}

// Route coverage: a route is "covered" if (a) any testID declared in its
// file appears in a flow, OR (b) the route's URL path appears in a flow's
// text (`router.push("/usage")` style or visible text in subflows).
function computeRouteCoverage(routes, declaredIds, flowText) {
  // Build file -> testIDs index.
  const fileToIds = new Map();
  for (const [id, files] of declaredIds) {
    for (const f of files) {
      if (!fileToIds.has(f)) fileToIds.set(f, []);
      fileToIds.get(f).push(id);
    }
  }

  const results = [];
  for (const r of routes) {
    const fileRel = `app/${r.file}`;
    const ids = fileToIds.get(fileRel) ?? [];
    const idHit = ids.find((id) => flowMentions(flowText, id));
    const routeHit = r.route.length > 1 && flowMentions(flowText, r.route);
    results.push({
      file: r.file,
      route: r.route,
      covered: Boolean(idHit || routeHit),
      via: idHit ? `testID:${idHit}` : routeHit ? `route:${r.route}` : null,
    });
  }
  return results;
}

function computeTestIdCoverage(declaredIds, flowText) {
  const results = [];
  for (const [id, files] of declaredIds) {
    const flows = whichFlowsMention(flowText, id);
    results.push({
      id,
      declaredIn: files,
      covered: flows.length > 0,
      flows,
    });
  }
  // Stable sort: uncovered first, then alpha.
  results.sort((a, b) => {
    if (a.covered !== b.covered) return a.covered ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
  return results;
}

function pct(n, d) {
  if (d === 0) return 100;
  return (n / d) * 100;
}

function format(report) {
  const lines = [];
  lines.push("=".repeat(70));
  lines.push("Maestro coverage report");
  lines.push("=".repeat(70));
  lines.push("");
  lines.push(
    `Route coverage : ${report.routeCovered}/${report.routeTotal} ` +
      `(${pct(report.routeCovered, report.routeTotal).toFixed(1)}%) ` +
      `[threshold ${ROUTE_THRESHOLD}%]`,
  );
  lines.push(
    `testID coverage: ${report.idCovered}/${report.idTotal} ` +
      `(${pct(report.idCovered, report.idTotal).toFixed(1)}%) ` +
      `[threshold ${TESTID_THRESHOLD}%]`,
  );
  lines.push("");

  const uncoveredRoutes = report.routes.filter((r) => !r.covered);
  if (uncoveredRoutes.length) {
    lines.push(`Uncovered routes (${uncoveredRoutes.length}):`);
    for (const r of uncoveredRoutes) lines.push(`  - ${r.route}  (${r.file})`);
    lines.push("");
  }

  const uncoveredIds = report.testIds.filter((r) => !r.covered);
  if (uncoveredIds.length) {
    lines.push(`Uncovered testIDs (${uncoveredIds.length}):`);
    for (const r of uncoveredIds) {
      lines.push(`  - ${r.id}  (${r.declaredIn[0]})`);
    }
    lines.push("");
  }

  lines.push(
    report.passed
      ? "PASS — both coverage metrics meet their thresholds."
      : "FAIL — see uncovered list above.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
const routes = collectRoutes();
const declaredIds = collectDeclaredTestIds();
const flowText = collectFlowText();

const routeCov = computeRouteCoverage(routes, declaredIds, flowText);
const idCov = computeTestIdCoverage(declaredIds, flowText);

const routeCovered = routeCov.filter((r) => r.covered).length;
const idCovered = idCov.filter((r) => r.covered).length;

const routePct = pct(routeCovered, routeCov.length);
const idPct = pct(idCovered, idCov.length);
const passed = routePct >= ROUTE_THRESHOLD && idPct >= TESTID_THRESHOLD;

const report = {
  routes: routeCov,
  testIds: idCov,
  routeCovered,
  routeTotal: routeCov.length,
  idCovered,
  idTotal: idCov.length,
  routePct,
  idPct,
  thresholds: { route: ROUTE_THRESHOLD, testId: TESTID_THRESHOLD },
  passed,
};

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} else {
  process.stdout.write(format(report) + "\n");
}

process.exit(passed ? 0 : 1);
