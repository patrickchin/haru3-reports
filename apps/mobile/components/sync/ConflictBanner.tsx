/**
 * ConflictBanner — report-level conflict resolution UI (Phase 2 v1).
 *
 * Renders when the report has a stashed conflict snapshot — detected
 * via `getReportConflictDiff`. Offers "Keep mine" / "Use server"
 * buttons and an expandable JSON diff. Returns null otherwise.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useSyncDb } from "@/lib/sync/SyncProvider";
import {
  getReportConflictDiff,
  resolveReportConflict,
  type ReportConflictDiff,
} from "@/lib/sync/conflict-resolver";
import { reportKey, reportsKey } from "@/hooks/useLocalReports";
import type { JsonDiffEntry } from "@/lib/sync/json-diff";
import { colors } from "@/lib/design-tokens/colors";

type ConflictBannerProps = {
  reportId: string;
  projectId: string;
  /**
   * Whether the underlying row is in conflict. The banner self-loads
   * the diff via getReportConflictDiff, but this lets the parent
   * skip rendering (and the loading roundtrip) when there is no
   * conflict to resolve.
   */
  hasConflict: boolean;
};

export function ConflictBanner({
  reportId,
  projectId,
  hasConflict,
}: ConflictBannerProps) {
  const { db, clock, newId } = useSyncDb();
  const queryClient = useQueryClient();
  const [diffData, setDiffData] = useState<ReportConflictDiff | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!hasConflict || !db) {
      setDiffData(null);
      return;
    }
    void getReportConflictDiff(db, reportId).then(setDiffData);
  }, [hasConflict, db, reportId]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: reportKey(reportId) });
    queryClient.invalidateQueries({ queryKey: reportsKey(projectId) });
  }, [queryClient, reportId, projectId]);

  const resolve = useMutation({
    mutationFn: async (choice: "keep_mine" | "use_server") => {
      if (!db) throw new Error("No local DB");
      await resolveReportConflict({ db, clock, newId }, reportId, choice);
    },
    onSuccess: invalidate,
  });

  if (!hasConflict) return null;

  return (
    <View
      className="rounded-lg border border-warning-border bg-warning-soft p-4"
      testID="conflict-banner"
    >
      <View className="flex-row items-center gap-2 mb-2">
        <AlertTriangle size={18} color={colors.warning.text} />
        <Text className="flex-1 text-sm font-semibold text-warning-text">
          This report was modified on the server while you had local changes.
        </Text>
      </View>

      {/* Action buttons */}
      <View className="flex-row gap-3 mb-2">
        <Pressable
          testID="conflict-keep-mine"
          disabled={resolve.isPending}
          onPress={() => resolve.mutate("keep_mine")}
          className="flex-1 items-center rounded-md bg-primary px-3 py-2"
        >
          <Text className="text-sm font-medium text-on-primary">
            Keep mine
          </Text>
        </Pressable>
        <Pressable
          testID="conflict-use-server"
          disabled={resolve.isPending}
          onPress={() => resolve.mutate("use_server")}
          className="flex-1 items-center rounded-md border border-border px-3 py-2"
        >
          <Text className="text-sm font-medium text-foreground">
            Use server
          </Text>
        </Pressable>
      </View>

      {resolve.isError && (
        <Text className="text-xs text-danger-text mb-2">
          Resolution failed: {resolve.error?.message ?? "Unknown error"}
        </Text>
      )}

      {/* Expandable diff */}
      {diffData && diffData.diff.length > 0 && (
        <>
          <Pressable
            testID="conflict-diff-toggle"
            onPress={() => setExpanded((e) => !e)}
            className="flex-row items-center gap-1"
          >
            {expanded ? (
              <ChevronUp size={14} color={colors.warning.text} />
            ) : (
              <ChevronDown size={14} color={colors.warning.text} />
            )}
            <Text className="text-xs text-warning-text">
              {expanded ? "Hide" : "Show"} changes ({diffData.diff.length})
            </Text>
          </Pressable>
          {expanded && (
            <ScrollView className="mt-2 max-h-48">
              {diffData.diff.map((entry, i) => (
                <DiffRow key={`${entry.path}-${i}`} entry={entry} />
              ))}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

function DiffRow({ entry }: { entry: JsonDiffEntry }) {
  const path = entry.path || "$";
  if (entry.kind === "added") {
    return (
      <View className="flex-row gap-2 py-1">
        <Text className="text-xs font-mono text-success-text">+ {path}</Text>
        <Text className="text-xs text-muted flex-1" numberOfLines={1}>
          {stringify(entry.server)}
        </Text>
      </View>
    );
  }
  if (entry.kind === "removed") {
    return (
      <View className="flex-row gap-2 py-1">
        <Text className="text-xs font-mono text-danger-text">- {path}</Text>
        <Text className="text-xs text-muted flex-1" numberOfLines={1}>
          {stringify(entry.local)}
        </Text>
      </View>
    );
  }
  return (
    <View className="py-1">
      <Text className="text-xs font-mono text-warning-text">~ {path}</Text>
      <View className="flex-row gap-2 pl-3">
        <Text className="text-xs text-danger-text flex-1" numberOfLines={1}>
          - {stringify(entry.local)}
        </Text>
      </View>
      <View className="flex-row gap-2 pl-3">
        <Text className="text-xs text-success-text flex-1" numberOfLines={1}>
          + {stringify(entry.server)}
        </Text>
      </View>
    </View>
  );
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
