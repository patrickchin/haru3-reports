export { formatDate, formatDateTime, formatDateLong, formatCapturedAt, formatBytes, formatDuration, formatDurationSec, toTitleCase, truncate } from './format';
export { validateFile, validateProjectName, validateReportTitle, normalizePhoneNumber, isValidPhoneNumber, getCanonicalPhoneNumber, FILE_LIMITS } from './validation';
export type { FileCategory, ValidationResult } from './validation';
export { isIOS, isAndroid, isWeb, monoFontFamily, isE2EMock } from './platform';
