export const TAB_ORDER = ["notes", "report", "edit", "debug"] as const;
export type TabKey = (typeof TAB_ORDER)[number];
