import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Users, Trash2, Plus } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CardEditButtons } from "@/components/reports/CardEditButtons";
import type {
  GeneratedReportWorkers,
  GeneratedReportRole,
} from "@/lib/generated-report";
import { blankRole } from "@/lib/report-edit-helpers";
import { colors } from "@/lib/design-tokens/colors";

interface WorkersCardProps {
  workers: GeneratedReportWorkers | null;
  editable?: boolean;
  /**
   * Slice patch — parent feeds it through `updateWorkers(report, patch)`.
   */
  onChange?: (patch: Partial<GeneratedReportWorkers> | null) => void;
}

interface WorkersDraft {
  totalWorkers: string;
  workerHours: string;
  notes: string;
  roles: GeneratedReportRole[];
}

const EMPTY_DRAFT: WorkersDraft = {
  totalWorkers: "",
  workerHours: "",
  notes: "",
  roles: [],
};

function toDraft(w: GeneratedReportWorkers | null | undefined): WorkersDraft {
  if (!w) return EMPTY_DRAFT;
  return {
    totalWorkers: w.totalWorkers === null ? "" : String(w.totalWorkers),
    workerHours: w.workerHours ?? "",
    notes: w.notes ?? "",
    roles: w.roles.map((r) => ({ ...r })),
  };
}

function trimOrNull(v: string): string | null {
  return v.trim() === "" ? null : v;
}

function parseIntOrNull(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

export function WorkersCard({ workers, editable = false, onChange }: WorkersCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<WorkersDraft>(() => toDraft(workers));

  useEffect(() => {
    if (!isEditing) setDraft(toDraft(workers));
  }, [workers, isEditing]);

  if (!workers && !editable) return null;

  const safe: GeneratedReportWorkers = workers ?? {
    totalWorkers: null,
    workerHours: null,
    notes: null,
    roles: [],
  };
  const roles = safe.roles;
  const hasRoles = roles.length > 0;
  const maxCount = Math.max(...roles.map((r) => r.count ?? 0), 1);

  const subtitle =
    safe.totalWorkers !== null ? `${safe.totalWorkers} on site.` : "Crew breakdown recorded.";

  const handleEdit = () => {
    setDraft(toDraft(workers));
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraft(toDraft(workers));
    setIsEditing(false);
  };

  const handleSave = () => {
    const patch: Partial<GeneratedReportWorkers> = {
      totalWorkers: parseIntOrNull(draft.totalWorkers),
      workerHours: trimOrNull(draft.workerHours),
      notes: trimOrNull(draft.notes),
      roles: draft.roles.map((r) => ({ ...r })),
    };
    onChange?.(patch);
    setIsEditing(false);
  };

  const updateRole = (index: number, patch: Partial<GeneratedReportRole>) => {
    setDraft((d) => ({
      ...d,
      roles: d.roles.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));
  };

  const addRole = () => {
    setDraft((d) => ({ ...d, roles: [...d.roles, blankRole()] }));
  };

  const removeRole = (index: number) => {
    setDraft((d) => ({ ...d, roles: d.roles.filter((_, i) => i !== index) }));
  };

  const trailing = editable ? (
    <CardEditButtons
      testID="workers"
      isEditing={isEditing}
      onEdit={handleEdit}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  ) : undefined;

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Workers"
        subtitle={subtitle}
        icon={<Users size={16} color={colors.foreground} />}
        trailing={trailing}
      />

      {isEditing ? (
        <>
          <View className="mt-4 gap-2">
            <View className="flex-row items-center gap-2">
              <Text className="text-base text-muted-foreground">Total workers:</Text>
              <TextInput
                testID="workers-total-input"
                value={draft.totalWorkers}
                onChangeText={(next) =>
                  setDraft((d) => ({ ...d, totalWorkers: next }))
                }
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor={colors.muted.foreground}
                className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-base text-foreground"
              />
            </View>
          </View>

          <View className="mt-4 gap-3">
            {draft.roles.map((role, index) => (
              <View
                key={`role-${index}`}
                className="gap-1.5 rounded-md bg-surface-muted px-3 py-3"
              >
                <View className="flex-row items-center justify-between gap-2">
                  <TextInput
                    testID={`workers-role-${index}-name-input`}
                    value={role.role}
                    onChangeText={(next) => updateRole(index, { role: next })}
                    placeholder="Role"
                    placeholderTextColor={colors.muted.foreground}
                    className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-base text-foreground"
                  />
                  <TextInput
                    testID={`workers-role-${index}-count-input`}
                    value={role.count === null ? "" : String(role.count)}
                    onChangeText={(next) =>
                      updateRole(index, { count: parseIntOrNull(next) })
                    }
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.muted.foreground}
                    className="w-16 rounded-md border border-border bg-card px-2 py-1 text-base text-foreground"
                  />
                  <Pressable
                    testID={`workers-role-${index}-trash`}
                    onPress={() => removeRole(index)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove role"
                    hitSlop={8}
                  >
                    <Trash2 size={16} color={colors.muted.foreground} />
                  </Pressable>
                </View>
              </View>
            ))}

            <Pressable
              testID="workers-add-role"
              onPress={addRole}
              accessibilityRole="button"
              accessibilityLabel="Add role"
              className="flex-row items-center gap-2 self-start rounded-md border border-border px-3 py-2"
            >
              <Plus size={14} color={colors.foreground} />
              <Text className="text-sm text-foreground">Add role</Text>
            </Pressable>
          </View>

          <View className="mt-4 gap-2">
            <View className="flex-row items-center gap-2">
              <Text className="text-base text-muted-foreground">Hours:</Text>
              <TextInput
                testID="workers-hours-input"
                value={draft.workerHours}
                onChangeText={(next) =>
                  setDraft((d) => ({ ...d, workerHours: next }))
                }
                placeholder="08:00–17:00"
                placeholderTextColor={colors.muted.foreground}
                className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-base text-foreground"
              />
            </View>
            <TextInput
              testID="workers-notes-input"
              value={draft.notes}
              onChangeText={(next) => setDraft((d) => ({ ...d, notes: next }))}
              multiline
              placeholder="Notes"
              placeholderTextColor={colors.muted.foreground}
              className="rounded-md border border-border bg-card px-2 py-1 text-base text-muted-foreground"
            />
          </View>
        </>
      ) : (
        <>
          {hasRoles && (
            <View className="mt-4 gap-3">
              {roles.map((role, index) => {
                const count = role.count ?? 0;
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <View
                    key={`role-${index}`}
                    className="gap-1.5 rounded-md bg-surface-muted px-3 py-3"
                  >
                    <View className="flex-row items-center justify-between gap-2">
                      <View className="flex-1">
                        <Text className="text-base text-foreground">{role.role}</Text>
                      </View>
                      <Text className="text-base font-medium text-muted-foreground">
                        {count}
                      </Text>
                    </View>
                    <View className="h-2 overflow-hidden rounded-full bg-secondary">
                      <View
                        className="h-2 rounded-full bg-foreground"
                        style={{ width: `${pct}%` }}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {safe.workerHours ? (
            <Text className="mt-4 text-base text-muted-foreground">
              Hours: {safe.workerHours}
            </Text>
          ) : null}
          {safe.notes ? (
            <Text className="mt-2 text-base text-muted-foreground">{safe.notes}</Text>
          ) : null}
        </>
      )}
    </Card>
  );
}
