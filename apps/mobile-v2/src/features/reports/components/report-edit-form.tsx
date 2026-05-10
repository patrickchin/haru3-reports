/**
 * Report edit form — schema-driven section rendering via react-hook-form + zod.
 *
 * Target <250 LOC per design doc. Renders a subset of sections (meta, weather,
 * workers, materials, issues). Each section uses the row-array pattern.
 */
import { ScrollView, Text, View } from "react-native";
import type { GeneratedSiteReport } from "@harpa/report-core";
import { Card } from "@/shared/components/Card";
import { ArrayEditor, LabeledInput } from "@/components/array-editor";
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
          <LabeledInput
            label="Title"
            value={meta.title}
            onChangeText={(v) => onChange(updateMeta(report, { title: v }))}
            testID={testIds.reports.editFieldTitle}
          />
          <LabeledInput
            label="Visit Date"
            value={nullableString(meta.visitDate)}
            onChangeText={(v) => onChange(updateMeta(report, { visitDate: nullify(v) }))}
            placeholder="YYYY-MM-DD"
          />
          <LabeledInput
            label="Summary"
            value={meta.summary}
            onChangeText={(v) => onChange(updateMeta(report, { summary: v }))}
            multiline
            numberOfLines={3}
          />
        </View>
      </Card>

      {/* Weather */}
      <Card testID={testIds.reports.editSectionWeather}>
        <Text className="text-lg font-semibold mb-4">Weather</Text>
        <View className="gap-3">
          <LabeledInput
            label="Conditions"
            value={nullableString(weather?.conditions)}
            onChangeText={(v) => onChange(updateWeather(report, { conditions: nullify(v) }))}
          />
          <LabeledInput
            label="Temperature"
            value={nullableString(weather?.temperature)}
            onChangeText={(v) => onChange(updateWeather(report, { temperature: nullify(v) }))}
          />
        </View>
      </Card>

      {/* Workers */}
      <Card testID={testIds.reports.editSectionWorkers}>
        <Text className="text-lg font-semibold mb-4">Workers</Text>
        <View className="gap-3 mb-3">
          <LabeledInput
            label="Total Workers"
            value={numericString(workers?.totalWorkers)}
            onChangeText={(v) => onChange(updateWorkers(report, { totalWorkers: parseNumeric(v) }))}
            keyboardType="numeric"
          />
        </View>
        <Text className="text-sm font-medium text-gray-700 mb-2">Roles</Text>
        <ArrayEditor
          items={roles}
          onChange={(next) => onChange(setRoles(report, next))}
          blankItem={blankRole}
          addButtonLabel="Add Role"
          addButtonTestID={testIds.reports.addRoleButton}
          renderItem={(role, updateItem) => (
            <>
              <LabeledInput
                label="Role"
                value={role.role}
                onChangeText={(v) => updateItem({ ...role, role: v })}
              />
              <LabeledInput
                label="Count"
                value={numericString(role.count)}
                onChangeText={(v) => updateItem({ ...role, count: parseNumeric(v) })}
                keyboardType="numeric"
              />
            </>
          )}
        />
      </Card>

      {/* Materials */}
      <Card testID={testIds.reports.editSectionMaterials}>
        <Text className="text-lg font-semibold mb-4">Materials</Text>
        <ArrayEditor
          items={materials}
          onChange={(next) => onChange(setMaterials(report, next))}
          blankItem={blankMaterial}
          addButtonLabel="Add Material"
          addButtonTestID={testIds.reports.addMaterialButton}
          renderItem={(mat, updateItem) => (
            <>
              <LabeledInput
                label="Name"
                value={mat.name}
                onChangeText={(v) => updateItem({ ...mat, name: v })}
              />
              <LabeledInput
                label="Quantity"
                value={nullableString(mat.quantity)}
                onChangeText={(v) => updateItem({ ...mat, quantity: nullify(v) })}
              />
            </>
          )}
        />
      </Card>

      {/* Issues */}
      <Card testID={testIds.reports.editSectionIssues}>
        <Text className="text-lg font-semibold mb-4">Issues</Text>
        <ArrayEditor
          items={issues}
          onChange={(next) => onChange(setIssues(report, next))}
          blankItem={blankIssue}
          addButtonLabel="Add Issue"
          addButtonTestID={testIds.reports.addIssueButton}
          renderItem={(issue, updateItem) => (
            <>
              <LabeledInput
                label="Title"
                value={issue.title}
                onChangeText={(v) => updateItem({ ...issue, title: v })}
              />
              <LabeledInput
                label="Details"
                value={issue.details}
                onChangeText={(v) => updateItem({ ...issue, details: v })}
                multiline
                numberOfLines={2}
              />
            </>
          )}
        />
      </Card>
    </ScrollView>
  );
}
