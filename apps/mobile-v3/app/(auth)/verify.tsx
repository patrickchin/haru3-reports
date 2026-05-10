import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ShieldCheck } from 'lucide-react-native';
import { useAuthActions } from '@/features/auth';
import { SafeAreaView } from '@/components/ui';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { verifyOtp, signInWithOtp } = useAuthActions();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(RESEND_COOLDOWN);
  const inputRef = useRef<TextInput>(null);

  // Resend countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [resendTimer]);

  const handleVerify = useCallback(async () => {
    if (code.length !== OTP_LENGTH || !phone) return;

    setError(null);
    setLoading(true);
    try {
      const profile = await verifyOtp(phone, code);
      if (profile?.fullName) {
        router.replace('/(app)/projects');
      } else {
        router.replace('/(auth)/onboarding');
      }
    } catch (err: any) {
      setError(err.message ?? 'Invalid code. Please try again.');
      setLoading(false);
    }
  }, [code, phone, verifyOtp]);

  const handleResend = useCallback(async () => {
    if (resendTimer > 0 || !phone) return;
    try {
      await signInWithOtp(phone);
      setResendTimer(RESEND_COOLDOWN);
      setError(null);
    } catch (err: any) {
      setError(err.message ?? 'Failed to resend code.');
    }
  }, [resendTimer, phone, signInWithOtp]);

  function handleCodeChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setCode(digits);
    setError(null);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <ShieldCheck size={28} color={theme.colors.primary} />
          </View>
          <Text style={styles.title}>Enter verification code</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to {phone}
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            testID="input-otp"
            ref={inputRef}
            style={styles.codeInput}
            placeholder="000000"
            placeholderTextColor={theme.colors.mutedForeground}
            keyboardType="number-pad"
            autoFocus
            maxLength={OTP_LENGTH}
            value={code}
            onChangeText={handleCodeChange}
            editable={!loading}
            textContentType="oneTimeCode"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            testID="btn-login-verify-code"
            style={[styles.button, (loading || code.length !== OTP_LENGTH) && styles.buttonDisabled]}
            onPress={handleVerify}
            disabled={loading || code.length !== OTP_LENGTH}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.primaryForeground} />
            ) : (
              <Text style={styles.buttonText}>Verify</Text>
            )}
          </Pressable>

          <Pressable onPress={handleResend} disabled={resendTimer > 0}>
            <Text style={[styles.resendText, resendTimer > 0 && styles.resendDisabled]}>
              {resendTimer > 0 ? `Resend code in ${resendTimer}s` : 'Resend code'}
            </Text>
          </Pressable>

          <Pressable
            testID="btn-login-change-number"
            onPress={() => router.back()}
          >
            <Text style={styles.changeNumberText}>Change number</Text>
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
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  title: {
    ...theme.typography.h2,
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
    alignItems: 'center',
  },
  codeInput: {
    ...theme.typography.h1,
    color: theme.colors.foreground,
    textAlign: 'center',
    letterSpacing: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.card,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    width: '100%',
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
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...theme.typography.label,
    color: theme.colors.primaryForeground,
    fontSize: 16,
  },
  resendText: {
    ...theme.typography.bodySmall,
    color: theme.colors.primary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  resendDisabled: {
    color: theme.colors.mutedForeground,
  },
  changeNumberText: {
    ...theme.typography.bodySmall,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    textDecorationLine: 'underline',
  },
}));
