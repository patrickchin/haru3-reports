import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Pressable, ScrollView, Platform } from 'react-native';
import { HardHat } from 'lucide-react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { useAuthActions } from '@/features/auth';
import { SafeAreaView, Button, Input, InlineNotice } from '@/components/ui';
import { normalizePhoneNumber, isValidPhoneNumber } from '@/lib/utils';

const INVALID_PHONE_MESSAGE = 'Please enter a valid phone number (e.g. +15550000000).';

export default function LoginScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { signInWithOtp } = useAuthActions();

  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedPhone = normalizePhoneNumber(phone);

  const handleSendCode = async () => {
    if (!isValidPhoneNumber(normalizedPhone)) {
      setError(INVALID_PHONE_MESSAGE);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      await signInWithOtp(normalizedPhone);
      setPhone(normalizedPhone);
      setInfo(`We sent a text message with your code to ${normalizedPhone}.`);
      router.push({ pathname: '/(auth)/verify', params: { phone: normalizedPhone } });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to send verification code.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.logoRow}>
              <View style={styles.iconBox}>
                <HardHat size={24} color={theme.colors.primaryForeground} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.display}>Harpa Pro</Text>
              </View>
            </View>

            <View style={styles.form}>
              <Input
                testID="input-phone"
                label="Phone Number"
                placeholder="+15550000000"
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  if (error) setError(null);
                }}
                keyboardType="phone-pad"
                autoComplete="tel"
                editable={!isSubmitting}
              />

              {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
              {info ? <InlineNotice tone="info">{info}</InlineNotice> : null}

              <Button
                testID="btn-login-send-code"
                variant="hero"
                size="xl"
                onPress={handleSendCode}
                disabled={isSubmitting}
                loading={isSubmitting}
                style={styles.fullWidth}
              >
                {isSubmitting ? 'Sending Code...' : 'Send Code'}
              </Button>
            </View>

            <Pressable
              testID="link-signup"
              onPress={() => router.push('/signup' as any)}
              style={styles.signupLink}
            >
              <Text style={styles.signupText}>
                Don't have an account?{' '}
                <Text style={styles.signupBold}>Create Account</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 40,
  },
  content: {
    width: '100%',
    maxWidth: 384,
    alignSelf: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.primary,
  },
  display: {
    ...theme.typography.display,
    color: theme.colors.foreground,
  },
  form: {
    marginTop: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  fullWidth: {
    width: '100%',
  },
  signupLink: {
    marginTop: theme.spacing.xl,
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  signupText: {
    ...theme.typography.body,
    color: theme.colors.mutedForeground,
  },
  signupBold: {
    fontWeight: '600',
    color: theme.colors.foreground,
    textDecorationLine: 'underline',
  },
}));
