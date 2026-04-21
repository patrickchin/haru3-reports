// Attach-suggestion logic: given the current report and where the user
// captured a photo in the note stream, pick the best activity/issue target.
//
// Priority (docs/features/report-images.md §5):
//   1. AI-generated photoPlacements[] for this photo id
//   2. Activity/issue that cites the note immediately before the photo
//   3. Last activity in report.activities[]
//   4. No suggestion (top-level)

import type {
  GeneratedReportActivity,
  GeneratedReportIssue,
  GeneratedSiteReport,
} from "./generated-report";

export interface AttachTarget {
  linkedTo: string; // "activity:{index}" | "issue:{index}"
  label: string; // human-readable, e.g. "Foundation Excavation"
}

export interface AttachSuggestion {
  target: AttachTarget | null;
  source: "ai" | "preceding-note" | "last-activity" | "none";
}

/**
 * @param precedingNoteIndex 1-based index into report.notes[] of the note
 *   that immediately precedes the photo, or null if none.
 */
export function suggestAttachTarget(params: {
  report: GeneratedSiteReport | null;
  photoId: string;
  precedingNoteIndex: number | null;
}): AttachSuggestion {
  const { report, photoId, precedingNoteIndex } = params;

  if (!report) return { target: null, source: "none" };

  // 1. AI placement
  const aiPlacement = report.report.photoPlacements.find(
    (p) => p.photoId === photoId,
  );
  if (aiPlacement?.linkedTo) {
    const label = resolveLabel(report, aiPlacement.linkedTo);
    if (label) {
      return {
        target: { linkedTo: aiPlacement.linkedTo, label },
        source: "ai",
      };
    }
  }

  // 2. Preceding-note fallback
  if (precedingNoteIndex != null) {
    const citing = findCitingEntity(report, precedingNoteIndex);
    if (citing) return { target: citing, source: "preceding-note" };
  }

  // 3. Last-activity fallback
  const activities = report.report.activities;
  if (activities.length > 0) {
    const lastIndex = activities.length - 1;
    return {
      target: {
        linkedTo: `activity:${lastIndex}`,
        label: activities[lastIndex].name,
      },
      source: "last-activity",
    };
  }

  return { target: null, source: "none" };
}

function findCitingEntity(
  report: GeneratedSiteReport,
  noteIndex: number,
): AttachTarget | null {
  const { activities, issues } = report.report;

  // Prefer activities (more specific than top-level issues).
  for (let i = 0; i < activities.length; i++) {
    if (activities[i].sourceNoteIndexes.includes(noteIndex)) {
      return { linkedTo: `activity:${i}`, label: activities[i].name };
    }
  }

  // Also check issues nested inside activities.
  for (let ai = 0; ai < activities.length; ai++) {
    const acts = activities[ai];
    for (const issue of acts.issues) {
      if (issue.sourceNoteIndexes.includes(noteIndex)) {
        return { linkedTo: `activity:${ai}`, label: acts.name };
      }
    }
  }

  // Top-level issues.
  for (let i = 0; i < issues.length; i++) {
    if (issues[i].sourceNoteIndexes.includes(noteIndex)) {
      return { linkedTo: `issue:${i}`, label: issues[i].title };
    }
  }

  return null;
}

function resolveLabel(
  report: GeneratedSiteReport,
  linkedTo: string,
): string | null {
  const match = /^(activity|issue):(\d+)$/.exec(linkedTo);
  if (!match) return null;
  const kind = match[1] as "activity" | "issue";
  const idx = Number(match[2]);
  if (!Number.isInteger(idx) || idx < 0) return null;

  if (kind === "activity") {
    const entity: GeneratedReportActivity | undefined =
      report.report.activities[idx];
    return entity ? entity.name : null;
  }
  const issue: GeneratedReportIssue | undefined = report.report.issues[idx];
  return issue ? issue.title : null;
}

/** Build the list of all possible attach targets for the picker. */
export function listAttachTargets(
  report: GeneratedSiteReport | null,
): AttachTarget[] {
  if (!report) return [];
  const targets: AttachTarget[] = [];
  report.report.activities.forEach((a, i) =>
    targets.push({ linkedTo: `activity:${i}`, label: `Activity: ${a.name}` }),
  );
  report.report.issues.forEach((i, idx) =>
    targets.push({ linkedTo: `issue:${idx}`, label: `Issue: ${i.title}` }),
  );
  return targets;
}
