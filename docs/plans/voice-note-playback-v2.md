# Voice-note playback v2

The first cut at centralized voice-note playback (`AudioPlaybackProvider`,
`useVoiceNotePlayer`, `MiniVoiceNotePlayer`) gave us a single global
`AudioPlayer` and a "now playing" floating bar. In practice that bar
hung around in places it didn't belong (settings, other reports), the
play/pause button frequently desynced from the underlying player, and
voice notes kept fighting the user's music app. This pass scopes
playback to the screen that started it, makes ducking polite, and
removes the polling loop that caused the desync.

Concretely: (1) the MiniPlayer is removed; (2) the provider records the
`usePathname()` snapshot at the time of `play()` and tears the player
down when the pathname changes or the app goes to `background` /
`inactive` via `AppState`; (3) on `stop()` and on natural finish the
provider flips the audio session to `mixWithOthers` +
`playsInSilentMode: false` so iOS releases the exclusive session and
the user's music auto-resumes; (4) `shouldPlayInBackground` flips to
`false`; (5) the 200 ms polling loop is replaced with a real
`player.addListener("playbackStatusUpdate", …)` subscription that
drives `isPlaying`, `positionMs`, `durationMs`, and a `didJustFinish`
auto-stop. The listener doesn't have the race the polling did — there
is no tick that can land between `play()` returning and `playing`
flipping to `true`, and the listener is the single source of truth, so
the play/pause button stays in lockstep with the player.
