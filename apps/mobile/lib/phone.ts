export const INVALID_PHONE_NUMBER_MESSAGE =
  "Use a valid phone number in E.164 format, like +15550000000.";

export function normalizePhoneNumber(value: string): string {
  const trimmedValue = value.trim();
  const digits = value.trim().replace(/\D/g, "");

  if (digits.length === 0) {
    return "";
  }

  if (trimmedValue.startsWith("+")) {
    return `+${digits}`;
  }

  return digits.length >= 11 ? `+${digits}` : digits;
}

export function isValidPhoneNumber(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

export function getCanonicalPhoneNumber(value: string): string | null {
  const normalized = normalizePhoneNumber(value);

  return isValidPhoneNumber(normalized) ? normalized : null;
}

export function requireCanonicalPhoneNumber(value: string): string {
  const canonicalPhoneNumber = getCanonicalPhoneNumber(value);

  if (!canonicalPhoneNumber) {
    throw new Error(INVALID_PHONE_NUMBER_MESSAGE);
  }

  return canonicalPhoneNumber;
}
