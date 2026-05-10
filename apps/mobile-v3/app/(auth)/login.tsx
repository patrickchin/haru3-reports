import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Phone } from 'lucide-react-native';
import { useAuthActions } from '@/features/auth';
import { SafeAreaView } from '@/components/ui';

export default function LoginScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { signInWithOtp } = useAuthActions();

  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullPhone = phone.startsWith('+') ? phone : `+1${phone}`;

  async function handleContinue() {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await signInWithOtp(fullPhone);
      router.push({ pathname: '/(auth)/verify', params: { phone: fullPhone } });
    } catch (err: any) {
      setError(err.message ?? 'Failed to send code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Phone size={28} color={theme.colors.primary} />
          </View>
          <Text style={styles.title}>Welcome to Harpa</Text>
          <Text style={styles.subtitle}>
            Enter your phone number to get started
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Phone number</Text>
          <View style={styles.inputRow}>
            <View style={styles.prefix}>
              <Text style={styles.prefixText}>+1</Text>
            </View>
            <TextInput
              testID="input-phone"
              style={styles.input}
              placeholder="(555) 123-4567"
              placeholderTextColor={theme.colors.mutedForeground}
              keyboardType="phone-pad"
              autoFocus
              value={phone}
              onChangeText={(t) => {
                setPhone(t);
                setError(null);
              }}
              editable={!loading}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            testID="btn-login-send-code"
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.primaryForeground} />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing['2xl'],
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.foreground,
    textAlign: 'center',
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  form: {
    gap: theme.spacing.md,
  },
  label: {
    ...theme.typography.label,
    color: theme.colors.foreground,
  },
  inputRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.card,
    overflow: 'hidden',
  },
  prefix: {
    paddingHorizontal: theme.spacing.md,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
  },
  prefixText: {
    ...theme.typography.body,
    color: theme.colors.foreground,
  },
  input: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    ...theme.typography.body,
    color: theme.colors.foreground,
  },
  error: {
    ...theme.typography.bodySmall,
    color: theme.colors.destructive,
  },
  button: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radii.lg,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...theme.typography.label,
    color: theme.colors.primaryForeground,
    fontSize: 16,
  },
}));
