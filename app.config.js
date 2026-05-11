// Guard: prevent expo commands from running in the repo root.
// The mobile app lives in apps/mobile-v3/ — run expo there instead.
throw new Error(
  [
    "",
    "❌  WRONG DIRECTORY",
    "",
    "Do not run Expo commands from the repo root.",
    "  cd apps/mobile-v3 && npx expo run:ios …",
    "",
  ].join("\n"),
);
