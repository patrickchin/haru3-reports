import React, { useCallback } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Plus, Trash2 } from 'lucide-react-native';

import { Input } from '@/components/ui';

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

export interface ReportEditFormProps {
  data: ReportData;
  onChange: (data: ReportData) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SectionTitle({ title }: { title: string }) {
  const { styles } = useStyles(stylesheet);
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { styles, theme } = useStyles(stylesheet);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
    >
      <Plus size={16} color={theme.colors.mutedForeground} />
      <Text style={styles.addBtnText}>{label}</Text>
    </Pressable>
  );
}

function RemoveButton({ onPress }: { onPress: () => void }) {
  const { styles, theme } = useStyles(stylesheet);
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.removeBtn}>
      <Trash2 size={16} color={theme.colors.danger} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportEditForm({ data, onChange }: ReportEditFormProps) {
  const { styles } = useStyles(stylesheet);

  // -- Meta updaters --------------------------------------------------------

  const updateField = useCallback(
    <K extends keyof ReportData>(key: K, value: ReportData[K]) => {
      onChange({ ...data, [key]: value });
    },
    [data, onChange],
  );

  // -- Weather updaters -----------------------------------------------------

  const weather = data.weather ?? {};
  const setWeather = useCallback(
    (field: string, value: string) => {
      onChange({ ...data, weather: { ...weather, [field]: value } });
    },
    [data, weather, onChange],
  );

  // -- Workers updaters -----------------------------------------------------

  const workers = data.workers ?? {};
  const setWorkerField = useCallback(
    (field: string, value: string | number) => {
      onChange({ ...data, workers: { ...workers, [field]: value } });
    },
    [data, workers, onChange],
  );

  const roles = workers.roles ?? [];
  const addRole = useCallback(() => {
    onChange({
      ...data,
      workers: { ...workers, roles: [...roles, { role: '', count: 0 }] },
    });
  }, [data, workers, roles, onChange]);

  const updateRole = useCallback(
    (index: number, field: string, value: string | number) => {
      const updated = roles.map((r, i) => (i === index ? { ...r, [field]: value } : r));
      onChange({ ...data, workers: { ...workers, roles: updated } });
    },
    [data, workers, roles, onChange],
  );

  const removeRole = useCallback(
    (index: number) => {
      const updated = roles.filter((_, i) => i !== index);
      onChange({ ...data, workers: { ...workers, roles: updated } });
    },
    [data, workers, roles, onChange],
  );

  // -- Materials updaters ---------------------------------------------------

  const materials = data.materials ?? [];
  const addMaterial = useCallback(() => {
    onChange({ ...data, materials: [...materials, { name: '' }] });
  }, [data, materials, onChange]);

  const updateMaterial = useCallback(
    (index: number, field: string, value: string) => {
      const updated = materials.map((m, i) => (i === index ? { ...m, [field]: value } : m));
      onChange({ ...data, materials: updated });
    },
    [data, materials, onChange],
  );

  const removeMaterial = useCallback(
    (index: number) => {
      onChange({ ...data, materials: materials.filter((_, i) => i !== index) });
    },
    [data, materials, onChange],
  );

  // -- Issues updaters ------------------------------------------------------

  const issues = data.issues ?? [];
  const addIssue = useCallback(() => {
    onChange({ ...data, issues: [...issues, { title: '' }] });
  }, [data, issues, onChange]);

  const updateIssue = useCallback(
    (index: number, field: string, value: string) => {
      const updated = issues.map((iss, i) => (i === index ? { ...iss, [field]: value } : iss));
      onChange({ ...data, issues: updated });
    },
    [data, issues, onChange],
  );

  const removeIssue = useCallback(
    (index: number) => {
      onChange({ ...data, issues: issues.filter((_, i) => i !== index) });
    },
    [data, issues, onChange],
  );

  // -- Next Steps updaters --------------------------------------------------

  const nextSteps = data.nextSteps ?? [];
  const addStep = useCallback(() => {
    onChange({ ...data, nextSteps: [...nextSteps, ''] });
  }, [data, nextSteps, onChange]);

  const updateStep = useCallback(
    (index: number, value: string) => {
      const updated = nextSteps.map((s, i) => (i === index ? value : s));
      onChange({ ...data, nextSteps: updated });
    },
    [data, nextSteps, onChange],
  );

  const removeStep = useCallback(
    (index: number) => {
      onChange({ ...data, nextSteps: nextSteps.filter((_, i) => i !== index) });
    },
    [data, nextSteps, onChange],
  );

  // -- Custom Sections updaters ---------------------------------------------

  const customSections = data.sections ?? [];
  const addSection = useCallback(() => {
    onChange({ ...data, sections: [...customSections, { title: '', content: '' }] });
  }, [data, customSections, onChange]);

  const updateSection = useCallback(
    (index: number, field: 'title' | 'content', value: string) => {
      const updated = customSections.map((s, i) =>
        i === index ? { ...s, [field]: value } : s,
      );
      onChange({ ...data, sections: updated });
    },
    [data, customSections, onChange],
  );

  const removeSection = useCallback(
    (index: number) => {
      onChange({ ...data, sections: customSections.filter((_, i) => i !== index) });
    },
    [data, customSections, onChange],
  );

  // -- Render ---------------------------------------------------------------

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Meta */}
      <View testID="edit-section-meta" style={styles.section}>
        <SectionTitle title="General" />
        <Input
          label="Title"
          value={data.title}
          onChangeText={(v) => updateField('title', v)}
          placeholder="Report title"
        />
        <Input
          label="Type"
          value={data.type}
          onChangeText={(v) => updateField('type', v)}
          placeholder="daily / weekly / custom"
        />
        <Input
          label="Visit date"
          value={data.visitDate ?? ''}
          onChangeText={(v) => updateField('visitDate', v)}
          placeholder="YYYY-MM-DD"
        />
        <Input
          label="Summary"
          value={data.summary ?? ''}
          onChangeText={(v) => updateField('summary', v)}
          placeholder="Brief summary"
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Weather */}
      <View testID="edit-section-weather" style={styles.section}>
        <SectionTitle title="Weather" />
        <Input
          label="Conditions"
          value={weather.conditions ?? ''}
          onChangeText={(v) => setWeather('conditions', v)}
          placeholder="e.g. Sunny, Rainy"
        />
        <Input
          label="Temperature"
          value={weather.temperature ?? ''}
          onChangeText={(v) => setWeather('temperature', v)}
          placeholder="e.g. 25°C"
        />
        <Input
          label="Wind"
          value={weather.wind ?? ''}
          onChangeText={(v) => setWeather('wind', v)}
          placeholder="e.g. Light NW"
        />
        <Input
          label="Impact"
          value={weather.impact ?? ''}
          onChangeText={(v) => setWeather('impact', v)}
          placeholder="Any impact on work"
        />
      </View>

      {/* Workers */}
      <View testID="edit-section-workers" style={styles.section}>
        <SectionTitle title="Workers" />
        <Input
          label="Total on site"
          value={workers.totalOnSite != null ? String(workers.totalOnSite) : ''}
          onChangeText={(v) => setWorkerField('totalOnSite', v === '' ? 0 : Number(v))}
          placeholder="0"
          keyboardType="numeric"
        />
        <Input
          label="Hours worked"
          value={workers.hoursWorked != null ? String(workers.hoursWorked) : ''}
          onChangeText={(v) => setWorkerField('hoursWorked', v === '' ? 0 : Number(v))}
          placeholder="0"
          keyboardType="numeric"
        />
        <Input
          label="Notes"
          value={workers.notes ?? ''}
          onChangeText={(v) => setWorkerField('notes', v)}
          placeholder="Worker notes"
          multiline
        />

        <Text style={styles.subLabel}>Roles</Text>
        {roles.map((role, i) => (
          <View key={i} testID={`role-row-${i}`} style={styles.dynamicRow}>
            <View style={styles.row}>
              <Input
                value={role.role}
                onChangeText={(v) => updateRole(i, 'role', v)}
                placeholder="Role name"
                containerStyle={styles.flex1}
              />
              <Input
                value={String(role.count)}
                onChangeText={(v) => updateRole(i, 'count', v === '' ? 0 : Number(v))}
                placeholder="#"
                keyboardType="numeric"
                containerStyle={styles.countInput}
              />
            </View>
            <RemoveButton onPress={() => removeRole(i)} />
          </View>
        ))}
        <AddButton label="Add role" onPress={addRole} />
      </View>

      {/* Materials */}
      <View testID="edit-section-materials" style={styles.section}>
        <SectionTitle title="Materials" />
        {materials.map((mat, i) => (
          <View key={i} testID={`material-row-${i}`} style={styles.dynamicBlock}>
            <View style={styles.dynamicBlockHeader}>
              <Text style={styles.dynamicBlockTitle}>Material {i + 1}</Text>
              <RemoveButton onPress={() => removeMaterial(i)} />
            </View>
            <Input
              label="Name"
              value={mat.name}
              onChangeText={(v) => updateMaterial(i, 'name', v)}
              placeholder="Material name"
            />
            <View style={styles.row}>
              <Input
                label="Qty"
                value={mat.quantity ?? ''}
                onChangeText={(v) => updateMaterial(i, 'quantity', v)}
                placeholder="Qty"
                containerStyle={styles.flex1}
              />
              <Input
                label="Unit"
                value={mat.unit ?? ''}
                onChangeText={(v) => updateMaterial(i, 'unit', v)}
                placeholder="Unit"
                containerStyle={styles.flex1}
              />
            </View>
            <Input
              label="Status"
              value={mat.status ?? ''}
              onChangeText={(v) => updateMaterial(i, 'status', v)}
              placeholder="Status"
            />
            <Input
              label="Notes"
              value={mat.notes ?? ''}
              onChangeText={(v) => updateMaterial(i, 'notes', v)}
              placeholder="Notes"
            />
          </View>
        ))}
        <AddButton label="Add material" onPress={addMaterial} />
      </View>

      {/* Issues */}
      <View testID="edit-section-issues" style={styles.section}>
        <SectionTitle title="Issues" />
        {issues.map((issue, i) => (
          <View key={i} testID={`issue-row-${i}`} style={styles.dynamicBlock}>
            <View style={styles.dynamicBlockHeader}>
              <Text style={styles.dynamicBlockTitle}>Issue {i + 1}</Text>
              <RemoveButton onPress={() => removeIssue(i)} />
            </View>
            <Input
              label="Title"
              value={issue.title}
              onChangeText={(v) => updateIssue(i, 'title', v)}
              placeholder="Issue title"
            />
            <View style={styles.row}>
              <Input
                label="Category"
                value={issue.category ?? ''}
                onChangeText={(v) => updateIssue(i, 'category', v)}
                placeholder="Category"
                containerStyle={styles.flex1}
              />
              <Input
                label="Severity"
                value={issue.severity ?? ''}
                onChangeText={(v) => updateIssue(i, 'severity', v)}
                placeholder="low/med/high"
                containerStyle={styles.flex1}
              />
            </View>
            <Input
              label="Details"
              value={issue.details ?? ''}
              onChangeText={(v) => updateIssue(i, 'details', v)}
              placeholder="Details"
              multiline
            />
            <Input
              label="Action required"
              value={issue.actionRequired ?? ''}
              onChangeText={(v) => updateIssue(i, 'actionRequired', v)}
              placeholder="Action needed"
            />
          </View>
        ))}
        <AddButton label="Add issue" onPress={addIssue} />
      </View>

      {/* Next Steps */}
      <View testID="edit-section-next-steps" style={styles.section}>
        <SectionTitle title="Next Steps" />
        {nextSteps.map((step, i) => (
          <View key={i} testID={`next-step-row-${i}`} style={styles.dynamicRow}>
            <Input
              value={step}
              onChangeText={(v) => updateStep(i, v)}
              placeholder="Next step"
              containerStyle={styles.flex1}
            />
            <RemoveButton onPress={() => removeStep(i)} />
          </View>
        ))}
        <AddButton label="Add step" onPress={addStep} />
      </View>

      {/* Custom Sections */}
      <View testID="edit-section-sections" style={styles.section}>
        <SectionTitle title="Custom Sections" />
        {customSections.map((sec, i) => (
          <View key={i} testID={`section-row-${i}`} style={styles.dynamicBlock}>
            <View style={styles.dynamicBlockHeader}>
              <Text style={styles.dynamicBlockTitle}>Section {i + 1}</Text>
              <RemoveButton onPress={() => removeSection(i)} />
            </View>
            <Input
              label="Title"
              value={sec.title}
              onChangeText={(v) => updateSection(i, 'title', v)}
              placeholder="Section title"
            />
            <Input
              label="Content"
              value={sec.content}
              onChangeText={(v) => updateSection(i, 'content', v)}
              placeholder="Section content"
              multiline
              numberOfLines={4}
            />
          </View>
        ))}
        <AddButton label="Add section" onPress={addSection} />
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const stylesheet = createStyleSheet((theme) => ({
  scroll: {
    padding: theme.spacing.md,
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing['2xl'] + 40,
  },
  section: {
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    ...theme.typography.label,
    color: theme.colors.foreground,
    fontWeight: '700',
    fontSize: 16,
    marginBottom: theme.spacing.xs,
  },
  subLabel: {
    ...theme.typography.label,
    color: theme.colors.mutedForeground,
    marginTop: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  countInput: {
    width: 64,
  },
  dynamicRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  dynamicBlock: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  dynamicBlockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dynamicBlockTitle: {
    ...theme.typography.label,
    color: theme.colors.mutedForeground,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  addBtnPressed: {
    opacity: 0.6,
  },
  addBtnText: {
    ...theme.typography.bodySmall,
    color: theme.colors.mutedForeground,
  },
  removeBtn: {
    padding: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
}));
