import { randomUUID } from 'node:crypto';
import type { Profile, Project, Report, ReportNote, FileMetadata } from '../db/schema.js';

/** Create a fake Profile row. */
export function buildProfile(overrides?: Partial<Profile>): Profile {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    phone: '+1234567890',
    fullName: 'Test User',
    companyName: 'Test Co',
    avatarUrl: null,
    aiProvider: null,
    aiModel: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Create a fake Project row. */
export function buildProject(overrides?: Partial<Project>): Project {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    ownerId: randomUUID(),
    name: 'Test Project',
    address: '123 Main St',
    clientName: 'Test Client',
    status: 'active',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Create a fake Report row. */
export function buildReport(overrides?: Partial<Report>): Report {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    projectId: randomUUID(),
    ownerId: randomUUID(),
    title: 'Daily Report',
    reportType: 'daily',
    status: 'draft',
    visitDate: new Date().toISOString().split('T')[0]!,
    confidence: null,
    reportData: {},
    lastGeneration: null,
    lastProcessedNoteId: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Create a fake ReportNote row. */
export function buildReportNote(overrides?: Partial<ReportNote>): ReportNote {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    reportId: randomUUID(),
    projectId: randomUUID(),
    authorId: randomUUID(),
    position: 0,
    kind: 'text',
    body: 'Test note body',
    fileId: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Create a fake FileMetadata row. */
export function buildFileMetadata(overrides?: Partial<FileMetadata>): FileMetadata {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    projectId: randomUUID(),
    uploadedBy: randomUUID(),
    bucket: 'project-files',
    storagePath: `test/${randomUUID()}.mp3`,
    category: 'voice-note',
    filename: 'test-recording.mp3',
    mimeType: 'audio/mpeg',
    sizeBytes: 1024,
    durationMs: 5000,
    width: null,
    height: null,
    thumbnailPath: null,
    blurhash: null,
    voiceTitle: null,
    voiceSummary: null,
    uploadStatus: 'completed',
    localUri: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
