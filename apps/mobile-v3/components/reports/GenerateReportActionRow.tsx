import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { RefreshCw } from 'lucide-react-native';

import { Button } from '@/components/ui';
import { useGenerateReportContext } from '@/features/reports/GenerateReportProvider';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GenerateReportActionRow() {
  const { styles, theme } = useStyles(stylesheet);

  const {
    generateReport,
    isGenerating,
    finalizeReport,
    isFinalizing,
    notesSinceLastGeneration,
    hasBeenGenerated,
  } = useGenerateReportContext();

  const busy = isGenerating || isFinalizing;

  // Not yet generated — show full-width Generate button
  if (!hasBeenGenerated) {
    return (
      <View style={styles.row}>
        <Button
          testID="btn-generate-update-report"
          onPress={generateReport}
          disabled={busy}
          loading={isGenerating}
          style={styles.fullWidth}
        >
          Generate Report
        </Button>
      </View>
    );
  }

  // Generated but new notes exist — show Update button
  if (notesSinceLastGeneration > 0) {
    return (
      <View style={styles.row}>
        <Button
          testID="btn-generate-update-report"
          variant="secondary"
          onPress={generateReport}
          disabled={busy}
          loading={isGenerating}
          style={styles.fullWidth}
        >
          {`Update Report (${notesSinceLastGeneration} new note${notesSinceLastGeneration === 1 ? '' : 's'})`}
        </Button>
      </View>
    );
  }

  // Up to date — Regenerate icon + Finalize
  return (
    <View style={styles.row}>
      <Button
        testID="btn-generate-update-report"
        variant="ghost"
        size="sm"
        onPress={generateReport}
        disabled={busy}
        loading={isGenerating}
      >
        <RefreshCw size={16} color={theme.colors.mutedForeground} />
      </Button>
      <Button
        testID="btn-finalize-report"
        onPress={finalizeReport}
        disabled={busy}
        loading={isFinalizing}
        style={styles.flex1}
      >
        Finalize Report
      </Button>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const stylesheet = createStyleSheet((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  fullWidth: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
}));
