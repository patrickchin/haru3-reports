/**
 * Typed testID registry for Maestro flows.
 *
 * Phase 0: Empty stubs. Features will fill in as implemented.
 */

export const testIds = {
  auth: {
    signInButton: "auth:sign-in-button",
    signUpButton: "auth:sign-up-button",
    phoneInput: "auth:phone-input",
    otpInput: "auth:otp-input",
    submitButton: "auth:submit-button",
    onboardingFullNameInput: "auth:onboarding-full-name-input",
    onboardingCompanyNameInput: "auth:onboarding-company-name-input",
    onboardingSubmitButton: "auth:onboarding-submit-button",
    callback: "auth:callback",
  },
  projects: {
    list: "projects:list",
    card: (id: string) => `projects:card:${id}`,
    createButton: "projects:create-button",
  },
  reports: {
    list: "reports:list",
    card: (id: string) => `reports:card:${id}`,
  },
} as const;
