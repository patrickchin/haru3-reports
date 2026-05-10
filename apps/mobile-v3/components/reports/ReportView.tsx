import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import {
  AlertTriangle,
  ArrowRight,
  Cloud,
  HardHat,
  LayoutList,
  Package,
} from 'lucide-react-native';

import { SectionCard } from './sections/SectionCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportData {
  title: string;
  type: string;
  visitDate?: string;
  summary?: string;
  weather?: {
    conditions?: string;
    temperature?: string;
    wind?: string;
    impact?: string;
  };
  workers?: {
    totalOnSite?: number;
    hoursWorked?: number;
    notes?: string;
    roles?: Array<{ role: string; count: number; notes?: string }>;
  };
  materials?: Array<{
    name: string;
    quantity?: string;
    unit?: string;
    condition?: string;
    status?: string;
    notes?: string;
  }>;
  issues?: Array<{
    title: string;
    category?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    status?: string;
    details?: string;
    actionRequired?: string;
  }>;
  nextSteps?: string[];
  sections?: Array<{ title: string; content: string }>;
}

export interface ReportViewProps {
  data: ReportData | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityColor(severity?: string): string {
  switch (severity) {
    case 'critical':
      return '#b91c1c';
    case 'high':
      return '#ea580c';
    case 'medium':
      return '#b66916';
    case 'low':
      return '#2f6f48';
    default:
      return '#5f5b66';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportView({ data }: ReportViewProps) {
  const { styles, theme } = useStyles(stylesheet);

  if (!data) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No report data generated yet.</Text>
      </View>
    );
  }

  const hasWeather =
    data.weather &&
    (data.weather.conditions || data.weather.temperature || data.weather.wind || data.weather.impact);
  const hasWorkers =
    data.workers &&
    (data.workers.totalOnSite != null ||
      data.workers.hoursWorked != null ||
      data.workers.notes ||
      (data.workers.roles && data.workers.roles.length > 0));
  const hasMaterials = data.materials && data.materials.length > 0;
  const hasIssues = data.issues && data.issues.length > 0;
  const hasNextSteps = data.nextSteps && data.nextSteps.length > 0;
  const hasCustomSections = data.sections && data.sections.length > 0;

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Summary */}
      {data.summary ? (
        <SectionCard title="Summary" icon={<LayoutList size={18} color={theme.colors.info} />}>
          <Text style={styles.bodyText}>{data.summary}</Text>
        </SectionCard>
      ) : null}

      {/* Weather */}
      {hasWeather ? (
        <SectionCard title="Weather" icon={<Cloud size={18} color={theme.colors.info} />}>
          <View style={styles.kvGrid}>
            {data.weather!.conditions ? (
              <KVRow label="Conditions" value={data.weather!.conditions} />
            ) : null}
            {data.weather!.temperature ? (
              <KVRow label="Temperature" value={data.weather!.temperature} />
            ) : null}
            {data.weather!.wind ? <KVRow label="Wind" value={data.weather!.wind} /> : null}
            {data.weather!.impact ? <KVRow label="Impact" value={data.weather!.impact} /> : null}
          </View>
        </SectionCard>
      ) : null}

      {/* Workers */}
      {hasWorkers ? (
        <SectionCard title="Workers" icon={<HardHat size={18} color={theme.colors.warning} />}>
          <View style={styles.kvGrid}>
            {data.workers!.totalOnSite != null ? (
              <KVRow label="On-site" value={String(data.workers!.totalOnSite)} />
            ) : null}
            {data.workers!.hoursWorked != null ? (
              <KVRow label="Hours" value={String(data.workers!.hoursWorked)} />
            ) : null}
          </View>
          {data.workers!.roles && data.workers!.roles.length > 0 ? (
            <View style={styles.rolesList}>
              {data.workers!.roles.map((r, i) => (
                <View key={i} style={styles.roleRow}>
                  <Text style={styles.roleLabel}>{r.role}</Text>
                  <Text style={styles.roleCount}>{r.count}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {data.workers!.notes ? (
            <Text style={[styles.bodyText, { marginTop: 8 }]}>{data.workers!.notes}</Text>
          ) : null}
        </SectionCard>
      ) : null}

      {/* Materials */}
      {hasMaterials ? (
        <SectionCard title="Materials" icon={<Package size={18} color={theme.colors.success} />}>
          {data.materials!.map((m, i) => (
            <View key={i} style={styles.materialRow}>
              <Text style={styles.materialName}>{m.name}</Text>
              {m.quantity ? (
                <Text style={styles.materialMeta}>
                  {m.quantity}
                  {m.unit ? ` ${m.unit}` : ''}
                </Text>
              ) : null}
              {m.status ? <Text style={styles.materialMeta}>{m.status}</Text> : null}
              {m.notes ? <Text style={styles.materialNotes}>{m.notes}</Text> : null}
            </View>
          ))}
        </SectionCard>
      ) : null}

      {/* Issues */}
      {hasIssues ? (
        <SectionCard
          title="Issues"
          icon={<AlertTriangle size={18} color={theme.colors.danger} />}
        >
          {data.issues!.map((issue, i) => (
            <View key={i} style={styles.issueRow}>
              <View style={styles.issueHeader}>
                <Text style={styles.issueTitle}>{issue.title}</Text>
                {issue.severity ? (
                  <View
                    style={[
                      styles.severityBadge,
                      { backgroundColor: severityColor(issue.severity) + '20' },
                    ]}
                  >
                    <Text
                      style={[styles.severityText, { color: severityColor(issue.severity) }]}
                    >
                      {issue.severity}
                    </Text>
                  </View>
                ) : null}
              </View>
              {issue.details ? <Text style={styles.bodyText}>{issue.details}</Text> : null}
              {issue.actionRequired ? (
                <Text style={styles.actionText}>Action: {issue.actionRequired}</Text>
              ) : null}
            </View>
          ))}
        </SectionCard>
      ) : null}

      {/* Next Steps */}
      {hasNextSteps ? (
        <SectionCard title="Next Steps" icon={<ArrowRight size={18} color={theme.colors.info} />}>
          {data.nextSteps!.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <Text style={styles.stepBullet}>•</Text>
              <Text style={styles.bodyText}>{step}</Text>
            </View>
          ))}
        </SectionCard>
      ) : null}

      {/* Custom Sections */}
      {hasCustomSections
        ? data.sections!.map((section, i) => (
            <SectionCard key={i} title={section.title}>
              <Text style={styles.bodyText}>{section.content}</Text>
            </SectionCard>
          ))
        : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// KV helper
// ---------------------------------------------------------------------------

function KVRow({ label, value }: { label: string; value: string }) {
  const { styles } = useStyles(stylesheet);
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const stylesheet = createStyleSheet((theme) => ({
  scroll: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing['2xl'],
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
  },
  bodyText: {
    ...theme.typography.bodySmall,
    color: theme.colors.cardForeground,
    lineHeight: 22,
  },
  kvGrid: {
    gap: theme.spacing.xs,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kvLabel: {
    ...theme.typography.bodySmall,
    color: theme.colors.mutedForeground,
  },
  kvValue: {
    ...theme.typography.bodySmall,
    color: theme.colors.cardForeground,
    fontWeight: '500',
  },
  rolesList: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  roleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  roleLabel: {
    ...theme.typography.bodySmall,
    color: theme.colors.cardForeground,
  },
  roleCount: {
    ...theme.typography.bodySmall,
    color: theme.colors.mutedForeground,
    fontWeight: '600',
  },
  materialRow: {
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 2,
  },
  materialName: {
    ...theme.typography.bodySmall,
    color: theme.colors.cardForeground,
    fontWeight: '500',
  },
  materialMeta: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },
  materialNotes: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
    fontStyle: 'italic',
  },
  issueRow: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 4,
  },
  issueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  issueTitle: {
    ...theme.typography.bodySmall,
    color: theme.colors.cardForeground,
    fontWeight: '600',
    flex: 1,
  },
  severityBadge: {
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  severityText: {
    ...theme.typography.caption,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  actionText: {
    ...theme.typography.caption,
    color: theme.colors.warning,
    fontWeight: '500',
  },
  stepRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingVertical: 2,
  },
  stepBullet: {
    ...theme.typography.bodySmall,
    color: theme.colors.mutedForeground,
  },
}));
