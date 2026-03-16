export const MOCK_PROJECTS = [
  {
    id: "1",
    name: "Highland Tower Complex",
    address: "2400 Highland Ave, Austin TX",
    lastReport: "Mar 15, 2026",
    status: "Active" as const,
  },
  {
    id: "2",
    name: "Riverside Bridge Repair",
    address: "101 River Rd, Dallas TX",
    lastReport: "Mar 14, 2026",
    status: "Active" as const,
  },
  {
    id: "3",
    name: "Metro Station East",
    address: "88 Commerce St, Houston TX",
    lastReport: "Mar 10, 2026",
    status: "Delayed" as const,
  },
  {
    id: "4",
    name: "Oak Park Residential",
    address: "500 Oak Park Blvd, San Antonio TX",
    lastReport: "Mar 8, 2026",
    status: "Completed" as const,
  },
];

export const MOCK_REPORTS = [
  {
    id: "r1",
    title: "Daily Progress Report",
    date: "Mar 15, 2026",
    type: "Daily" as const,
    status: "Final" as const,
    confidence: 96,
  },
  {
    id: "r2",
    title: "Safety Inspection #12",
    date: "Mar 14, 2026",
    type: "Safety" as const,
    status: "Final" as const,
    confidence: 91,
  },
  {
    id: "r3",
    title: "Daily Progress Report",
    date: "Mar 13, 2026",
    type: "Daily" as const,
    status: "Draft" as const,
    confidence: 78,
  },
  {
    id: "r4",
    title: "Incident: Crane Delay",
    date: "Mar 12, 2026",
    type: "Incident" as const,
    status: "Final" as const,
    confidence: 88,
  },
  {
    id: "r5",
    title: "Daily Progress Report",
    date: "Mar 11, 2026",
    type: "Daily" as const,
    status: "Final" as const,
    confidence: 94,
  },
];

export const MOCK_REPORT_DETAIL = {
  title: "Daily Progress Report",
  date: "Mar 15, 2026",
  status: "Final",
  project: "Highland Tower Complex",
  confidence: 96,
  sections: [
    {
      section: "Weather",
      content:
        "84°F Clear skies. UV index 7. Wind: 5 mph NW. No precipitation expected.",
    },
    {
      section: "Manpower",
      content:
        "12 personnel on site. 4 electricians, 3 iron workers, 2 operators, 2 laborers, 1 foreman.",
    },
    {
      section: "Progress",
      content:
        "3rd floor concrete pour completed (Section B). Rebar installation 60% complete on Section C. Formwork stripped on 2nd floor east wing.",
    },
    {
      section: "Issues",
      content:
        "Crane #2 hydraulic line showing wear — maintenance scheduled for tomorrow AM. Minor delay on drywall delivery, ETA pushed to Thursday.",
    },
  ],
};

export const MOCK_GENERATED_REPORT = [
  {
    section: "Weather",
    content:
      "84°F Clear skies. UV index 7. Wind: 5 mph NW. No precipitation expected.",
  },
  {
    section: "Manpower",
    content:
      "12 personnel on site. 4 electricians, 3 iron workers, 2 operators, 2 laborers, 1 foreman.",
  },
  {
    section: "Progress",
    content:
      "3rd floor concrete pour completed (Section B). Rebar installation 60% complete on Section C. Formwork stripped on 2nd floor east wing.",
  },
  {
    section: "Issues",
    content:
      "Crane #2 hydraulic line showing wear — maintenance scheduled for tomorrow AM. Minor delay on drywall delivery, ETA pushed to Thursday.",
  },
];

export const REPORT_FILTERS = ["All", "Daily", "Safety", "Incident"] as const;

export const PROFILE_SECTIONS = [
  { label: "Account Details", icon: "User" as const, desc: "Name, phone, company" },
  { label: "Notifications", icon: "Bell" as const, desc: "Alerts & reminders" },
  { label: "Offline Data", icon: "Wifi" as const, desc: "Manage cached reports" },
];
