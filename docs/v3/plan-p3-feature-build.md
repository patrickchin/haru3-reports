# P3: Feature Build (Weeks 5-7)

> Part of [Implementation Plan](./implementation-plan.md)

### Goal
Implement all screens with full functionality.

### P3.1 — Projects Feature

**Deliverables:**
- Project list, detail, create, edit, delete screens
- Member management

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P3.1.1 | useProjects, useProject, useCreateProject hooks | 2h | P2.4 |
| P3.1.2 | useUpdateProject, useDeleteProject hooks | 1h | P3.1.1 |
| P3.1.3 | projects/index.tsx — list screen | 3h | P3.1.2 |
| P3.1.4 | projects/new.tsx — create screen | 2h | P3.1.3 |
| P3.1.5 | projects/[projectId]/index.tsx — detail screen | 3h | P3.1.4 |
| P3.1.6 | projects/[projectId]/edit.tsx — edit screen | 2h | P3.1.5 |
| P3.1.7 | useMembers, useAddMember, useRemoveMember hooks | 2h | P3.1.6 |
| P3.1.8 | projects/[projectId]/members.tsx — member list | 3h | P3.1.7 |
| P3.1.9 | components/members/AddMemberSheet.tsx | 2h | P3.1.8 |
| P3.1.10 | Unit tests for project screens | 3h | P3.1.9 |

**Acceptance Criteria:**
- [ ] All project CRUD operations work
- [ ] Members can be added/removed
- [ ] Role badges display correctly
- [ ] Empty states show

---

### P3.2 — Reports Feature

**Deliverables:**
- Report list, detail, generate screens
- Note timeline component

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P3.2.1 | useReports, useReport, useCreateReport hooks | 2h | P3.1 |
| P3.2.2 | useGenerateReport hook with optimistic update | 3h | P3.2.1 |
| P3.2.3 | reports/index.tsx — list screen | 2h | P3.2.2 |
| P3.2.4 | components/reports/ReportCard.tsx | 2h | P3.2.3 |
| P3.2.5 | reports/generate.tsx — generate screen | 4h | P3.2.4 |
| P3.2.6 | components/reports/NoteTimeline.tsx | 4h | P3.2.5 |
| P3.2.7 | components/reports/GenerateActionBar.tsx | 2h | P3.2.6 |
| P3.2.8 | reports/[reportId].tsx — detail screen | 4h | P3.2.7 |
| P3.2.9 | components/reports/ReportView.tsx | 3h | P3.2.8 |
| P3.2.10 | Report section components (Weather, Workers, etc.) | 4h | P3.2.9 |
| P3.2.11 | Unit tests for report screens | 3h | P3.2.10 |

**Acceptance Criteria:**
- [ ] AI generation works with provider selection
- [ ] Timeline shows notes + pending uploads
- [ ] Report sections render correctly
- [ ] Edit tab allows manual editing

---

### P3.3 — Notes Feature

**Deliverables:**
- Text note CRUD
- Timeline integration

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P3.3.1 | useNotes, useCreateNote hooks with optimistic update | 3h | P3.2 |
| P3.3.2 | useUpdateNote, useDeleteNote hooks | 2h | P3.3.1 |
| P3.3.3 | useNoteTimeline hook (merge pending + server) | 4h | P3.3.2 |
| P3.3.4 | components/notes/TextNoteCard.tsx | 2h | P3.3.3 |
| P3.3.5 | Swipe-to-delete gesture | 2h | P3.3.4 |
| P3.3.6 | Unit tests for note hooks | 2h | P3.3.5 |

**Acceptance Criteria:**
- [ ] Text notes create/edit/delete
- [ ] Timeline merges pending uploads (R11 compliance)
- [ ] Optimistic updates visible immediately (R3)
- [ ] Swipe-to-delete works

---

### P3.4 — Upload Queue Feature

**Deliverables:**
- Upload queue with persistence
- Background upload support

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P3.4.1 | Create features/upload-queue/types.ts | 1h | P2.4 |
| P3.4.2 | Create uploadQueue$ observable with persistence | 2h | P3.4.1 |
| P3.4.3 | Create UploadQueueProvider.tsx | 4h | P3.4.2 |
| P3.4.4 | Implement presign + upload flow | 3h | P3.4.3 |
| P3.4.5 | iOS background upload (NSURLSession) | 4h | P3.4.4 |
| P3.4.6 | Android foreground service upload | 4h | P3.4.5 |
| P3.4.7 | components/uploads/UploadTrayBadge.tsx | 2h | P3.4.6 |
| P3.4.8 | Queue persistence across app restart | 2h | P3.4.7 |
| P3.4.9 | Unit tests for upload queue | 3h | P3.4.8 |

**Acceptance Criteria:**
- [ ] Uploads resume on app restart
- [ ] Failed uploads retry with backoff
- [ ] Progress visible in UI
- [ ] Background upload works on iOS

---

### P3.5 — Files & Camera Feature

**Deliverables:**
- File list, picker, preview
- Camera capture

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P3.5.1 | useFiles hook | 1h | P3.4 |
| P3.5.2 | components/files/FileCard.tsx | 2h | P3.5.1 |
| P3.5.3 | components/files/FilePicker.tsx | 2h | P3.5.2 |
| P3.5.4 | components/files/ImagePreview.tsx (modal) | 3h | P3.5.3 |
| P3.5.5 | camera/capture.tsx with expo-camera | 4h | P3.5.4 |
| P3.5.6 | Image preprocessing (resize, thumbnail, blurhash) | 3h | P3.5.5 |
| P3.5.7 | Unit tests | 2h | P3.5.6 |

**Acceptance Criteria:**
- [ ] Camera capture works
- [ ] Photo library picker works
- [ ] Images preprocessed before upload
- [ ] Lightbox preview works

---

### P3.6 — Voice Notes Feature

**Deliverables:**
- Audio recording + playback
- Transcription + summarization

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P3.6.1 | Create features/audio/AudioProvider.tsx | 3h | P3.4 |
| P3.6.2 | Implement useRecorder hook | 3h | P3.6.1 |
| P3.6.3 | Implement usePlayer hook | 2h | P3.6.2 |
| P3.6.4 | components/voice/RecordButton.tsx | 2h | P3.6.3 |
| P3.6.5 | components/voice/VoiceNoteCard.tsx | 3h | P3.6.4 |
| P3.6.6 | components/voice/Waveform.tsx | 2h | P3.6.5 |
| P3.6.7 | Transcription trigger on upload complete | 2h | P3.6.6 |
| P3.6.8 | Summarization for long transcripts | 2h | P3.6.7 |
| P3.6.9 | Unit tests | 2h | P3.6.8 |

**Acceptance Criteria:**
- [ ] Recording works with visual feedback
- [ ] Playback with progress indicator
- [ ] Only one voice note plays at a time
- [ ] Auto-transcribe on upload
- [ ] Auto-summarize for long transcripts

---

### P3.7 — Profile & Settings Feature

**Deliverables:**
- Profile, account, usage screens
- AI provider settings

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P3.7.1 | profile/index.tsx — main profile | 2h | P3.1 |
| P3.7.2 | profile/account.tsx — edit account details | 2h | P3.7.1 |
| P3.7.3 | profile/usage.tsx — token usage | 2h | P3.7.2 |
| P3.7.4 | AI provider selection modal | 2h | P3.7.3 |
| P3.7.5 | Avatar upload | 2h | P3.7.4 |
| P3.7.6 | Sign out flow | 1h | P3.7.5 |
| P3.7.7 | Unit tests | 2h | P3.7.6 |

**Acceptance Criteria:**
- [ ] Profile displays correctly
- [ ] Avatar upload works
- [ ] Usage history paginated
- [ ] AI provider selection persists

---

### P3.8 — PDF Export

**Deliverables:**
- PDF generation + preview + share

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P3.8.1 | usePdfExport hook | 2h | P3.2 |
| P3.8.2 | PDF preview modal | 2h | P3.8.1 |
| P3.8.3 | Share sheet integration | 1h | P3.8.2 |
| P3.8.4 | Unit tests | 1h | P3.8.3 |

**Acceptance Criteria:**
- [ ] PDF generated correctly
- [ ] Preview in-app
- [ ] Share works
