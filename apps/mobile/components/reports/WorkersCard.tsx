import { View, Text, Pressable } from "react-native";
import { Users, Trash2, Plus } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EditableField } from "@/components/reports/EditableField";
import type { GeneratedReportWorkers } from "@/lib/generated-report";
import { blankRole } from "@/lib/report-edit-helpers";
import { colors } from "@/lib/design-tokens/colors";

interface WorkersCardProps {
  workers: GeneratedReportWorkers | null;
  editable?: boolean;
  /**
   * Slice patch — parent feeds it through `updateWorkers(report, patch)`.
   * `null` clears the slice entirely.
   */
  onChange?: (patch: Partial<GeneratedReportWorkers> | null) => void;
}

export function WorkersCard({ workers, editable = false, onChange }: WorkersCardProps) {
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

  const handleAddRole = () => {
    onChange?.({ roles: [...roles, blankRole()] });
  };

  const handleRemoveRole = (index: number) => {
    onChange?.({ roles: roles.filter((_, i) => i !== index) });
  };

  const handleRoleNameChange = (index: number, next: string) => {
    onChange?.({
      roles: roles.map((r, i) => (i === index ? { ...r, role: next } : r)),
    });
  };

  const handleRoleCountChange = (index: number, next: string) => {
    const trimmed = next.trim();
    const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);
    onChange?.({
      roles: roles.map((r, i) =>
        i === index
          ? { ...r, count: Number.isFinite(parsed) ? (parsed as number) : null }
          : r,
      ),
    });
  };

  const handleTotalChange = (next: string) => {
    const trimmed = next.trim();
    const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);
    onChange?.({ totalWorkers: Number.isFinite(parsed) ? (parsed as number) : null });
  };

  const handleHoursChange = (next: string) => {
    onChange?.({ workerHours: next.trim() === "" ? null : next });
  };

  const handleNotesChange = (next: string) => {
    onChange?.({ notes: next.trim() === "" ? null : next });
  };

  const subtitle =
    safe.totalWorkers !== null ? `${safe.totalWorkers} on site.` : "Crew breakdown recorded.";

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Workers"
        subtitle={subtitle}
        icon={<Users size={16} color={colors.foreground} />}
      />

      {editable && (
        <View className="mt-4 gap-2">
          <View className="flex-row items-center gap-2">
            <Text className="text-base text-muted-foreground">Total workers:</Text>
            <EditableField
              value={safe.totalWorkers === null ? "" : String(safe.totalWorkers)}
              onChange={handleTotalChange}
              editable
              numeric
              emptyDisplay="—"
              placeholder="0"
              testID="workers-total"
            />
          </View>
        </View>
      )}

      {(hasRoles || editable) && (
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
                    {editable ? (
                      <EditableField
                        value={role.role}
                        onChange={(next) => handleRoleNameChange(index, next)}
                        editable
                        emptyDisplay="—"
                        placeholder="Role"
                        textClassName="text-base text-foreground"
                        testID={`workers-role-${index}-name`}
                      />
                    ) : (
                      <Text className="text-base text-foreground">{role.role}</Text>
                    )}
                  </View>
                  <View className="flex-row items-center gap-2">
                    {editable ? (
                      <EditableField
                        value={role.count === null ? "" : String(role.count)}
                        onChange={(next) => handleRoleCountChange(index, next)}
                        editable
                        numeric
                        emptyDisplay="0"
                        placeholder="0"
                        textClassName="text-base font-medium text-muted-foreground"
                        testID={`workers-role-${index}-count`}
                      />
                    ) : (
                      <Text className="text-base font-medium text-muted-foreground">
                        {count}
                      </Text>
                    )}
                    {editable && (
                      <Pressable
                        testID={`workers-role-${index}-trash`}
                        onPress={() => handleRemoveRole(index)}
                        accessibilityRole="button"
                        accessibilityLabel="Remove role"
                        hitSlop={8}
                      >
                        <Trash2 size={16} color={colors.muted.foreground} />
                      </Pressable>
                    )}
                  </View>
                </View>
                {!editable && (
                  <View className="h-2 overflow-hidden rounded-full bg-secondary">
                    <View
                      className="h-2 rounded-full bg-foreground"
                      style={{ width: `${pct}%` }}
                    />
                  </View>
                )}
              </View>
            );
          })}

          {editable && (
            <Pressable
              testID="workers-add-role"
              onPress={handleAddRole}
              accessibilityRole="button"
              accessibilityLabel="Add role"
              className="flex-row items-center gap-2 self-start rounded-md border border-border px-3 py-2"
            >
              <Plus size={14} color={colors.foreground} />
              <Text className="text-sm text-foreground">Add role</Text>
            </Pressable>
          )}
        </View>
      )}

      {editable ? (
        <View className="mt-4 gap-2">
          <View className="flex-row items-center gap-2">
            <Text className="text-base text-muted-foreground">Hours:</Text>
            <EditableField
              value={safe.workerHours ?? ""}
              onChange={handleHoursChange}
              editable
              emptyDisplay="—"
              placeholder="Worker hours"
              textClassName="text-base text-muted-foreground"
              testID="workers-hours"
            />
          </View>
          <EditableField
            value={safe.notes ?? ""}
            onChange={handleNotesChange}
            editable
            multiline
            emptyDisplay="Add notes"
            placeholder="Notes"
            textClassName="text-base text-muted-foreground"
            testID="workers-notes"
          />
        </View>
      ) : (
        <>
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
