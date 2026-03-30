-- Seed data for local development
-- ============================================================
-- 1) Create auth users (Supabase local dev helper)
-- ============================================================

-- Test user: Mike Torres  (+15551234567 / password: test1234)
insert into auth.users (
  id, instance_id, aud, role,
  encrypted_password, email, phone,
  email_confirmed_at, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  crypt('test1234', gen_salt('bf')),
  'mike@example.com', '+15551234567',
  now(), now(),
  '{"provider":"phone","providers":["phone"]}'::jsonb,
  '{"full_name":"Mike Torres","company_name":"Torres Construction LLC","phone":"+15551234567"}'::jsonb,
  now(), now()
) on conflict (id) do nothing;

-- Test user: Sarah Chen  (+15559876543 / password: test1234)
insert into auth.users (
  id, instance_id, aud, role,
  encrypted_password, email, phone,
  email_confirmed_at, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '22222222-2222-2222-2222-222222222222',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  crypt('test1234', gen_salt('bf')),
  'sarah@example.com', '+15559876543',
  now(), now(),
  '{"provider":"phone","providers":["phone"]}'::jsonb,
  '{"full_name":"Sarah Chen","company_name":"SiteLine Engineering","phone":"+15559876543"}'::jsonb,
  now(), now()
) on conflict (id) do nothing;

-- Ensure identities exist (required by Supabase GoTrue)
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '+15551234567',
  '{"sub":"11111111-1111-1111-1111-111111111111","phone":"+15551234567"}'::jsonb,
  'phone', now(), now(), now()
) on conflict (provider_id, provider) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  '22222222-2222-2222-2222-222222222222',
  '22222222-2222-2222-2222-222222222222',
  '+15559876543',
  '{"sub":"22222222-2222-2222-2222-222222222222","phone":"+15559876543"}'::jsonb,
  'phone', now(), now(), now()
) on conflict (provider_id, provider) do nothing;

-- ============================================================
-- 2) Profiles (auto-created by trigger, but upsert to be safe)
-- ============================================================

insert into public.profiles (id, phone, full_name, company_name) values
  ('11111111-1111-1111-1111-111111111111', '+15551234567', 'Mike Torres', 'Torres Construction LLC'),
  ('22222222-2222-2222-2222-222222222222', '+15559876543', 'Sarah Chen', 'SiteLine Engineering')
on conflict (id) do update set
  full_name    = excluded.full_name,
  company_name = excluded.company_name;

-- ============================================================
-- 3) Projects
-- ============================================================

-- Mike's projects
insert into public.projects (id, owner_id, name, address, client_name, status) values
  ('aaaa0001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Highland Tower Complex', '2400 Highland Ave, Austin TX', 'Greenfield Developments', 'active'),
  ('aaaa0002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Riverside Bridge Repair', '101 River Rd, Dallas TX', 'TxDOT District 4', 'active'),
  ('aaaa0003-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Metro Station East', '88 Commerce St, Houston TX', 'Metro Transit Authority', 'delayed'),
  ('aaaa0004-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Oak Park Residential', '500 Oak Park Blvd, San Antonio TX', 'Blueridge Homes', 'completed');

-- Sarah's projects
insert into public.projects (id, owner_id, name, address, client_name, status) values
  ('bbbb0001-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'Pacific Highway Upgrade', '1200 Pacific Hwy, Coffs Harbour NSW', 'Transport NSW', 'active'),
  ('bbbb0002-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'Elm Street Renovation', '42 Elm St, Brisbane QLD', 'Private Residential', 'active');

-- ============================================================
-- 4) Reports — Highland Tower Complex (Mike)
-- ============================================================

-- Report 1: Daily Progress Report (final, high confidence)
insert into public.reports (
  id, project_id, owner_id, title, report_type, status, visit_date, confidence,
  notes, report_data, created_at
) values (
  'cc000001-0000-0000-0000-000000000001',
  'aaaa0001-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'Daily Progress Report — Level 14 Pour',
  'daily', 'final', '2026-03-15', 96,
  array[
    'level 14 column pour today. got 23 columns to do. concrete booked from 6am',
    'pour started 6:20. first column done in about 15 mins. using a vibrator to consolidate properly',
    'temp is about 8 degrees this morning. cold. the concrete mix has been adjusted for cold weather curing',
    'all 23 columns poured by 2:15pm. finishing up the tops now',
    'cylinders taken, 6 test cylinders from todays pour. 7 day and 28 day breaks',
    'good day, no safety issues, no concrete rejects, all columns done. onto the level 14 slab formwork tomorrow'
  ],
  '{
    "report": {
      "meta": {
        "title": "Daily Progress Report — Level 14 Pour",
        "reportType": "daily",
        "summary": "All 23 level-14 columns poured successfully by 2:15 PM. Cold-weather adjustments applied to concrete mix. No safety incidents or concrete rejects. 6 test cylinders taken for 7-day and 28-day breaks. Slab formwork to begin tomorrow.",
        "visitDate": "2026-03-15"
      },
      "weather": {
        "conditions": "Overcast, cold morning clearing to partly cloudy",
        "temperature": "8°C at start, rising to 14°C by afternoon",
        "wind": "5–10 km/h westerly",
        "impact": "Cold weather required accelerator additive in concrete mix"
      },
      "manpower": {
        "totalWorkers": 18,
        "workerHours": "144",
        "notes": "Full crew on site for pour day",
        "roles": [
          {"role": "Concreter", "count": 6, "notes": "Column pour & finishing"},
          {"role": "Pump Operator", "count": 1, "notes": "Line boom on level 14"},
          {"role": "Crane Operator", "count": 1, "notes": null},
          {"role": "Formwork Carpenter", "count": 4, "notes": "Pre-pour checks & corrections"},
          {"role": "Steel Fixer", "count": 3, "notes": "Reo inspection support"},
          {"role": "Laborer", "count": 2, "notes": "General support & cleanup"},
          {"role": "Foreman", "count": 1, "notes": "Site coordination"}
        ]
      },
      "siteConditions": [
        {"topic": "Concrete Supply", "details": "32 MPa mix with cold-weather accelerator. Slump tests within spec (80 mm, confirmed acceptable by engineer)."},
        {"topic": "Formwork", "details": "One column form (C3) found not fully tied at base — repaired before pour. All other forms in good condition."},
        {"topic": "Curing", "details": "Curing compound to be applied once surface firms up (~1 hour post-pour). Minimum 48 hours before stripping — Thursday 2:15 PM earliest."}
      ],
      "activities": [
        {
          "name": "Level 14 Column Pour",
          "location": "Level 14, Grid A1–D6",
          "status": "completed",
          "summary": "All 23 columns poured between 6:20 AM and 2:15 PM. Averaging 12–15 minutes per column with vibration consolidation. Pump blockage cleared mid-morning (~20 min delay). Bleed water observed on early columns — re-vibrated and topped off.",
          "sourceNoteIndexes": [1, 2, 4],
          "manpower": null,
          "materials": [
            {"name": "Concrete 32 MPa (cold-weather mix)", "quantity": "~46 m³", "status": "delivered", "notes": "5 truckloads, slump 80 mm"},
            {"name": "Curing compound", "quantity": null, "status": "on-site", "notes": "To be applied post-firming"}
          ],
          "equipment": [
            {"name": "Concrete pump (line boom)", "quantity": "1", "status": "operational", "hoursUsed": "8", "notes": "Blockage cleared after smoko"},
            {"name": "Vibrator", "quantity": "3", "status": "operational", "hoursUsed": "8", "notes": null}
          ],
          "issues": [],
          "observations": [
            "Pump blockage after smoko — ~20 min downtime to clear",
            "Bleed water on early columns (normal for cold weather) — re-vibrated",
            "Form ties on D2 showing rust — functional but should be replaced for next pour"
          ]
        }
      ],
      "issues": [
        {
          "title": "Rusty form ties on D2 column",
          "category": "equipment",
          "severity": "low",
          "status": "monitor",
          "details": "Form ties on D2 column showing surface rust. Still functional but should be replaced before next pour to avoid potential failure.",
          "actionRequired": "Replace form ties on D2 before next pour",
          "sourceNoteIndexes": [4]
        }
      ],
      "nextSteps": [
        "Apply curing compound once slab surface firms (~1 hour post-pour)",
        "No traffic on poured columns for 48 hours minimum — stripping earliest Thursday 2:15 PM",
        "Begin level 14 slab formwork tomorrow",
        "Replace rusty form ties on D2 before next pour",
        "7-day cylinder break scheduled for March 22"
      ],
      "sections": [
        {
          "title": "Test Cylinders",
          "content": "6 test cylinders taken from today''s pour, labelled and placed in curing box. Scheduled for 7-day break (Mar 22) and 28-day break (Apr 12).",
          "sourceNoteIndexes": [5]
        }
      ]
    }
  }'::jsonb,
  '2026-03-15 15:30:00+00'
);

-- Report 2: Safety Inspection (final)
insert into public.reports (
  id, project_id, owner_id, title, report_type, status, visit_date, confidence,
  notes, report_data, created_at
) values (
  'cc000002-0000-0000-0000-000000000002',
  'aaaa0001-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'Safety Inspection #12',
  'safety', 'final', '2026-03-14', 91,
  array[
    'safety walk with the site manager at 9. checking edge protection on level 2',
    'edge protection all good. harnesses being worn by everyone up top. safety nets in place south side',
    'the apprentice Dylan dropped a hammer off level 2. hit the exclusion zone barricade below. no one near it',
    'filed an incident report for the dropped hammer. near miss. Dylan putting a lanyard on everything now',
    'checked all fire extinguishers in date. all 4 ground floor and 2 on level 1'
  ],
  '{
    "report": {
      "meta": {
        "title": "Safety Inspection #12",
        "reportType": "safety",
        "summary": "Routine safety inspection completed. Edge protection and fall arrest systems in good order. One near-miss incident — dropped hammer from level 2 into exclusion zone (no injuries). Corrective action taken: tool lanyards enforced. All fire extinguishers current.",
        "visitDate": "2026-03-14"
      },
      "weather": {
        "conditions": "Clear skies",
        "temperature": "24°C",
        "wind": "Light, 5 km/h",
        "impact": null
      },
      "manpower": {
        "totalWorkers": 22,
        "workerHours": null,
        "notes": null,
        "roles": []
      },
      "siteConditions": [
        {"topic": "Edge Protection", "details": "All barriers on level 2 secure and compliant. Harnesses worn by all personnel working at height."},
        {"topic": "Safety Nets", "details": "Nets in place on south side. Condition good, no tears or gaps."},
        {"topic": "Fire Extinguishers", "details": "All 6 units inspected and in-date (4 ground floor, 2 level 1)."}
      ],
      "activities": [
        {
          "name": "Safety Walk — Level 2",
          "location": "Level 2",
          "status": "completed",
          "summary": "Joint inspection with site manager. Edge protection, harnesses, safety nets, and exclusion zones all verified compliant.",
          "sourceNoteIndexes": [1, 2],
          "manpower": null,
          "materials": [],
          "equipment": [],
          "issues": [],
          "observations": ["All PPE in good condition", "Exclusion zone barricades intact"]
        }
      ],
      "issues": [
        {
          "title": "Near Miss — Dropped Hammer from Level 2",
          "category": "safety",
          "severity": "medium",
          "status": "resolved",
          "details": "Apprentice (Dylan) dropped a hammer from level 2 which struck the exclusion zone barricade. No personnel were in the area. Incident report filed immediately.",
          "actionRequired": "Tool lanyards now mandatory for all hand tools at height. Toolbox talk scheduled.",
          "sourceNoteIndexes": [3, 4]
        }
      ],
      "nextSteps": [
        "Conduct toolbox talk on tool tethering — all trades",
        "Verify lanyard compliance during next safety walk",
        "Schedule next fire extinguisher check for April 14"
      ],
      "sections": []
    }
  }'::jsonb,
  '2026-03-14 12:00:00+00'
);

-- Report 3: Daily Progress (draft, lower confidence)
insert into public.reports (
  id, project_id, owner_id, title, report_type, status, visit_date, confidence,
  notes, report_data, created_at
) values (
  'cc000003-0000-0000-0000-000000000003',
  'aaaa0001-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'Daily Progress Report',
  'daily', 'draft', '2026-03-13', 78,
  array[
    'concreters setting up for slab pour zone B, about 6 of them plus pump truck',
    'sparky not here yet was supposed to be here 6:30 for conduit runs',
    'bit of a bow in the eastern form near grid line 7, getting Tommo to fix it',
    'pour going well nice and smooth. 32 MPA as speced',
    'started spitting rain. tarps ready just in case'
  ],
  '{
    "report": {
      "meta": {
        "title": "Daily Progress Report",
        "reportType": "daily",
        "summary": "Zone B slab pour underway. Minor formwork defect corrected before pour. Electricians arrived late (20 min). Light rain in afternoon but pour continued. Draft — awaiting final concrete volume and end-of-day status.",
        "visitDate": "2026-03-13"
      },
      "weather": {
        "conditions": "Overcast, light rain in afternoon",
        "temperature": "12°C",
        "wind": "5–10 km/h westerly",
        "impact": "Light rain threatened pour; tarps on standby but not needed"
      },
      "manpower": {
        "totalWorkers": 14,
        "workerHours": null,
        "notes": "Electricians arrived 20 min late",
        "roles": [
          {"role": "Concreter", "count": 6, "notes": "Zone B slab pour"},
          {"role": "Electrician", "count": 4, "notes": "Conduit runs zone A — arrived late"},
          {"role": "Formwork Carpenter", "count": 3, "notes": "Form repair + stripping"},
          {"role": "Foreman", "count": 1, "notes": null}
        ]
      },
      "siteConditions": [
        {"topic": "Formwork", "details": "Bow in eastern form near grid line 7 — corrected by Tommo in ~15–20 min before pour."},
        {"topic": "Reo Sign-off", "details": "Zone B reinforcement signed off by engineer previous day."}
      ],
      "activities": [
        {
          "name": "Zone B Slab Pour",
          "location": "Zone B, Ground Floor",
          "status": "in-progress",
          "summary": "Slab pour started ~8:15 AM after formwork correction. 32 MPa mix. Pour progressing well. Light rain in afternoon but not enough to halt work.",
          "sourceNoteIndexes": [1, 3, 4, 5],
          "manpower": null,
          "materials": [
            {"name": "Concrete 32 MPa", "quantity": null, "status": "pouring", "notes": "Volume TBC at end of day"}
          ],
          "equipment": [
            {"name": "Concrete pump truck", "quantity": "1", "status": "operational", "hoursUsed": null, "notes": null}
          ],
          "issues": [],
          "observations": ["Rain tarps on standby", "Second concrete truck 15 min out mid-pour"]
        },
        {
          "name": "Conduit Runs — Zone A",
          "location": "Zone A, Ground Floor",
          "status": "in-progress",
          "summary": "4 electricians working on conduit runs. Started late due to traffic delay.",
          "sourceNoteIndexes": [2],
          "manpower": null,
          "materials": [],
          "equipment": [],
          "issues": [],
          "observations": []
        }
      ],
      "issues": [
        {
          "title": "Formwork bow near grid line 7",
          "category": "quality",
          "severity": "low",
          "status": "resolved",
          "details": "Eastern formwork in Zone B had a visible bow near grid line 7. Corrected by carpenter before pour commenced.",
          "actionRequired": null,
          "sourceNoteIndexes": [3]
        }
      ],
      "nextSteps": [
        "Complete Zone B slab pour and finishing",
        "No traffic on Zone B slab for 24 hours minimum",
        "Electricians to finish conduit runs in Zone A",
        "Update report with final concrete volumes"
      ],
      "sections": []
    }
  }'::jsonb,
  '2026-03-13 16:00:00+00'
);

-- Report 4: Incident report (final)
insert into public.reports (
  id, project_id, owner_id, title, report_type, status, visit_date, confidence,
  notes, report_data, created_at
) values (
  'cc000004-0000-0000-0000-000000000004',
  'aaaa0001-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'Incident: Crane Hydraulic Leak',
  'incident', 'final', '2026-03-12', 88,
  array[
    'crane had a minor hydraulic leak earlier this morning',
    'Johnno topped up the fluid and its been fine since. should probably log that',
    'getting pretty windy now, gusts maybe 30-35 kph. monitoring crane lifts',
    'wind backed off. continuing with panels'
  ],
  '{
    "report": {
      "meta": {
        "title": "Incident: Crane Hydraulic Leak",
        "reportType": "incident",
        "summary": "Minor hydraulic leak detected on tower crane during morning pre-start. Operator topped up fluid and continued operations. Wind gusts reached 30–35 km/h mid-afternoon, monitored closely. No injuries, no work stoppages beyond initial fluid top-up.",
        "visitDate": "2026-03-12"
      },
      "weather": {
        "conditions": "Partly cloudy, increasingly windy",
        "temperature": "18°C",
        "wind": "15 km/h gusting to 30–35 km/h in afternoon",
        "impact": "Wind gusts approached crane shutdown threshold (40 km/h) but stayed within limits"
      },
      "manpower": {
        "totalWorkers": 20,
        "workerHours": null,
        "notes": null,
        "roles": []
      },
      "siteConditions": [],
      "activities": [
        {
          "name": "Precast Panel Lifts — Level 2",
          "location": "Level 2, North & East Walls",
          "status": "completed",
          "summary": "8 precast panels lifted and installed (5 north wall, 3 east wall) despite hydraulic issue and wind. All panels plumb and secured.",
          "sourceNoteIndexes": [3, 4],
          "manpower": null,
          "materials": [
            {"name": "Precast concrete panels", "quantity": "8", "status": "installed", "notes": "5 north wall, 3 east wall"}
          ],
          "equipment": [
            {"name": "Tower crane", "quantity": "1", "status": "operational (repaired)", "hoursUsed": "7", "notes": "Hydraulic fluid topped up after leak"}
          ],
          "issues": [],
          "observations": ["Wind monitoring throughout afternoon", "All panels checked for plumb after installation"]
        }
      ],
      "issues": [
        {
          "title": "Crane Hydraulic Leak",
          "category": "equipment",
          "severity": "medium",
          "status": "monitor",
          "details": "Minor hydraulic leak found during pre-start inspection. Operator (Johnno) topped up hydraulic fluid. Crane operated normally for remainder of day. Requires follow-up inspection to identify leak source.",
          "actionRequired": "Schedule hydraulic system inspection with crane maintenance contractor. Monitor fluid levels daily until resolved.",
          "sourceNoteIndexes": [1, 2]
        },
        {
          "title": "High Wind Gusts",
          "category": "weather",
          "severity": "low",
          "status": "resolved",
          "details": "Wind gusts reached 30–35 km/h in the afternoon, approaching the 40 km/h crane shutdown threshold. Operations continued with close monitoring. Wind subsided by mid-afternoon.",
          "actionRequired": null,
          "sourceNoteIndexes": [3, 4]
        }
      ],
      "nextSteps": [
        "Schedule crane hydraulic inspection — priority",
        "Monitor hydraulic fluid levels daily",
        "Check wind forecast before planning crane lifts"
      ],
      "sections": []
    }
  }'::jsonb,
  '2026-03-12 16:30:00+00'
);

-- Report 5: Daily Progress Report (final)
insert into public.reports (
  id, project_id, owner_id, title, report_type, status, visit_date, confidence,
  notes, report_data, created_at
) values (
  'cc000005-0000-0000-0000-000000000005',
  'aaaa0001-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'Daily Progress Report',
  'daily', 'final', '2026-03-11', 94,
  array[
    'precast panels delivered. 8 panels total for north and east walls level 2',
    'timber delivery 45 lengths of LVL 90x35 checked off against order',
    'zone C plumbing rough-in about 60% done. Richo says done by midday tomorrow',
    'need to order more 12mm reo for next weeks column pours running low'
  ],
  '{
    "report": {
      "meta": {
        "title": "Daily Progress Report",
        "reportType": "daily",
        "summary": "Material deliveries received (precast panels, LVL timber). Plumbing rough-in 60% complete in Zone C. 12 mm reo running low — needs reorder for next week''s column pours.",
        "visitDate": "2026-03-11"
      },
      "weather": {
        "conditions": "Sunny",
        "temperature": "22°C",
        "wind": "Light, variable",
        "impact": null
      },
      "manpower": {
        "totalWorkers": 16,
        "workerHours": null,
        "notes": null,
        "roles": [
          {"role": "Plumber", "count": 3, "notes": "Zone C rough-in"},
          {"role": "Laborer", "count": 4, "notes": "Material handling & site prep"},
          {"role": "Formwork Carpenter", "count": 5, "notes": "Level 2 formwork"},
          {"role": "Crane Operator", "count": 1, "notes": null},
          {"role": "Foreman", "count": 1, "notes": null},
          {"role": "Electrician", "count": 2, "notes": "Cable pulling zone A"}
        ]
      },
      "siteConditions": [
        {"topic": "Material Storage", "details": "Laydown area cleared for precast panel delivery. LVL timber stacked and dunnaged."},
        {"topic": "Zone C Access", "details": "Materials cleared from Zone C to allow plumbing access."}
      ],
      "activities": [
        {
          "name": "Material Deliveries",
          "location": "Site laydown area",
          "status": "completed",
          "summary": "Received 8 precast panels (5 north, 3 east for level 2) and 45 lengths of 90×35 LVL timber. All checked against orders.",
          "sourceNoteIndexes": [1, 2],
          "manpower": null,
          "materials": [
            {"name": "Precast concrete panels", "quantity": "8", "status": "received", "notes": "For level 2 north & east walls"},
            {"name": "LVL timber 90×35", "quantity": "45 lengths", "status": "received", "notes": "For level 2 formwork"}
          ],
          "equipment": [],
          "issues": [],
          "observations": []
        },
        {
          "name": "Plumbing Rough-in — Zone C",
          "location": "Zone C, Ground Floor",
          "status": "in-progress",
          "summary": "Sewer and stormwater rough-in ~60% complete. Richo''s crew (3 plumbers) on track to finish by midday tomorrow.",
          "sourceNoteIndexes": [3],
          "manpower": {"totalWorkers": 3, "workerHours": null, "notes": null, "roles": [{"role": "Plumber", "count": 3, "notes": null}]},
          "materials": [],
          "equipment": [],
          "issues": [],
          "observations": []
        }
      ],
      "issues": [
        {
          "title": "Low stock of 12 mm reo bar",
          "category": "materials",
          "severity": "medium",
          "status": "open",
          "details": "12 mm reinforcement bar running low on site. Needed for next week''s column pours. Must reorder promptly to avoid delay.",
          "actionRequired": "Order 12 mm reo ASAP — confirm quantity with structural engineer",
          "sourceNoteIndexes": [4]
        }
      ],
      "nextSteps": [
        "Order 12 mm reo for column pours next week",
        "Finish Zone C plumbing rough-in (ETA midday tomorrow)",
        "Book concrete pump for Thursday Zone C slab",
        "Begin precast panel installation level 2 tomorrow"
      ],
      "sections": []
    }
  }'::jsonb,
  '2026-03-11 16:00:00+00'
);

-- ============================================================
-- 5) Reports — Pacific Highway Upgrade (Sarah)
-- ============================================================

insert into public.reports (
  id, project_id, owner_id, title, report_type, status, visit_date, confidence,
  notes, report_data, created_at
) values (
  'dd000001-0000-0000-0000-000000000001',
  'bbbb0001-0000-0000-0000-000000000001',
  '22222222-2222-2222-2222-222222222222',
  'Daily Progress — Kerb & Gutter',
  'daily', 'final', '2026-03-15', 89,
  array[
    'kerb and gutter on southbound lane chainage 450 to 520',
    'traffic control set up, two lanes closed, 40 zone',
    'weather rubbish, been raining since 4am, trench full of water',
    'pumps running, 2 pumps 3 inch and 4 inch',
    'hit a telstra pit at chainage 480 not on the plans',
    'compaction testing passed 99% standard proctor',
    'formwork done on first 30m section ready for concrete tomorrow'
  ],
  '{
    "report": {
      "meta": {
        "title": "Daily Progress — Kerb & Gutter",
        "reportType": "daily",
        "summary": "Kerb and gutter works progressed on southbound lane (ch. 450–520) despite heavy morning rain. Trench dewatered successfully. Unexpected Telstra conduit discovered at ch. 480 — relocation discussions pending. First 30 m section of formwork completed, passing compaction at 99% standard Proctor. Ready for concrete pour tomorrow.",
        "visitDate": "2026-03-15"
      },
      "weather": {
        "conditions": "Heavy rain from 4 AM, easing by midday, clearing afternoon",
        "temperature": "16°C",
        "wind": "10–15 km/h",
        "impact": "Trench flooded requiring dewatering. Concrete delivery postponed to 1 PM then pushed to tomorrow."
      },
      "manpower": {
        "totalWorkers": 8,
        "workerHours": null,
        "notes": "Plus traffic controllers",
        "roles": [
          {"role": "Formwork Carpenter", "count": 4, "notes": "Kev''s crew — kerb forms"},
          {"role": "Excavator Operator", "count": 1, "notes": "CAT 320, 3 hours"},
          {"role": "Roller Operator", "count": 1, "notes": "Bomag padfoot, 2 hours"},
          {"role": "Laborer", "count": 1, "notes": "General"},
          {"role": "Foreman", "count": 1, "notes": null}
        ]
      },
      "siteConditions": [
        {"topic": "Drainage", "details": "Trench flooded from overnight rain. 2 dewatering pumps (3-inch + 4-inch) ran most of the day. Trench workable by late morning."},
        {"topic": "Sub-base", "details": "100 mm stabilised sand sub-base laid and compacted to 99% standard Proctor. 40 tonnes delivered (2 truck and dogs)."},
        {"topic": "Traffic Control", "details": "TCP in place — 2 lanes closed, 1 open, 40 km/h zone. Approved previous week."}
      ],
      "activities": [
        {
          "name": "Kerb Formwork — Ch. 450–480",
          "location": "Southbound lane, ch. 450–480",
          "status": "completed",
          "summary": "30 m of kerb formwork set, checked against string line, all within tolerance. Grade confirmed spot-on. Ready for concrete pour.",
          "sourceNoteIndexes": [1, 7],
          "manpower": null,
          "materials": [
            {"name": "Stabilised sand", "quantity": "40 tonnes", "status": "placed & compacted", "notes": "98–99% standard Proctor"}
          ],
          "equipment": [
            {"name": "CAT 320 Excavator", "quantity": "1", "status": "operational", "hoursUsed": "3", "notes": null},
            {"name": "Bomag padfoot roller", "quantity": "1", "status": "operational", "hoursUsed": "2", "notes": null},
            {"name": "Dewatering pumps", "quantity": "2", "status": "operational", "hoursUsed": "8", "notes": "3-inch + 4-inch"}
          ],
          "issues": [],
          "observations": ["Compaction test: 99% standard Proctor — passed"]
        }
      ],
      "issues": [
        {
          "title": "Unmarked Telstra conduit at ch. 480",
          "category": "services",
          "severity": "high",
          "status": "open",
          "details": "Telstra pit and conduit discovered at chainage 478–485 running diagonally across alignment. Only 300 mm deep — too shallow. Not shown on any plans. Locator confirmed. Could delay works in that section by 2+ days.",
          "actionRequired": "Telstra representative required on-site to discuss relocation or protection. PM and client notified.",
          "sourceNoteIndexes": [5]
        }
      ],
      "nextSteps": [
        "Concrete pour on first 30 m section (weather permitting)",
        "Telstra rep to attend site for conduit resolution",
        "Continue formwork from ch. 520 to 600 (surveyor pegged)",
        "Night shift line marking on northbound lanes"
      ],
      "sections": []
    }
  }'::jsonb,
  '2026-03-15 17:00:00+00'
);

-- ============================================================
-- 6) Reports — Elm Street Renovation (Sarah)
-- ============================================================

insert into public.reports (
  id, project_id, owner_id, title, report_type, status, visit_date, confidence,
  notes, report_data, created_at
) values (
  'dd000002-0000-0000-0000-000000000002',
  'bbbb0002-0000-0000-0000-000000000002',
  '22222222-2222-2222-2222-222222222222',
  'Site Visit — Kitchen Demo',
  'site_visit', 'final', '2026-03-14', 85,
  array[
    'at the house on elm st just me and Mick doing demolition in the kitchen',
    'ripped out all the old cabinets found some asbestos looking stuff behind splashback',
    'Mick reckons its just old fibro sheeting leaving it for testing',
    'floor in rough shape old tile adhesive stuck everywhere need to grind it',
    'found old knob and tube wiring behind dining room wall needs to go',
    'client wants to keep original hardwood window frame in kitchen',
    'Mick cut his hand on sheet metal minor first aid applied'
  ],
  '{
    "report": {
      "meta": {
        "title": "Site Visit — Kitchen Demo",
        "reportType": "site_visit",
        "summary": "Kitchen demolition substantially complete. Suspected asbestos-containing material (fibro sheeting) found behind splashback — sample sent to lab, results due Thursday. Old knob-and-tube wiring discovered in dining room wall — electrician booked for Wednesday. Floor grinding needed for adhesive removal. Minor first-aid incident (hand cut).",
        "visitDate": "2026-03-14"
      },
      "weather": {
        "conditions": "Sunny",
        "temperature": "22°C",
        "wind": "Light",
        "impact": null
      },
      "manpower": {
        "totalWorkers": 2,
        "workerHours": "16",
        "notes": null,
        "roles": [
          {"role": "Carpenter / Demolition", "count": 2, "notes": "Mike + Mick"}
        ]
      },
      "siteConditions": [
        {"topic": "Suspected Asbestos", "details": "Material behind kitchen splashback resembles fibro sheeting. Sample sent to lab — results expected Thursday. Area cordoned off, no work in that zone until cleared."},
        {"topic": "Wiring", "details": "Knob-and-tube wiring found behind dining room wall. Must be removed and replaced. Electrician scheduled Wednesday."},
        {"topic": "Floor Condition", "details": "Old tile adhesive bonded to substrate. Floor grinder hired from Kennards, pick-up tomorrow morning."}
      ],
      "activities": [
        {
          "name": "Kitchen Demolition",
          "location": "Kitchen",
          "status": "completed",
          "summary": "All old cabinets removed. Splashback stripped revealing suspected ACM. Floor tiles removed but adhesive residue remains. Client''s original hardwood window frame preserved in good condition.",
          "sourceNoteIndexes": [1, 2, 4, 6],
          "manpower": null,
          "materials": [],
          "equipment": [],
          "issues": [],
          "observations": ["~2 skip bins of demolition waste removed", "Hardwood window frame in good condition — to be retained per client request"]
        }
      ],
      "issues": [
        {
          "title": "Suspected asbestos behind splashback",
          "category": "safety",
          "severity": "high",
          "status": "open",
          "details": "Material behind kitchen splashback may contain asbestos. Sample collected and sent to lab for testing. No work to proceed in that area until results are received (Thursday).",
          "actionRequired": "Await lab results. If positive, engage licensed asbestos removalist.",
          "sourceNoteIndexes": [2, 3]
        },
        {
          "title": "Knob-and-tube wiring in dining room",
          "category": "safety",
          "severity": "high",
          "status": "open",
          "details": "Obsolete and dangerous knob-and-tube wiring discovered behind opened wall in dining room. Must be fully removed and replaced to current code.",
          "actionRequired": "Electrician booked for Wednesday. Photos sent to sparky for advance planning.",
          "sourceNoteIndexes": [5]
        },
        {
          "title": "Minor injury — hand cut",
          "category": "safety",
          "severity": "low",
          "status": "resolved",
          "details": "Mick sustained a minor cut to hand from sheet metal during demolition. First aid applied on site (bandage from ute kit). Continued working. Logged in site diary.",
          "actionRequired": null,
          "sourceNoteIndexes": [7]
        }
      ],
      "nextSteps": [
        "Pick up floor grinder from Kennards tomorrow AM",
        "Await asbestos test results (Thursday)",
        "Electrician on-site Wednesday for wiring removal",
        "Begin new kitchen wall framing (pending asbestos clearance)",
        "Plumber to review relocated sink position (client layout change #3)"
      ],
      "sections": []
    }
  }'::jsonb,
  '2026-03-14 15:00:00+00'
);

-- ============================================================
-- 7) Report for Riverside Bridge (Mike) — progress report
-- ============================================================

insert into public.reports (
  id, project_id, owner_id, title, report_type, status, visit_date, confidence,
  notes, report_data, created_at
) values (
  'cc000006-0000-0000-0000-000000000006',
  'aaaa0002-0000-0000-0000-000000000002',
  '11111111-1111-1111-1111-111111111111',
  'Monthly Progress Report — March',
  'progress', 'final', '2026-03-14', 92,
  array[
    'bridge deck repair 75% complete, on track for April 15 completion',
    'new expansion joints installed on south span',
    'concrete overlay on north span curing, 14 day break results pending',
    'traffic management plan updated for single lane closure next week'
  ],
  '{
    "report": {
      "meta": {
        "title": "Monthly Progress Report — March",
        "reportType": "progress",
        "summary": "Bridge deck repair 75% complete, on schedule for April 15 target. South span expansion joints installed. North span concrete overlay curing with 14-day break results pending. Traffic management updated for next phase.",
        "visitDate": "2026-03-14"
      },
      "weather": null,
      "manpower": {
        "totalWorkers": 10,
        "workerHours": null,
        "notes": "Average daily crew this month",
        "roles": [
          {"role": "Bridge Worker", "count": 6, "notes": null},
          {"role": "Traffic Controller", "count": 2, "notes": null},
          {"role": "Engineer", "count": 1, "notes": "Overlay inspection"},
          {"role": "Foreman", "count": 1, "notes": null}
        ]
      },
      "siteConditions": [
        {"topic": "Structural Condition", "details": "South span expansion joints fully replaced. North span overlay applied and curing."},
        {"topic": "Traffic", "details": "Current 2-lane closure to reduce to single-lane next week per updated TMP."}
      ],
      "activities": [
        {
          "name": "Expansion Joint Installation — South Span",
          "location": "South span",
          "status": "completed",
          "summary": "New expansion joints installed and sealed. Alignment verified by engineer.",
          "sourceNoteIndexes": [2],
          "manpower": null,
          "materials": [
            {"name": "Expansion joints", "quantity": "4", "status": "installed", "notes": null}
          ],
          "equipment": [],
          "issues": [],
          "observations": []
        },
        {
          "name": "Concrete Overlay — North Span",
          "location": "North span deck",
          "status": "in-progress",
          "summary": "Overlay applied and entering curing phase. 14-day cylinder break results expected end of March.",
          "sourceNoteIndexes": [3],
          "manpower": null,
          "materials": [
            {"name": "High-performance concrete overlay", "quantity": null, "status": "curing", "notes": "14-day break pending"}
          ],
          "equipment": [],
          "issues": [],
          "observations": []
        }
      ],
      "issues": [],
      "nextSteps": [
        "Await 14-day cylinder break results (north span overlay)",
        "Begin south span overlay prep",
        "Implement updated TMP for single-lane closure",
        "Target completion: April 15"
      ],
      "sections": []
    }
  }'::jsonb,
  '2026-03-14 17:00:00+00'
);
