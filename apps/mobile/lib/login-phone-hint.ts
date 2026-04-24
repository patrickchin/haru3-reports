interface LoginPhoneHintOptions {
  codeSent: boolean;
  rememberedPhone: string | null;
  shouldRememberPhone: boolean;
}

export function getLoginPhoneHint({
  codeSent,
  rememberedPhone,
  shouldRememberPhone,
}: LoginPhoneHintOptions): string {
  if (codeSent) {
    return "Code sent. Enter the 6-digit verification code from your text message.";
  }

  if (rememberedPhone) {
    return "This device already has your phone number saved for faster sign-in.";
  }

  if (shouldRememberPhone) {
    return "Your phone number will be saved on this device after sign-in.";
  }

  return "Use E.164 format so text verification works reliably.";
}
