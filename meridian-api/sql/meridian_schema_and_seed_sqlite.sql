-- Meridian Brokerage Group: Client Growth & Retention Copilot (SQLite version)
-- Schema + synthetic seed data | "as of" date = 2026-10-08 | 24 tables | 10 clients | 2 producers | 3 high / 4 medium / 3 low risk
-- Confidence %: evidence = source_score x recency; risk = min(0.98, best evidence + corroboration);
-- opportunity = min(0.75, 0.30 + explicit + sources + gap) x recency. See signals.confidence_breakdown.

-- Clears any aborted transaction left by an earlier failed run (a harmless warning if none is open)


DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS auth_credentials;
DROP TABLE IF EXISTS login_failures;
DROP TABLE IF EXISTS security_events;
DROP TABLE IF EXISTS access_rules;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS briefs;
DROP TABLE IF EXISTS contradictions;
DROP TABLE IF EXISTS evidence;
DROP TABLE IF EXISTS signals;
DROP TABLE IF EXISTS recency_bands;
DROP TABLE IF EXISTS source_reliability;
DROP TABLE IF EXISTS signal_rules;
DROP TABLE IF EXISTS commitments;
DROP TABLE IF EXISTS renewal_milestones;
DROP TABLE IF EXISTS timeline_events;
DROP TABLE IF EXISTS endorsements;
DROP TABLE IF EXISTS billing;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS service_cases;
DROP TABLE IF EXISTS activities;
DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS policies;
DROP TABLE IF EXISTS contacts;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS users;



-- ============ CORE ============
CREATE TABLE users (
  user_id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT,
  persona TEXT NOT NULL CHECK (persona IN ('producer','regional_leader')),
  region TEXT
);
CREATE TABLE accounts (
  account_id TEXT PRIMARY KEY, name TEXT NOT NULL, industry TEXT, city TEXT, state TEXT, region TEXT, segment TEXT,
  owner_user_id TEXT NOT NULL REFERENCES users(user_id),
  annual_premium NUMERIC(12,2), client_since INTEGER,
  risk_level TEXT CHECK (risk_level IN ('high','medium','low')),   -- cached roll-up of signals
  restricted_flag BOOLEAN NOT NULL DEFAULT 0,
  source_system TEXT, updated_at DATE
);
CREATE TABLE contacts (
  contact_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
  name TEXT, role TEXT, email TEXT, is_primary BOOLEAN DEFAULT 0
);
CREATE TABLE policies (
  policy_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
  policy_number TEXT, carrier TEXT, line_of_business TEXT, premium NUMERIC(12,2),
  effective_date DATE, renewal_date DATE,                 -- system of record (Guidewire PolicyCenter)
  crm_renewal_date DATE, crm_updated_at DATE,             -- Salesforce CRM copy, used to detect conflicts
  status TEXT DEFAULT 'active', source_system TEXT, updated_at DATE
);
CREATE TABLE claims (
  claim_id TEXT PRIMARY KEY, policy_id TEXT NOT NULL REFERENCES policies(policy_id),
  account_id TEXT NOT NULL REFERENCES accounts(account_id), claim_number TEXT,
  status TEXT NOT NULL CHECK (status IN ('open','closed')), loss_date DATE, reserve_amount NUMERIC(12,2),
  severity TEXT CHECK (severity IN ('high','medium','low')), summary TEXT, source_system TEXT, updated_at DATE
);
CREATE TABLE activities (
  activity_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
  user_id TEXT REFERENCES users(user_id), type TEXT, activity_date DATE, notes TEXT, source_system TEXT
);
CREATE TABLE service_cases (
  case_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
  policy_id TEXT REFERENCES policies(policy_id), case_number TEXT,
  status TEXT CHECK (status IN ('open','closed')), issue TEXT, category TEXT,
  opened_at DATE, resolved_at DATE, source_system TEXT, updated_at DATE
);
CREATE TABLE documents (
  doc_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
  type TEXT, title TEXT, content_text TEXT, uploaded_at DATE, source_system TEXT
);
CREATE TABLE billing (
  invoice_id TEXT PRIMARY KEY, policy_id TEXT NOT NULL REFERENCES policies(policy_id),
  account_id TEXT NOT NULL REFERENCES accounts(account_id), amount NUMERIC(12,2), due_date DATE,
  status TEXT CHECK (status IN ('paid','due','overdue')), source_system TEXT
);
CREATE TABLE endorsements (
  endorsement_id TEXT PRIMARY KEY, policy_id TEXT NOT NULL REFERENCES policies(policy_id),
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  status TEXT CHECK (status IN ('pending','completed')), description TEXT, requested_at DATE, source_system TEXT
);

-- ============ CLIENT INTELLIGENCE MODEL ============
CREATE TABLE timeline_events (
  event_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
  event_type TEXT, event_date DATE, title TEXT, ref_table TEXT, ref_id TEXT
);
CREATE TABLE renewal_milestones (
  milestone_id TEXT PRIMARY KEY, policy_id TEXT NOT NULL REFERENCES policies(policy_id),
  milestone TEXT, due_date DATE, status TEXT CHECK (status IN ('open','planned','done'))
);
CREATE TABLE commitments (
  commitment_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
  description TEXT, owner_user_id TEXT REFERENCES users(user_id), due_date DATE,
  status TEXT CHECK (status IN ('open','overdue','done')), source TEXT
);
CREATE TABLE signal_rules (                     -- config, not code: add a row to add a scenario
  rule_id TEXT PRIMARY KEY, name TEXT, signal_type TEXT CHECK (signal_type IN ('risk','opportunity','coverage_gap')),
  severity TEXT, condition_sql TEXT, is_fact BOOLEAN, min_evidence INTEGER, base_confidence NUMERIC(4,2),
  active BOOLEAN DEFAULT 1, description TEXT
);
CREATE TABLE source_reliability (source_system TEXT PRIMARY KEY, score NUMERIC(4,2) NOT NULL, note TEXT);
CREATE TABLE recency_bands (max_age_days INTEGER PRIMARY KEY, factor NUMERIC(4,2) NOT NULL);
CREATE TABLE signals (
  signal_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
  signal_type TEXT NOT NULL CHECK (signal_type IN ('risk','opportunity','coverage_gap')),
  category TEXT, title TEXT, description TEXT, severity TEXT CHECK (severity IN ('high','medium','low')),
  is_fact BOOLEAN NOT NULL, confidence NUMERIC(4,2), assumptions TEXT,
  rule_id TEXT REFERENCES signal_rules(rule_id), status TEXT DEFAULT 'active', created_at DATE,
  confidence_breakdown TEXT      -- JSON: how confidence was derived
);

-- ============ EVIDENCE, ACTIONS, GOVERNANCE ============
CREATE TABLE evidence (
  evidence_id TEXT PRIMARY KEY, signal_id TEXT NOT NULL REFERENCES signals(signal_id),
  source_table TEXT, source_id TEXT, source_system TEXT, snippet TEXT, recency_date DATE,
  source_score NUMERIC(4,2), recency_factor NUMERIC(4,2), confidence NUMERIC(4,2)   -- confidence = source_score x recency_factor
);
CREATE TABLE contradictions (
  contradiction_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
  policy_id TEXT REFERENCES policies(policy_id), field TEXT,
  value_a TEXT, source_a TEXT, value_b TEXT, source_b TEXT,
  status TEXT CHECK (status IN ('needs_review','resolved')), detected_at DATE, resolved_at DATE
);
CREATE TABLE briefs (
  brief_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
  persona TEXT, version INTEGER, generated_at DATETIME, content_json TEXT, model_version TEXT,
  completeness_check_passed BOOLEAN
);
CREATE TABLE audit_log (
  log_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  account_id TEXT REFERENCES accounts(account_id),
  persona TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'brief_generation',
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  cost_usd NUMERIC(8,6) NOT NULL DEFAULT 0.0,
  latency_ms INTEGER NOT NULL,
  completeness_passed BOOLEAN NOT NULL DEFAULT 1,
  blocked_flag BOOLEAN NOT NULL DEFAULT 0,
  block_reason TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE access_rules (
  user_id TEXT NOT NULL REFERENCES users(user_id),
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  allowed BOOLEAN NOT NULL DEFAULT 1,
  can_view_policies BOOLEAN NOT NULL DEFAULT 1,
  can_view_claims BOOLEAN NOT NULL DEFAULT 1,
  can_view_service_cases BOOLEAN NOT NULL DEFAULT 1,
  can_view_billing BOOLEAN NOT NULL DEFAULT 1,
  can_view_documents BOOLEAN NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, account_id)
);
CREATE INDEX idx_policies_acct ON policies(account_id, renewal_date);
CREATE INDEX idx_claims_acct ON claims(account_id, status);
CREATE INDEX idx_signals_acct ON signals(account_id, signal_type);
CREATE INDEX idx_evidence_sig ON evidence(signal_id);

-- ============ SEED DATA ============

INSERT INTO users (user_id,name,email,persona,region) VALUES
('U1','Jordan Davis','jordan.davis@meridian.example','producer','Midwest'),
('U2','Priya Nair','priya.nair@meridian.example','producer','Midwest'),
('U5','Morgan Hayes','morgan.hayes@meridian.example','regional_leader','Midwest');

INSERT INTO accounts (account_id,name,industry,city,state,region,segment,owner_user_id,annual_premium,client_since,risk_level,restricted_flag,source_system,updated_at) VALUES
('A01','Riverside Manufacturing','Manufacturing','Dayton','OH','Midwest','Mid-market','U1',1200000.00,2018,'high',0,'Salesforce CRM','2026-09-28'),
('A02','Horizon Health Systems','Healthcare','Columbus','OH','Midwest','Large','U1',850000.00,2016,'high',0,'Salesforce CRM','2026-10-01'),
('A03','Pinecrest Retail Group','Retail','Pittsburgh','PA','Midwest','Mid-market','U1',430000.00,2020,'medium',0,'Salesforce CRM','2026-10-02'),
('A04','Summit Construction','Construction','Indianapolis','IN','Midwest','Mid-market','U2',620000.00,2019,'medium',0,'Salesforce CRM','2026-09-22'),
('A05','Harbor Marine Partners','Marine','Boston','MA','Northeast','Mid-market','U2',450000.00,2017,'medium',1,'Salesforce CRM','2026-09-29'),
('A06','Northwind Foods','Food Processing','Louisville','KY','Midwest','Mid-market','U2',720000.00,2015,'high',0,'Salesforce CRM','2026-10-01'),
('A07','Cedar Logistics','Transportation','Cincinnati','OH','Midwest','Mid-market','U2',480000.00,2021,'medium',0,'Salesforce CRM','2026-09-30'),
('A08','Lakeside Hospitality','Hospitality','Cleveland','OH','Midwest','Small','U1',310000.00,2022,'low',0,'Salesforce CRM','2026-06-05'),
('A09','Maple Tech Solutions','Technology','Columbus','OH','Midwest','Mid-market','U1',540000.00,2020,'low',0,'Salesforce CRM','2026-08-20'),
('A10','BrightPath Education','Education','Indianapolis','IN','Midwest','Small','U2',290000.00,2019,'low',0,'Salesforce CRM','2026-07-10');

INSERT INTO contacts (contact_id,account_id,name,role,email,is_primary) VALUES
('CT01','A01','Sarah Mitchell','CFO','sarah.mitchell@riverside.example',1),
('CT02','A01','Glen Ortiz','Risk Manager','glen.ortiz@riverside.example',0),
('CT03','A02','Marcus Reed','CFO','marcus.reed@horizonhealth.example',1),
('CT04','A03','Linda Park','VP Finance','linda.park@pinecrest.example',1),
('CT05','A04','Tom Alvarez','Controller','tom.alvarez@summitbuild.example',1),
('CT06','A05','Ingrid Olsen','COO','ingrid.olsen@harbormarine.example',1),
('CT07','A06','Rachel Cohen','CFO','rachel.cohen@northwindfoods.example',1),
('CT08','A07','Derek Wu','Fleet Director','derek.wu@cedarlogistics.example',1),
('CT09','A08','Maria Santos','General Manager','maria.santos@lakeside.example',1),
('CT10','A09','Aisha Khan','CFO','aisha.khan@mapletech.example',1),
('CT11','A10','Paul Weber','Business Manager','paul.weber@brightpath.example',1);

INSERT INTO policies (policy_id,account_id,policy_number,carrier,line_of_business,premium,effective_date,renewal_date,crm_renewal_date,crm_updated_at,status,source_system,updated_at) VALUES
('P01','A01','PA-77821','Northgate Mutual','Property',620000.00,'2025-10-20','2026-10-20','2026-10-25','2026-08-28','active','Guidewire PolicyCenter','2026-09-01'),
('P02','A01','GL-55120','Atlas Casualty','General Liability',380000.00,'2025-11-15','2026-11-15',NULL,NULL,'active','Guidewire PolicyCenter','2026-09-01'),
('P03','A01','WC-30441','Keystone Re','Workers Comp',200000.00,'2025-12-01','2026-12-01',NULL,NULL,'active','Guidewire PolicyCenter','2026-09-01'),
('P04','A02','PL-88102','Atlas Casualty','Professional Liability',520000.00,'2025-10-26','2026-10-26',NULL,NULL,'active','Guidewire PolicyCenter','2026-09-20'),
('P05','A02','PA-88377','Northgate Mutual','Property',330000.00,'2025-11-10','2026-11-10',NULL,NULL,'active','Guidewire PolicyCenter','2026-09-20'),
('P06','A03','PA-66120','Pioneer Specialty','Property',260000.00,'2025-11-12','2026-11-12',NULL,NULL,'active','Guidewire PolicyCenter','2026-10-01'),
('P07','A03','GL-66188','Atlas Casualty','General Liability',170000.00,'2025-11-30','2026-11-30',NULL,NULL,'active','Guidewire PolicyCenter','2026-10-01'),
('P08','A04','BR-55901','Keystone Re','Builders Risk',400000.00,'2025-11-05','2026-11-05',NULL,NULL,'active','Guidewire PolicyCenter','2026-09-18'),
('P09','A04','WC-55977','Keystone Re','Workers Comp',220000.00,'2025-12-15','2026-12-15',NULL,NULL,'active','Guidewire PolicyCenter','2026-09-18'),
('P10','A05','MC-33010','Pioneer Specialty','Marine Cargo',450000.00,'2025-11-22','2026-11-22',NULL,NULL,'active','Guidewire PolicyCenter','2026-09-29'),
('P11','A06','PA-77300','Northgate Mutual','Property',450000.00,'2025-10-30','2026-10-30','2026-11-04','2026-08-30','active','Guidewire PolicyCenter','2026-09-10'),
('P12','A06','PR-77355','Atlas Casualty','Product Liability',270000.00,'2025-12-10','2026-12-10',NULL,NULL,'active','Guidewire PolicyCenter','2026-09-10'),
('P13','A07','CA-44200','Atlas Casualty','Commercial Auto Fleet',480000.00,'2025-12-18','2026-12-18',NULL,NULL,'active','Guidewire PolicyCenter','2026-09-30'),
('P14','A08','PA-22010','Pioneer Specialty','Property',190000.00,'2026-02-14','2027-02-14',NULL,NULL,'active','Guidewire PolicyCenter','2026-02-14'),
('P15','A08','GL-22044','Atlas Casualty','General Liability',120000.00,'2026-02-14','2027-02-14',NULL,NULL,'active','Guidewire PolicyCenter','2026-02-14'),
('P16','A09','CY-11080','Keystone Re','Cyber',140000.00,'2026-03-01','2027-03-01',NULL,NULL,'active','Guidewire PolicyCenter','2026-03-01'),
('P17','A09','PA-11095','Northgate Mutual','Property',400000.00,'2026-01-20','2027-01-20',NULL,NULL,'active','Guidewire PolicyCenter','2026-01-20'),
('P18','A10','PA-90015','Pioneer Specialty','Property',290000.00,'2026-03-15','2027-03-15',NULL,NULL,'active','Guidewire PolicyCenter','2024-09-15');

INSERT INTO claims (claim_id,policy_id,account_id,claim_number,status,loss_date,reserve_amount,severity,summary,source_system,updated_at) VALUES
('C01','P01','A01','CLM-99231','open','2026-02-10',185000.00,'high','Water damage to production line; adjuster review pending','Guidewire ClaimCenter','2026-09-28'),
('C02','P04','A02','CLM-88410','open','2026-05-02',940000.00,'high','Malpractice allegation; litigation in discovery','Guidewire ClaimCenter','2026-10-01'),
('C03','P05','A02','CLM-88477','closed','2026-01-18',42000.00,'low','Roof leak, settled','Guidewire ClaimCenter','2026-03-10'),
('C04','P11','A06','CLM-77305','open','2026-07-21',310000.00,'high','Cold-storage spoilage after equipment failure','Guidewire ClaimCenter','2026-09-30'),
('C05','P06','A03','CLM-66120','open','2026-08-30',58000.00,'medium','Storefront break-in theft','Guidewire ClaimCenter','2026-10-02'),
('C06','P08','A04','CLM-55904','open','2026-06-12',120000.00,'medium','Crane damage on site','Guidewire ClaimCenter','2026-09-18'),
('C07','P13','A07','CLM-44218','closed','2026-03-05',36000.00,'low','Vehicle collision, closed','Guidewire ClaimCenter','2026-05-01'),
('C08','P10','A05','CLM-33077','open','2026-08-14',205000.00,'medium','Cargo delay and partial loss','Guidewire ClaimCenter','2026-09-29'),
('C09','P14','A08','CLM-22091','closed','2025-11-20',15000.00,'low','Kitchen fire, minor, closed','Guidewire ClaimCenter','2026-01-10');

INSERT INTO activities (activity_id,account_id,user_id,type,activity_date,notes,source_system) VALUES
('ACT01','A01','U1','meeting','2026-09-10','Quarterly review with Sarah Mitchell: new facility, COI request, concern about claim update pace','Salesforce CRM'),
('ACT02','A01','U1','call','2026-09-26','Called about service escalation; promised COI follow-up','Salesforce CRM'),
('ACT03','A02','U1','meeting','2026-09-18','Reviewed claim status and EHR migration plans with CFO','Salesforce CRM'),
('ACT04','A03','U1','email','2026-10-02','Sent update on theft claim and pop-up location request','Salesforce CRM'),
('ACT05','A04','U2','meeting','2026-09-22','Discussed claim and upcoming hospital bid','Salesforce CRM'),
('ACT06','A05','U2','call','2026-09-29','Cargo claim update call','Salesforce CRM'),
('ACT07','A06','U2','call','2026-10-01','Billing dispute call; client frustrated with invoice','Salesforce CRM'),
('ACT08','A07','U2','meeting','2026-09-30','Fleet growth discussion; mentioned EV pilot once','Salesforce CRM'),
('ACT09','A08','U1','meeting','2026-03-15','Last renewal review','Salesforce CRM'),
('ACT10','A09','U1','meeting','2026-08-20','Price sensitivity raised after last cyber renewal; hiring engineers, launching new SaaS product','Salesforce CRM'),
('ACT11','A10','U2','email','2026-07-10','Annual check-in email; no response','Salesforce CRM'),
('ACT12','A08','U1','email','2026-06-05','Mentioned new banquet hall with bar service','Salesforce CRM');

INSERT INTO service_cases (case_id,account_id,policy_id,case_number,status,issue,category,opened_at,resolved_at,source_system,updated_at) VALUES
('S01','A01','P01','SRV-38190','open','Client escalated slow response on claim updates','Claims Handling','2026-09-24',NULL,'ServiceNow','2026-09-26'),
('S02','A02','P04','SRV-38244','open','Certificate requests delayed','Certificates','2026-09-30',NULL,'ServiceNow','2026-10-01'),
('S03','A06','P11','SRV-38301','open','Billing dispute on installment','Billing','2026-09-15',NULL,'ServiceNow','2026-10-01'),
('S04','A03','P06','SRV-38102','closed','Endorsement turnaround complaint','Policy Service','2026-08-10','2026-08-25','ServiceNow','2026-08-25'),
('S05','A04','P08','SRV-38155','open','Missing COI for subcontractor','Certificates','2026-09-18',NULL,'ServiceNow','2026-09-22'),
('S06','A07','P13','SRV-37990','closed','ID cards reissued','Policy Service','2026-07-01','2026-07-03','ServiceNow','2026-07-03'),
('S07','A09','P16','SRV-38010','closed','Policy document copy','Policy Service','2026-07-20','2026-07-21','ServiceNow','2026-07-21'),
('S08','A05','P10','SRV-38320','open','Cargo survey scheduling','Risk Services','2026-10-01',NULL,'ServiceNow','2026-10-02');

INSERT INTO documents (doc_id,account_id,type,title,content_text,uploaded_at,source_system) VALUES
('D01','A01','meeting_note','Riverside Q3 review notes','New facility opening Q1 2027. Client requested COI and is unhappy with claim update pace. No cyber discussion on record.','2026-09-10','Document Store'),
('D02','A02','meeting_note','Horizon claim and IT review','EHR system migration planned for 2027. CFO asked general questions about cyber exposure.','2026-09-18','Document Store'),
('D03','A06','plan','Northwind expansion plan','Second cold-storage warehouse planned for early 2027; refrigeration equipment vendor selected.','2026-08-12','Document Store'),
('D04','A03','email','Pinecrest holiday plans','Pop-up store planned for the holiday season at a mall kiosk.','2026-09-30','Document Store'),
('D05','A09','meeting_note','Maple Tech growth notes','Hiring 25 engineers; launching a new SaaS product in 2027; board expansion mentioned. No D&O data on file.','2026-08-20','Document Store'),
('D06','A07','meeting_note','Cedar fleet notes','Adding 6 vehicles. EV pilot mentioned once in passing.','2026-09-30','Document Store'),
('D07','A08','meeting_note','Lakeside renovation','Spa renovation planned; property values may change.','2026-06-05','Document Store'),
('D08','A10','meeting_note','BrightPath campus plans','New STEM building planned for 2027.','2026-07-10','Document Store'),
('D09','A04','email','Summit bid notice','Company is bidding on a hospital construction project.','2026-09-22','Document Store'),
('D10','A05','survey_report','Harbor marine survey (restricted)','Confidential marine survey notes on higher-value cargo routes.','2026-09-15','Document Store');

INSERT INTO billing (invoice_id,policy_id,account_id,amount,due_date,status,source_system) VALUES
('B01','P01','A01',155000.00,'2026-09-01','paid','Billing System'),
('B02','P04','A02',130000.00,'2026-09-15','paid','Billing System'),
('B03','P11','A06',112500.00,'2026-09-30','overdue','Billing System'),
('B04','P06','A03',65000.00,'2026-10-15','due','Billing System'),
('B05','P08','A04',100000.00,'2026-09-20','paid','Billing System'),
('B06','P10','A05',112500.00,'2026-10-01','paid','Billing System'),
('B07','P13','A07',120000.00,'2026-10-10','due','Billing System'),
('B08','P14','A08',47500.00,'2026-08-15','paid','Billing System'),
('B09','P16','A09',35000.00,'2026-09-01','paid','Billing System'),
('B10','P18','A10',72500.00,'2026-09-30','paid','Billing System');

INSERT INTO endorsements (endorsement_id,policy_id,account_id,status,description,requested_at,source_system) VALUES
('E01','P01','A01','pending','Updated property values for new facility','2026-09-12','Guidewire PolicyCenter'),
('E02','P04','A02','pending','Add locum physicians','2026-09-20','Guidewire PolicyCenter'),
('E03','P11','A06','pending','Add second cold-storage location','2026-09-05','Guidewire PolicyCenter'),
('E04','P08','A04','completed','Add project site','2026-07-01','Guidewire PolicyCenter'),
('E05','P06','A03','pending','Add pop-up store location','2026-10-01','Guidewire PolicyCenter'),
('E06','P16','A09','completed','Raise cyber limit','2026-03-01','Guidewire PolicyCenter'),
('E07','P13','A07','pending','Add 6 vehicles','2026-10-02','Guidewire PolicyCenter');

INSERT INTO timeline_events (event_id,account_id,event_type,event_date,title,ref_table,ref_id) VALUES
('TL01','A01','claim_opened','2026-02-10','Property claim CLM-99231 opened','claims','C01'),
('TL02','A01','meeting','2026-09-10','Quarterly review','activities','ACT01'),
('TL03','A01','service_escalation','2026-09-24','Service escalation SRV-38190','service_cases','S01'),
('TL04','A02','claim_opened','2026-05-02','Professional liability claim CLM-88410 opened','claims','C02'),
('TL05','A02','service_case','2026-09-30','Certificate delay SRV-38244','service_cases','S02'),
('TL06','A06','claim_opened','2026-07-21','Spoilage claim CLM-77305 opened','claims','C04'),
('TL07','A06','billing_overdue','2026-09-30','Invoice B03 overdue','billing','B03'),
('TL08','A03','claim_opened','2026-08-30','Theft claim CLM-66120 opened','claims','C05'),
('TL09','A04','commitment_overdue','2026-10-02','Subcontractor COI overdue','commitments','CM07'),
('TL10','A05','claim_opened','2026-08-14','Cargo claim CLM-33077 opened','claims','C08'),
('TL11','A09','meeting','2026-08-20','Growth and pricing discussion','activities','ACT10'),
('TL12','A07','endorsement_requested','2026-10-02','Add 6 vehicles','endorsements','E07');

INSERT INTO renewal_milestones (milestone_id,policy_id,milestone,due_date,status) VALUES
('M01','P01','Updated property values received','2026-10-13','open'),
('M02','P01','Renewal submission to carrier','2026-10-15','open'),
('M03','P04','Underwriting information due','2026-10-12','open'),
('M04','P11','Loss runs requested','2026-10-14','open'),
('M05','P08','Renewal meeting','2026-10-22','planned'),
('M06','P10','Cargo survey completed','2026-10-20','open'),
('M07','P06','Marketing to carriers','2026-10-25','planned'),
('M08','P13','Fleet schedule update','2026-11-01','open'),
('M09','P14','Renewal kickoff','2026-12-01','planned'),
('M10','P16','Renewal kickoff','2027-01-15','planned');

INSERT INTO commitments (commitment_id,account_id,description,owner_user_id,due_date,status,source) VALUES
('CM01','A01','Provide COI for new facility','U1','2026-09-25','overdue','ACT01'),
('CM02','A01','Follow up on workers comp audit','U1','2026-10-13','open','ACT01'),
('CM03','A01','Share cyber coverage options','U1','2026-10-18','open','ACT02'),
('CM04','A02','Send claim status summary to CFO','U1','2026-10-10','open','ACT03'),
('CM05','A02','Confirm locum endorsement terms','U1','2026-10-14','open','ACT03'),
('CM06','A03','Quote pop-up location','U1','2026-10-20','open','ACT04'),
('CM07','A04','Issue subcontractor COI','U2','2026-10-02','overdue','ACT05'),
('CM08','A05','Schedule cargo survey','U2','2026-10-15','open','ACT06'),
('CM09','A06','Resolve billing dispute','U2','2026-10-05','overdue','ACT07'),
('CM10','A07','Quote 6 added vehicles','U2','2026-10-16','open','ACT08'),
('CM11','A08','Send renewal timeline','U1','2026-12-01','open','ACT09'),
('CM12','A09','Share Tech E&O options','U1','2026-11-10','open','ACT10'),
('CM13','A10','Annual stewardship meeting','U2','2026-11-20','open','ACT11');

INSERT INTO signal_rules (rule_id,name,signal_type,severity,condition_sql,is_fact,min_evidence,base_confidence,active,description) VALUES
('R1','open_claim_near_renewal','risk','high','SELECT c.claim_id FROM claims c JOIN policies p ON p.policy_id=c.policy_id WHERE c.status=''open'' AND p.renewal_date - DATE ''2026-10-08'' <= 60',1,1,0.80,1,'Open claim on a policy renewing within 60 days'),
('R2','conflicting_renewal_dates','risk','medium','SELECT policy_id FROM policies WHERE crm_renewal_date IS NOT NULL AND crm_renewal_date<>renewal_date',1,2,0.65,1,'Renewal date differs between Policy Admin and CRM'),
('R3','unresolved_endorsement','risk','medium','SELECT endorsement_id FROM endorsements WHERE status=''pending''',1,1,0.70,1,'Pending endorsement before renewal'),
('R4','service_escalation','risk','medium','SELECT case_id FROM service_cases WHERE status=''open''',1,1,0.60,1,'Open service case'),
('R5','opportunity_hypothesis','opportunity','medium','keyword match in documents/activities vs missing coverage; confidence scales with evidence count',0,1,0.30,1,'Opportunity suggestion; never presented as fact'),
('R6','overdue_commitment','risk','medium','SELECT commitment_id FROM commitments WHERE status=''overdue''',1,1,0.90,1,'Commitment past due'),
('R7','billing_overdue','risk','medium','SELECT invoice_id FROM billing WHERE status=''overdue''',1,1,0.80,1,'Overdue invoice'),
('R8','stale_engagement','risk','low','SELECT account_id FROM activities GROUP BY account_id HAVING DATE ''2026-10-08'' - MAX(activity_date) > 180',1,1,0.55,1,'No logged meeting in 180+ days'),
('R9','client_note_risk','risk','low','keyword match (price, unhappy, concern) in activities/documents',1,1,0.55,1,'Risk language in client notes'),
('R10','stale_policy_data','risk','low','SELECT policy_id FROM policies WHERE DATE ''2026-10-08'' - updated_at > 540',1,1,0.55,1,'Policy data not updated in 18+ months');

INSERT INTO source_reliability (source_system,score,note) VALUES
('Guidewire ClaimCenter',0.95,'Claims system of record'),
('Guidewire PolicyCenter',0.95,'Policy system of record'),
('Billing System',0.90,'Finance system of record'),
('ServiceNow',0.85,'Service case system'),
('Salesforce CRM',0.75,'CRM copy; may lag systems of record'),
('Document Store',0.60,'Notes, emails, plans; unstructured');

INSERT INTO recency_bands (max_age_days,factor) VALUES
(30,1.00),
(90,0.90),
(180,0.80),
(99999,0.65);

INSERT INTO signals (signal_id,account_id,signal_type,category,title,description,severity,is_fact,confidence,assumptions,rule_id,status,created_at,confidence_breakdown) VALUES
('SG01','A01','risk','claims','Open property claim before renewal','Claim CLM-99231 from Feb 2026 remains open; renewal in 12 days.','high',1,0.95,NULL,'R1','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.95,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG02','A01','risk','endorsement','Unresolved property endorsement','Updated property values not yet processed.','medium',1,0.95,NULL,'R3','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.95,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG03','A01','risk','service','Recent service escalation','Client raised response-time concerns on claim updates.','medium',1,0.85,NULL,'R4','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.85,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG04','A01','risk','data_conflict','Conflicting renewal dates','Policy Admin shows Oct 20, CRM shows Oct 25.','medium',1,0.68,NULL,'R2','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.68,"corroboration":0,"conflict_uses_weaker_source":true}'),
('SG05','A01','opportunity','cyber','Cyber coverage for new facility','New facility may increase cyber exposure.','low',0,0.40,'Assumes the facility adds networked equipment; not confirmed with client','R5','active','2026-10-08','{"type":"opportunity","formula":"min(0.75, 0.30 + explicit + sources + gap) x recency","base":0.3,"explicit":0.0,"extra_sources":0.0,"coverage_gap":0.1,"cap":0.75,"recency":1.0}'),
('SG06','A01','opportunity','environmental','Environmental liability review','Expansion may create environmental exposure.','low',0,0.30,'Assumes manufacturing activity at new site; current environmental coverage not verified','R5','active','2026-10-08','{"type":"opportunity","formula":"min(0.75, 0.30 + explicit + sources + gap) x recency","base":0.3,"explicit":0.0,"extra_sources":0.0,"coverage_gap":0.0,"cap":0.75,"recency":1.0}'),
('SG07','A02','risk','claims','Open professional liability claim','Claim CLM-88410 is in litigation; renewal in 18 days.','high',1,0.95,NULL,'R1','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.95,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG08','A02','risk','endorsement','Locum endorsement pending near renewal','Endorsement pending while underwriting info is due Oct 12.','medium',1,0.95,NULL,'R3','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.95,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG09','A02','opportunity','cyber','Cyber coverage for EHR migration','EHR migration and CFO questions suggest cyber interest.','medium',0,0.60,'Assumes migration happens as planned','R5','active','2026-10-08','{"type":"opportunity","formula":"min(0.75, 0.30 + explicit + sources + gap) x recency","base":0.3,"explicit":0.2,"extra_sources":0.0,"coverage_gap":0.1,"cap":0.75,"recency":1.0}'),
('SG10','A03','risk','claims','Open theft claim','Claim CLM-66120 is open ahead of Nov 12 renewal.','medium',1,0.95,NULL,'R1','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.95,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG11','A03','risk','endorsement','Pop-up location endorsement pending','Pending since Oct 1 with invoice due Oct 15.','low',1,0.95,NULL,'R3','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.95,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG12','A03','opportunity','business_interruption','Coverage for pop-up store','Seasonal location may need extra coverage.','medium',0,0.50,'Assumes pop-up is not covered by current schedule','R5','active','2026-10-08','{"type":"opportunity","formula":"min(0.75, 0.30 + explicit + sources + gap) x recency","base":0.3,"explicit":0.2,"extra_sources":0.0,"coverage_gap":0.0,"cap":0.75,"recency":1.0}'),
('SG13','A04','risk','commitment','Overdue subcontractor COI','COI promised by Oct 2 is overdue; open service case SRV-38155.','medium',1,0.75,NULL,'R6','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.75,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG14','A04','risk','claims','Open crane damage claim','Claim CLM-55904 open; renewal Nov 5.','medium',1,0.95,NULL,'R1','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.95,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG15','A04','opportunity','contractors_pollution','Coverage for hospital project bid','Hospital work may need added professional or pollution cover.','medium',0,0.50,'Assumes the bid is won; scope unknown','R5','active','2026-10-08','{"type":"opportunity","formula":"min(0.75, 0.30 + explicit + sources + gap) x recency","base":0.3,"explicit":0.2,"extra_sources":0.0,"coverage_gap":0.0,"cap":0.75,"recency":1.0}'),
('SG16','A05','risk','claims','Open cargo claim','Claim CLM-33077 open; renewal Nov 22.','medium',1,0.95,NULL,'R1','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.95,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG17','A05','risk','service','Cargo survey scheduling open','Open service case SRV-38320.','low',1,0.85,NULL,'R4','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.85,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG18','A05','opportunity','excess_marine','Excess marine liability','Survey suggests higher-value cargo routes.','low',0,0.30,'Based on one survey mention only','R5','active','2026-10-08','{"type":"opportunity","formula":"min(0.75, 0.30 + explicit + sources + gap) x recency","base":0.3,"explicit":0.0,"extra_sources":0.0,"coverage_gap":0.0,"cap":0.75,"recency":1.0}'),
('SG19','A06','risk','claims','Open spoilage claim','Claim CLM-77305 open; renewal Oct 30.','high',1,0.95,NULL,'R1','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.95,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG20','A06','risk','data_conflict','Conflicting renewal dates','Policy Admin shows Oct 30, CRM shows Nov 4.','medium',1,0.68,NULL,'R2','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.68,"corroboration":0,"conflict_uses_weaker_source":true}'),
('SG21','A06','risk','billing','Overdue invoice and dispute','Invoice B03 overdue; billing dispute SRV-38301 open.','medium',1,0.90,NULL,'R7','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.9,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG22','A06','opportunity','equipment_breakdown','Equipment breakdown for new warehouse','Second cold-storage site and vendor selection noted.','medium',0,0.45,'Assumes equipment is not already scheduled on a policy','R5','active','2026-10-08','{"type":"opportunity","formula":"min(0.75, 0.30 + explicit + sources + gap) x recency","base":0.3,"explicit":0.2,"extra_sources":0.0,"coverage_gap":0.0,"cap":0.75,"recency":0.9}'),
('SG23','A07','risk','endorsement','Fleet endorsement pending near renewal','Six vehicles pending before Dec 18 renewal.','medium',1,0.95,NULL,'R3','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.95,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG24','A07','opportunity','motor_truck_cargo','Motor truck cargo review','Fleet growth may raise cargo exposure.','low',0,0.30,'Cargo coverage status not verified','R5','active','2026-10-08','{"type":"opportunity","formula":"min(0.75, 0.30 + explicit + sources + gap) x recency","base":0.3,"explicit":0.0,"extra_sources":0.0,"coverage_gap":0.0,"cap":0.75,"recency":1.0}'),
('SG25','A07','opportunity','specialty_fleet','EV pilot coverage','EV pilot mentioned once in passing.','low',0,0.30,'Single mention; no plan confirmed','R5','active','2026-10-08','{"type":"opportunity","formula":"min(0.75, 0.30 + explicit + sources + gap) x recency","base":0.3,"explicit":0.0,"extra_sources":0.0,"coverage_gap":0.0,"cap":0.75,"recency":1.0}'),
('SG26','A08','risk','engagement','No recent client meeting','Last logged meeting was 207 days ago.','low',1,0.49,NULL,'R8','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.49,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG27','A08','opportunity','property','Property values after renovation','Spa renovation may change insured values.','low',0,0.40,'Assumes renovation increases property value','R5','active','2026-10-08','{"type":"opportunity","formula":"min(0.75, 0.30 + explicit + sources + gap) x recency","base":0.3,"explicit":0.2,"extra_sources":0.0,"coverage_gap":0.0,"cap":0.75,"recency":0.8}'),
('SG28','A08','opportunity','liquor_liability','Liquor liability review','Banquet hall with bar service mentioned once.','low',0,0.24,'Single mention; no liquor liability data on file','R5','active','2026-10-08','{"type":"opportunity","formula":"min(0.75, 0.30 + explicit + sources + gap) x recency","base":0.3,"explicit":0.0,"extra_sources":0.0,"coverage_gap":0.0,"cap":0.75,"recency":0.8}'),
('SG29','A09','risk','pricing','Price sensitivity at last renewal','Client raised pricing concerns after the cyber renewal.','low',1,0.68,NULL,'R9','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.68,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG30','A09','opportunity','tech_eo','Tech E&O for new SaaS product','New product launch and hiring plan are documented in two sources.','medium',0,0.63,'Assumes launch stays on schedule','R5','active','2026-10-08','{"type":"opportunity","formula":"min(0.75, 0.30 + explicit + sources + gap) x recency","base":0.3,"explicit":0.2,"extra_sources":0.1,"coverage_gap":0.1,"cap":0.75,"recency":0.9}'),
('SG31','A09','opportunity','d_and_o','Directors and officers review','Board expansion mentioned.','low',0,0.36,'No D&O data on file','R5','active','2026-10-08','{"type":"opportunity","formula":"min(0.75, 0.30 + explicit + sources + gap) x recency","base":0.3,"explicit":0.0,"extra_sources":0.0,"coverage_gap":0.1,"cap":0.75,"recency":0.9}'),
('SG32','A10','risk','data_quality','Insured values may be stale','Property policy data last updated Sept 2024.','low',1,0.62,NULL,'R10','active','2026-10-08','{"type":"risk","formula":"min(0.98, evidence_confidence + corroboration)","evidence_confidence":0.62,"corroboration":0.0,"conflict_uses_weaker_source":false}'),
('SG33','A10','opportunity','property','Coverage for new STEM building','New building planned for 2027.','medium',0,0.45,'Assumes building is added to existing property schedule','R5','active','2026-10-08','{"type":"opportunity","formula":"min(0.75, 0.30 + explicit + sources + gap) x recency","base":0.3,"explicit":0.2,"extra_sources":0.0,"coverage_gap":0.0,"cap":0.75,"recency":0.9}');

INSERT INTO evidence (evidence_id,signal_id,source_table,source_id,source_system,snippet,recency_date,source_score,recency_factor,confidence) VALUES
('EV01','SG01','claims','C01','Guidewire ClaimCenter','Claim CLM-99231 open since 2026-02-10; reserve $185,000','2026-09-28',0.95,1.00,0.95),
('EV02','SG02','endorsements','E01','Guidewire PolicyCenter','Endorsement for updated property values requested 2026-09-12, still pending','2026-09-12',0.95,1.00,0.95),
('EV03','SG03','service_cases','S01','ServiceNow','Client escalated slow response on claim updates','2026-09-24',0.85,1.00,0.85),
('EV04','SG04','policies','P01','Guidewire PolicyCenter','Renewal date 2026-10-20','2026-09-01',0.95,0.90,0.86),
('EV05','SG04','policies','P01','Salesforce CRM','Opportunity OPP-44321 shows renewal 2026-10-25','2026-08-28',0.75,0.90,0.68),
('EV06','SG05','documents','D01','Document Store','New facility opening Q1 2027; no cyber discussion on record','2026-09-10',0.60,1.00,0.60),
('EV07','SG06','documents','D01','Document Store','Expansion noted; environmental coverage status not verified','2026-09-10',0.60,1.00,0.60),
('EV08','SG07','claims','C02','Guidewire ClaimCenter','Claim CLM-88410 open; litigation in discovery','2026-10-01',0.95,1.00,0.95),
('EV09','SG08','endorsements','E02','Guidewire PolicyCenter','Locum endorsement pending since 2026-09-20; underwriting info due 2026-10-12','2026-09-20',0.95,1.00,0.95),
('EV10','SG09','documents','D02','Document Store','EHR migration planned; CFO asked about cyber exposure','2026-09-18',0.60,1.00,0.60),
('EV11','SG10','claims','C05','Guidewire ClaimCenter','Claim CLM-66120 open since 2026-08-30','2026-10-02',0.95,1.00,0.95),
('EV12','SG11','endorsements','E05','Guidewire PolicyCenter','Pop-up location endorsement pending since 2026-10-01','2026-10-01',0.95,1.00,0.95),
('EV13','SG12','documents','D04','Document Store','Pop-up store planned for the holiday season','2026-09-30',0.60,1.00,0.60),
('EV14','SG13','commitments','CM07','Salesforce CRM','Subcontractor COI due 2026-10-02, not delivered','2026-10-02',0.75,1.00,0.75),
('EV15','SG14','claims','C06','Guidewire ClaimCenter','Claim CLM-55904 open since 2026-06-12','2026-09-18',0.95,1.00,0.95),
('EV16','SG15','documents','D09','Document Store','Company is bidding on a hospital construction project','2026-09-22',0.60,1.00,0.60),
('EV17','SG16','claims','C08','Guidewire ClaimCenter','Claim CLM-33077 open since 2026-08-14','2026-09-29',0.95,1.00,0.95),
('EV18','SG17','service_cases','S08','ServiceNow','Cargo survey scheduling case open','2026-10-02',0.85,1.00,0.85),
('EV19','SG18','documents','D10','Document Store','Survey notes mention higher-value cargo routes','2026-09-15',0.60,1.00,0.60),
('EV20','SG19','claims','C04','Guidewire ClaimCenter','Claim CLM-77305 open; reserve $310,000','2026-09-30',0.95,1.00,0.95),
('EV21','SG20','policies','P11','Guidewire PolicyCenter','Renewal date 2026-10-30','2026-09-10',0.95,1.00,0.95),
('EV22','SG20','policies','P11','Salesforce CRM','CRM renewal date 2026-11-04','2026-08-30',0.75,0.90,0.68),
('EV23','SG21','billing','B03','Billing System','Invoice B03 $112,500 overdue since 2026-09-30','2026-09-30',0.90,1.00,0.90),
('EV24','SG22','documents','D03','Document Store','Second cold-storage warehouse planned; equipment vendor selected','2026-08-12',0.60,0.90,0.54),
('EV25','SG23','endorsements','E07','Guidewire PolicyCenter','Add 6 vehicles pending since 2026-10-02','2026-10-02',0.95,1.00,0.95),
('EV26','SG24','documents','D06','Document Store','Adding 6 vehicles; cargo coverage not verified','2026-09-30',0.60,1.00,0.60),
('EV27','SG25','documents','D06','Document Store','EV pilot mentioned once in passing','2026-09-30',0.60,1.00,0.60),
('EV28','SG26','activities','ACT09','Salesforce CRM','Last logged meeting 2026-03-15 (207 days ago)','2026-03-15',0.75,0.65,0.49),
('EV29','SG27','documents','D07','Document Store','Spa renovation planned; property values may change','2026-06-05',0.60,0.80,0.48),
('EV30','SG28','activities','ACT12','Salesforce CRM','Banquet hall with bar service mentioned once','2026-06-05',0.75,0.80,0.60),
('EV31','SG29','activities','ACT10','Salesforce CRM','Price sensitivity raised after last cyber renewal','2026-08-20',0.75,0.90,0.68),
('EV32','SG30','documents','D05','Document Store','Hiring 25 engineers; new SaaS product launch in 2027','2026-08-20',0.60,0.90,0.54),
('EV33','SG30','activities','ACT10','Salesforce CRM','Launching new SaaS product','2026-08-20',0.75,0.90,0.68),
('EV34','SG31','documents','D05','Document Store','Board expansion mentioned; no D&O data on file','2026-08-20',0.60,0.90,0.54),
('EV35','SG32','policies','P18','Guidewire PolicyCenter','Property policy data last updated 2024-09-15','2024-09-15',0.95,0.65,0.62),
('EV36','SG33','documents','D08','Document Store','New STEM building planned for 2027','2026-07-10',0.60,0.90,0.54);

INSERT INTO contradictions (contradiction_id,account_id,policy_id,field,value_a,source_a,value_b,source_b,status,detected_at,resolved_at) VALUES
('X01','A01','P01','renewal_date','2026-10-20','Guidewire PolicyCenter','2026-10-25','Salesforce CRM','needs_review','2026-10-08',NULL),
('X02','A06','P11','renewal_date','2026-10-30','Guidewire PolicyCenter','2026-11-04','Salesforce CRM','needs_review','2026-10-08',NULL),
('X03','A07','P13','fleet_size','42','Guidewire PolicyCenter','48','Salesforce CRM','resolved','2026-09-30','2026-10-03');

-- Generated briefs and generation audit examples live in sql/fixtures/.
-- Source seeding intentionally leaves runtime generation tables empty.

INSERT INTO access_rules (user_id, account_id, allowed, can_view_policies, can_view_claims, can_view_service_cases, can_view_billing, can_view_documents) VALUES
-- U1 (Producer Jordan Davis: owns A01, A02, A03, A08, A09)
('U1','A01',1, 1,1,1,1,1),
('U1','A02',1, 1,1,1,1,1),
('U1','A03',1, 1,1,1,1,1),
('U1','A08',1, 1,1,1,1,1),
('U1','A09',1, 1,1,1,1,1),
('U1','A04',0, 0,0,0,0,0),
('U1','A05',0, 0,0,0,0,0),
('U1','A06',0, 0,0,0,0,0),
('U1','A07',0, 0,0,0,0,0),
('U1','A10',0, 0,0,0,0,0),

-- U2 (Producer Priya Nair: owns A04, A05, A06, A07, A10)
('U2','A04',1, 1,1,1,1,1),
('U2','A05',1, 1,1,1,1,0), -- A05 confidential marine survey notes restricted
('U2','A06',1, 1,1,1,1,1),
('U2','A07',1, 1,1,1,1,1),
('U2','A10',1, 1,1,1,1,1),
('U2','A01',0, 0,0,0,0,0),
('U2','A02',0, 0,0,0,0,0),
('U2','A03',0, 0,0,0,0,0),
('U2','A08',0, 0,0,0,0,0),
('U2','A09',0, 0,0,0,0,0),

-- U5 (Regional Leader Morgan Hayes: oversees Midwest region A01-A04, A06-A10)
('U5','A01',1, 1,1,1,1,1),
('U5','A02',1, 1,1,1,1,1),
('U5','A03',1, 1,1,1,1,1),
('U5','A04',1, 1,1,1,1,1),
('U5','A06',1, 1,1,1,1,1),
('U5','A07',1, 1,1,1,1,1),
('U5','A08',1, 1,1,1,1,1),
('U5','A09',1, 1,1,1,1,1),
('U5','A10',1, 1,1,1,1,1),
('U5','A05',0, 0,0,0,0,0);





-- Additive executive financial demo facts (existing identities only).

CREATE TABLE IF NOT EXISTS policy_financial_months (
    policy_id TEXT NOT NULL REFERENCES policies(policy_id),
    posted_at DATE NOT NULL,
    earned_premium NUMERIC(14,2) NOT NULL CHECK (earned_premium >= 0),
    commission_revenue NUMERIC(14,2) NOT NULL CHECK (commission_revenue >= 0),
    paid_losses NUMERIC(14,2) NOT NULL CHECK (paid_losses >= 0),
    source TEXT NOT NULL DEFAULT 'synthetic_financial_seed_v1',
    PRIMARY KEY (policy_id, posted_at)
);
CREATE TABLE IF NOT EXISTS renewal_outcomes (
    account_id TEXT NOT NULL REFERENCES accounts(account_id),
    renewed_at DATE NOT NULL,
    retained INTEGER NOT NULL CHECK (retained IN (0,1)),
    source TEXT NOT NULL DEFAULT 'synthetic_financial_seed_v1',
    PRIMARY KEY (account_id, renewed_at)
);

WITH months(posted_at) AS (VALUES ('2025-11-01'),('2025-12-01'),('2026-01-01'),('2026-02-01'),('2026-03-01'),('2026-04-01'),('2026-05-01'),('2026-06-01'),('2026-07-01'),('2026-08-01'),('2026-09-01'),('2026-10-01'))
INSERT INTO policy_financial_months
    (policy_id,posted_at,earned_premium,commission_revenue,paid_losses)
SELECT p.policy_id,m.posted_at,ROUND(p.premium/12.0,2),
       ROUND(p.premium*0.12/12.0,2),ROUND(p.premium*0.35/12.0,2)
FROM policies p CROSS JOIN months m
WHERE p.policy_id IN ('P01','P02','P03','P04','P05','P06','P07','P08','P09','P10','P11','P12','P13','P14','P15','P16','P17','P18')
  AND p.account_id IN ('A01','A02','A03','A04','A05','A06','A07','A08','A09','A10')
  AND m.posted_at >= p.effective_date
  AND m.posted_at <= '2026-10-08'
  AND p.premium IS NOT NULL AND p.premium >= 0
ON CONFLICT (policy_id,posted_at) DO NOTHING;
INSERT INTO renewal_outcomes (account_id,renewed_at,retained)
SELECT p.account_id,MAX(date(p.renewal_date,'-1 year')),1 FROM policies p
WHERE p.policy_id IN ('P01','P02','P03','P04','P05','P06','P07','P08','P09','P10','P11','P12','P13','P14','P15','P16','P17','P18')
  AND date(p.renewal_date,'-1 year') <= '2026-10-08'
GROUP BY p.account_id
ON CONFLICT (account_id,renewed_at) DO NOTHING;
