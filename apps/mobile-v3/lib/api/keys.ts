export const keys = {
  projects: {
    all: ['projects'] as const,
    list: () => [...keys.projects.all, 'list'] as const,
    detail: (id: string) => [...keys.projects.all, 'detail', id] as const,
  },
  reports: {
    all: ['reports'] as const,
    list: (projectId: string) => [...keys.reports.all, 'list', projectId] as const,
    detail: (id: string) => [...keys.reports.all, 'detail', id] as const,
  },
  notes: {
    all: ['notes'] as const,
    list: (reportId: string) => [...keys.notes.all, 'list', reportId] as const,
  },
  files: {
    all: ['files'] as const,
    list: (projectId: string) => [...keys.files.all, 'list', projectId] as const,
    detail: (id: string) => [...keys.files.all, 'detail', id] as const,
  },
  members: {
    all: ['members'] as const,
    list: (projectId: string) => [...keys.members.all, 'list', projectId] as const,
  },
  profile: {
    all: ['profile'] as const,
    current: () => [...keys.profile.all, 'current'] as const,
    usage: () => [...keys.profile.all, 'usage'] as const,
    usageHistory: () => [...keys.profile.all, 'usage-history'] as const,
  },
  ai: {
    all: ['ai'] as const,
    providers: () => [...keys.ai.all, 'providers'] as const,
    settings: () => [...keys.ai.all, 'settings'] as const,
  },
};
