import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, typography, radii } from '@/lib/styles/tokens';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** When true, renders inline (per-route) instead of full-screen (root). */
  inline?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches unhandled JS errors in the React tree.
 *
 * Two placement modes:
 * - Root: wraps entire app tree in `_layout.tsx` (full-screen fallback)
 * - Per-route: wraps individual screen content (inline fallback, rest of app navigable)
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Structured log for error tracking; swap for Sentry in prod
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isInline = this.props.inline ?? false;

    return (
      <View
        testID="error-boundary-screen"
        style={[styles.container, isInline && styles.containerInline]}
      >
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          {this.state.error?.message ?? 'An unexpected error occurred.'}
        </Text>
        <Pressable
          testID="btn-error-retry"
          style={({ pressed }) => [
            styles.retryButton,
            pressed && styles.retryButtonPressed,
          ]}
          onPress={this.handleRetry}
        >
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  containerInline: {
    flex: 0,
    minHeight: 200,
    borderRadius: radii.lg,
    backgroundColor: colors.dangerSoft,
    marginHorizontal: spacing.md,
    marginVertical: spacing.lg,
  },
  title: {
    ...typography.h3,
    color: colors.foreground,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryButtonPressed: {
    backgroundColor: colors.muted,
  },
  retryText: {
    ...typography.label,
    color: colors.foreground,
  },
});
