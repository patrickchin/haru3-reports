/**
 * Read-only report view — renders report sections for viewing.
 */
import { ScrollView, Text, View } from "react-native";
import type { GeneratedSiteReport } from "@harpa/report-core";
import { Card } from "@/shared/components/Card";

type ReportViewProps = {
  report: GeneratedSiteReport;
};

export function ReportView({ report }: ReportViewProps) {
  const r = report.report;
  const meta = r.meta;
  const weather = r.weather;
  const workers = r.workers;
  const materials = r.materials;
  const issues = r.issues;
  const sections = r.sections;

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
      {/* Meta */}
      <Card>
        <Text className="text-xl font-bold mb-2">{meta.title || "Untitled Report"}</Text>
        {meta.visitDate && <Text className="text-sm text-gray-600 mb-2">Date: {meta.visitDate}</Text>}
        {meta.summary && <Text className="text-base text-gray-700">{meta.summary}</Text>}
      </Card>

      {/* Weather */}
      {weather && (
        <Card>
          <Text className="text-lg font-semibold mb-2">Weather</Text>
          {weather.conditions && <Text className="text-sm text-gray-700">Conditions: {weather.conditions}</Text>}
          {weather.temperature && <Text className="text-sm text-gray-700">Temperature: {weather.temperature}</Text>}
          {weather.impact && <Text className="text-sm text-gray-700">Impact: {weather.impact}</Text>}
        </Card>
      )}

      {/* Workers */}
      {workers && (
        <Card>
          <Text className="text-lg font-semibold mb-2">Workers</Text>
          {workers.totalWorkers != null && (
            <Text className="text-sm text-gray-700 mb-2">Total: {workers.totalWorkers}</Text>
          )}
          {workers.roles.length > 0 && (
            <View className="gap-2 mt-2">
              <Text className="text-sm font-medium text-gray-600">Roles:</Text>
              {workers.roles.map((role, i) => (
                <Text key={i} className="text-sm text-gray-700">
                  • {role.role} {role.count != null ? `(${role.count})` : ""}
                </Text>
              ))}
            </View>
          )}
        </Card>
      )}

      {/* Materials */}
      {materials.length > 0 && (
        <Card>
          <Text className="text-lg font-semibold mb-2">Materials</Text>
          {materials.map((mat, i) => (
            <Text key={i} className="text-sm text-gray-700">
              • {mat.name} {mat.quantity ? `(${mat.quantity})` : ""}
            </Text>
          ))}
        </Card>
      )}

      {/* Issues */}
      {issues.length > 0 && (
        <Card>
          <Text className="text-lg font-semibold mb-2">Issues</Text>
          {issues.map((issue, i) => (
            <View key={i} className="mb-3">
              <Text className="text-base font-medium text-gray-900">{issue.title}</Text>
              <Text className="text-sm text-gray-600">
                {issue.category} • {issue.severity} • {issue.status}
              </Text>
              {issue.details && <Text className="text-sm text-gray-700 mt-1">{issue.details}</Text>}
            </View>
          ))}
        </Card>
      )}

      {/* Sections */}
      {sections.length > 0 && (
        <>
          {sections.map((section, i) => (
            <Card key={i}>
              <Text className="text-lg font-semibold mb-2">{section.title}</Text>
              <Text className="text-sm text-gray-700">{section.content}</Text>
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}
