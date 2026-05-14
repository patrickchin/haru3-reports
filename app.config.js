// Guard: prevent expo commands from running in the repo root.
// The mobile app lives in apps/mobile/ — run expo there instead.
throw new Error(
  [
    "",
    "❌  WRONG DIRECTORY",
    "",
    "Do not run Expo commands from the repo root.",
    "  cd apps/mobile && npx expo run:ios …",
    "",
  ].join("\n"),
);
