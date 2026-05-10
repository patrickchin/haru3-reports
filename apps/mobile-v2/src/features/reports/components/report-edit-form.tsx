/**
 * Report edit form — schema-driven section rendering via react-hook-form + zod.
 *
 * Target <250 LOC per design doc. Renders a subset of sections (meta, weather,
 * workers, materials, issues). Each section uses the row-array pattern.
 */
import { ScrollView, Text, TextInput, View, Pressable } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import type { GeneratedSiteReport } from "@harpa/report-core";
import { Card } from "@/shared/components/Card";
import { Button } from "@/shared/components/Button";
import { testIds } from "@/infra/test-ids";
import {
  updateMeta,
  updateWeather,
  updateWorkers,
  setRoles,
  setMaterials,
  setIssues,
  blankRole,
  blankMaterial,
  blankIssue,
} from "../report-edit-helpers";

type ReportEditFormProps = {
  report: GeneratedSiteReport;
  onChange: (next: GeneratedSiteReport) => void;
};

const INPUT_CLASS = "rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900";
const LABEL_CLASS = "text-sm font-medium text-gray-600 mb-1";

function nullify(v: string): string | null {
  return v.trim() === "" ? null : v;
}

function nullableString(v: string | null | undefined): string {
  return v ?? "";
}

function parseNumeric(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function numericString(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

export function ReportEditForm({ report, onChange }: ReportEditFormProps) {
  const r = report.report;
  const meta = r.meta;
  const weather = r.weather;
  const workers = r.workers;
  const roles = workers?.roles ?? [];
  const materials = r.materials;
  const issues = r.issues;

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
      {/* Meta */}
      <Card testID={testIds.reports.editSectionMeta}>
        <Text className="text-lg font-semibold mb-4">Project Details</Text>
        <View className="gap-3">
          <View>
            <Text className={LABEL_CLASS}>Title</Text>
            <TextInput
              className={INPUT_CLASS}
              value={meta.title}
              onChangeText={(v) => onChange(updateMeta(report, { title: v }))}
              testID={testIds.reports.editFieldTitle}
            />
          </View>
          <View>
            <Text className={LABEL_CLASS}>Visit Date</Text>
            <TextInput
              className={INPUT_CLASS}
              value={nullableString(meta.visitDate)}
              onChangeText={(v) => onChange(updateMeta(report, { visitDate: nullify(v) }))}
              placeholder="YYYY-MM-DD"
            />
          </View>
          <View>
            <Text className={LABEL_CLASS}>Summary</Text>
            <TextInput
              className={INPUT_CLASS}
              value={meta.summary}
              onChangeText={(v) => onChange(updateMeta(report, { summary: v }))}
              multiline
              numberOfLines={3}
            />
          </View>
        </View>
      </Card>

      {/* Weather */}
      <Card testID={testIds.reports.editSectionWeather}>
        <Text className="text-lg font-semibold mb-4">Weather</Text>
        <View className="gap-3">
          <View>
            <Text className={LABEL_CLASS}>Conditions</Text>
            <TextInput
              className={INPUT_CLASS}
              value={nullableString(weather?.conditions)}
              onChangeText={(v) => onChange(updateWeather(report, { conditions: nullify(v) }))}
            />
          </View>
          <View>
            <Text className={LABEL_CLASS}>Temperature</Text>
            <TextInput
              className={INPUT_CLASS}
              value={nullableString(weather?.temperature)}
              onChangeText={(v) => onChange(updateWeather(report, { temperature: nullify(v) }))}
            />
          </View>
        </View>
      </Card>

      {/* Workers */}
      <Card testID={testIds.reports.editSectionWorkers}>
        <Text className="text-lg font-semibold mb-4">Workers</Text>
        <View className="gap-3 mb-3">
          <View>
            <Text className={LABEL_CLASS}>Total Workers</Text>
            <TextInput
              className={INPUT_CLASS}
              value={numericString(workers?.totalWorkers)}
              onChangeText={(v) => onChange(updateWorkers(report, { totalWorkers: parseNumeric(v) }))}
              keyboardType="numeric"
            />
          </View>
        </View>
        <Text className="text-sm font-medium text-gray-700 mb-2">Roles</Text>
        {roles.map((role, i) => (
          <View key={i} className="gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 mb-2">
            <View>
              <Text className={LABEL_CLASS}>Role</Text>
              <TextInput
                className={INPUT_CLASS}
                value={role.role}
                onChangeText={(v) => {
                  const next = [...roles];
                  next[i] = { ...role, role: v };
                  onChange(setRoles(report, next));
                }}
              />
            </View>
            <View>
              <Text className={LABEL_CLASS}>Count</Text>
              <TextInput
                className={INPUT_CLASS}
                value={numericString(role.count)}
                onChangeText={(v) => {
                  const next = [...roles];
                  next[i] = { ...role, count: parseNumeric(v) };
                  onChange(setRoles(report, next));
                }}
                keyboardType="numeric"
              />
            </View>
            <Pressable
              onPress={() => {
                const next = roles.filter((_, idx) => idx !== i);
                onChange(setRoles(report, next));
              }}
              className="flex-row items-center gap-2"
            >
              <Trash2 size={16} color="#dc2626" />
              <Text className="text-red-600 text-sm">Remove</Text>
            </Pressable>
          </View>
        ))}
        <Button
          variant="secondary"
          onPress={() => onChange(setRoles(report, [...roles, blankRole()]))}
          testID={testIds.reports.addRoleButton}
        >
          <Plus size={16} color="#374151" />
          <Text className="text-gray-700 ml-2">Add Role</Text>
        </Button>
      </Card>

      {/* Materials */}
      <Card testID={testIds.reports.editSectionMaterials}>
        <Text className="text-lg font-semibold mb-4">Materials</Text>
        {materials.map((mat, i) => (
          <View key={i} className="gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 mb-2">
            <View>
              <Text className={LABEL_CLASS}>Name</Text>
              <TextInput
                className={INPUT_CLASS}
                value={mat.name}
                onChangeText={(v) => {
                  const next = [...materials];
                  next[i] = { ...mat, name: v };
                  onChange(setMaterials(report, next));
                }}
              />
            </View>
            <View>
              <Text className={LABEL_CLASS}>Quantity</Text>
              <TextInput
                className={INPUT_CLASS}
                value={nullableString(mat.quantity)}
                onChangeText={(v) => {
                  const next = [...materials];
                  next[i] = { ...mat, quantity: nullify(v) };
                  onChange(setMaterials(report, next));
                }}
              />
            </View>
            <Pressable
              onPress={() => {
                const next = materials.filter((_, idx) => idx !== i);
                onChange(setMaterials(report, next));
              }}
              className="flex-row items-center gap-2"
            >
              <Trash2 size={16} color="#dc2626" />
              <Text className="text-red-600 text-sm">Remove</Text>
            </Pressable>
          </View>
        ))}
        <Button
          variant="secondary"
          onPress={() => onChange(setMaterials(report, [...materials, blankMaterial()]))}
          testID={testIds.reports.addMaterialButton}
        >
          <Plus size={16} color="#374151" />
          <Text className="text-gray-700 ml-2">Add Material</Text>
        </Button>
      </Card>

      {/* Issues */}
      <Card testID={testIds.reports.editSectionIssues}>
        <Text className="text-lg font-semibold mb-4">Issues</Text>
        {issues.map((issue, i) => (
          <View key={i} className="gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 mb-2">
            <View>
              <Text className={LABEL_CLASS}>Title</Text>
              <TextInput
                className={INPUT_CLASS}
                value={issue.title}
                onChangeText={(v) => {
                  const next = [...issues];
                  next[i] = { ...issue, title: v };
                  onChange(setIssues(report, next));
                }}
              />
            </View>
            <View>
              <Text className={LABEL_CLASS}>Details</Text>
              <TextInput
                className={INPUT_CLASS}
                value={issue.details}
                onChangeText={(v) => {
                  const next = [...issues];
                  next[i] = { ...issue, details: v };
                  onChange(setIssues(report, next));
                }}
                multiline
                numberOfLines={2}
              />
            </View>
            <Pressable
              onPress={() => {
                const next = issues.filter((_, idx) => idx !== i);
                onChange(setIssues(report, next));
              }}
              className="flex-row items-center gap-2"
            >
              <Trash2 size={16} color="#dc2626" />
              <Text className="text-red-600 text-sm">Remove</Text>
            </Pressable>
          </View>
        ))}
        <Button
          variant="secondary"
          onPress={() => onChange(setIssues(report, [...issues, blankIssue()]))}
          testID={testIds.reports.addIssueButton}
        >
          <Plus size={16} color="#374151" />
          <Text className="text-gray-700 ml-2">Add Issue</Text>
        </Button>
      </Card>
    </ScrollView>
  );
}
