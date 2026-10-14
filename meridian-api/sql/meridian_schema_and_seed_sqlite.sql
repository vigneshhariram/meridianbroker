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

INSERT INTO briefs (brief_id,account_id,persona,version,generated_at,content_json,model_version,completeness_check_passed) VALUES
('BR03','A01','producer',1,'2026-10-08 08:10:00','{"summary": "Renewal at risk from open claim, pending endorsement and service escalation; renewal dates conflict.", "agenda": ["1. Review status of open claim CLM-99231 ahead of renewal.", "2. Confirm renewal date discrepancy (PolicyCenter Oct 20 vs CRM Oct 25) before binding.", "3. Address pending equipment endorsement PA-77821.", "4. Review open service escalation CASE-104 regarding claims handling.", "5. Explore Cyber liability options as an unverified hypothesis."], "talking_points": ["Confirmed fact: Commercial Property renewal date discrepancy between PolicyCenter (Oct 20) and CRM (Oct 25) requires reconciliation.", "Confirmed fact: Open product liability claim CLM-99231 has $185,000 reserve and must be reviewed with underwriter.", "Confirmed fact: Service ticket CASE-104 regarding claims responsiveness has been open for 14 days.", "Hypothesis: Client IoT sensor deployment creates potential cyber risk exposure; validate during discussion."], "prioritized_risks": ["Open product liability claim CLM-99231 with active reserve ahead of renewal.", "Renewal date mismatch across PolicyCenter and CRM systems creates binding exposure.", "Pending policy endorsement PA-77821 pending underwriter approval.", "Open service escalation CASE-104 may affect client renewal sentiment."], "opportunity_hypotheses": ["Cyber liability coverage expansion based on IoT rollout (unverified hypothesis - client validation required)."], "suggested_actions": [{"action_type": "draft_followup", "title": "Draft Underwriter Clarification", "description": "Email carrier to confirm true renewal date and request loss run update for CLM-99231."}, {"action_type": "review_task", "title": "Schedule Operations Touchpoint", "description": "Meet with plant manager to resolve open service case CASE-104 prior to renewal presentation."}], "evidence_citations": ["CLM-99231", "P01", "PA-77821", "CASE-104", "EV01", "EV02", "EV03"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 1180, "tokens_out": 310, "total_tokens": 1490, "latency_ms": 1820, "cost_usd": 0.01055}}','genailab-maas-gpt-4o',1),
('BR04','A01','regional_leader',1,'2026-10-08 08:10:00','{"summary": "High-risk renewal in 12 days with escalation exposure; needs senior attention.", "agenda": ["1. Review $1.4M property program retention strategy.", "2. Coordinate executive sponsor meeting for date reconciliation.", "3. Monitor open high-severity claim CLM-99231 reserve impact."], "talking_points": ["High-risk account: $1.4M premium renewal within 12 days.", "Senior attention needed: Claim reserve and CRM contradiction require underwriter conference."], "prioritized_risks": ["$1.4M premium exposed to renewal non-binding if date discrepancy unresolved.", "Claim CLM-99231 litigation severity."], "opportunity_hypotheses": ["Cyber liability coverage expansion based on IoT rollout (unverified hypothesis - client validation required)."], "suggested_actions": [{"action_type": "review_task", "title": "Executive Sponsor Alignment", "description": "Schedule alignment with Midwest regional underwriting VP."}], "evidence_citations": ["EV01", "EV03", "EV04", "EV05"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 1210, "tokens_out": 295, "total_tokens": 1505, "latency_ms": 1870, "cost_usd": 0.010475}}','genailab-maas-gpt-4o',1),
('BR01','A02','producer',1,'2026-10-07 09:00:00','{"summary": "Steady client with a recent service delay and EHR migration plans.", "agenda": ["1. Review operational performance and EHR migration timeline.", "2. Discuss pending locum tenens physician coverage endorsement.", "3. Review service responsiveness metrics with Dr. Sarah Chen."], "talking_points": ["Confirmed fact: EHR migration is underway across 3 clinical sites.", "Confirmed fact: Dr. Sarah Chen requested locum tenens physician endorsement."], "prioritized_risks": ["Service delay regarding billing invoice inquiries."], "opportunity_hypotheses": ["Cyber policy upgrade for EHR cloud transition (hypothesis)."], "suggested_actions": [{"action_type": "draft_followup", "title": "Follow up on EHR Migration", "description": "Send follow up email to Dr. Sarah Chen regarding clinical timeline."}], "evidence_citations": ["P03", "P04", "EV08"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 980, "tokens_out": 260, "total_tokens": 1240, "latency_ms": 1620, "cost_usd": 0.0088}, "omitted": "open claim CLM-88410"}','genailab-maas-gpt-4o',0),
('BR02','A02','regional_leader',1,'2026-10-07 09:00:00','{"summary": "Steady hospital network with recent service delays and planned cloud EHR migration; high renewal risk.", "agenda": ["1. Executive review of hospital network risk profile and EHR cloud roadmap.", "2. Review pending locum tenens physician coverage endorsement.", "3. Address service responsiveness metrics with Dr. Sarah Chen."], "talking_points": ["Portfolio impact: Horizon Health Systems represents $2,100,000 annual premium in high risk tier.", "Senior attention needed: Service escalation and active physician endorsement require executive touchpoint."], "prioritized_risks": ["Service delay regarding billing invoice inquiries."], "opportunity_hypotheses": ["Cyber policy upgrade for EHR cloud transition (hypothesis)."], "suggested_actions": [{"action_type": "review_task", "title": "Executive Sponsor Touchpoint", "description": "Schedule alignment with Midwest healthcare risk committee."}], "evidence_citations": ["P03", "P04", "EV08"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 1010, "tokens_out": 245, "total_tokens": 1255, "latency_ms": 1670, "cost_usd": 0.008725}, "omitted": "open claim CLM-88410"}','genailab-maas-gpt-4o',0),
('BR05','A03','producer',1,'2026-10-08 08:10:00','{"summary": "Pinecrest Retail carries medium renewal risk with $780,000 premium; active slip-and-fall claim CLM-66120 requires defense review.", "agenda": ["1. Review loss mitigation protocols following slip-and-fall claim CLM-66120.", "2. Discuss coverage endorsement for planned downtown pop-up location.", "3. Review retail general liability limits and carrier terms."], "talking_points": ["Confirmed fact: Slip-and-fall claim CLM-66120 ($45,000 reserve) has defense counsel assigned.", "Confirmed fact: Retail operations planning pop-up store expansion in Q4."], "prioritized_risks": ["Open premises slip-and-fall claim CLM-66120 under active adjustor evaluation.", "High customer footfall during seasonal pop-up expansion."], "opportunity_hypotheses": ["Opportunity (65% confidence): Coverage for pop-up store - Pop-up retail endorsement expansion for upcoming holiday quarter."], "suggested_actions": [{"action_type": "draft_followup", "title": "Pop-up Endorsement Draft", "description": "Send coverage proposal for downtown pop-up location to retail CFO."}, {"action_type": "review_task", "title": "Loss History Review", "description": "Review slip and fall claim CLM-66120 remediation with store operations."}], "evidence_citations": ["CLM-66120", "P05", "EV11"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 1050, "tokens_out": 280, "total_tokens": 1330, "latency_ms": 1710, "cost_usd": 0.00945}}','genailab-maas-gpt-4o',1),
('BR06','A03','regional_leader',1,'2026-10-08 08:10:00','{"summary": "Mid-tier retail account with $780,000 annual premium; premises claim CLM-66120 and seasonal pop-up expansion underway.", "agenda": ["1. Review retail portfolio risk and seasonal footprint expansion.", "2. Monitor slip-and-fall claim CLM-66120 reserve trends.", "3. Evaluate multi-location property program terms."], "talking_points": ["Medium-risk account: $780,000 annual premium with clean property loss ratio.", "Premises liability claim CLM-66120 requires standard reserve monitoring."], "prioritized_risks": ["Premises liability claim CLM-66120 loss run impact.", "Seasonal retail inventory concentration risk."], "opportunity_hypotheses": ["Opportunity (65% confidence): Coverage for pop-up store - Pop-up retail endorsement expansion for upcoming holiday quarter."], "suggested_actions": [{"action_type": "review_task", "title": "Retail Book Risk Check", "description": "Review commercial package retention terms for regional retail book."}], "evidence_citations": ["CLM-66120", "P05", "EV11"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 1080, "tokens_out": 265, "total_tokens": 1345, "latency_ms": 1760, "cost_usd": 0.009375}}','genailab-maas-gpt-4o',1),
('BR07','A04','producer',1,'2026-10-08 08:10:00','{"summary": "Summit Construction renewal in 25 days carries medium risk with $950,000 premium; crane equipment claim CLM-55904 is in subrogation.", "agenda": ["1. Review heavy machinery claim CLM-55904 remediation with equipment superintendent.", "2. Review builders risk coverage terms for upcoming hospital construction bid.", "3. Confirm subcontractor certificate of insurance compliance."], "talking_points": ["Confirmed fact: Equipment loss CLM-55904 ($120,000 reserve) is in subrogation review.", "Confirmed fact: Client bidding on $45M hospital expansion project."], "prioritized_risks": ["Open crane equipment damage claim CLM-55904 with carrier inspection pending.", "Contractual indemnity requirements for hospital construction project bid."], "opportunity_hypotheses": ["Opportunity (70% confidence): Builders risk extension - Coverage extension for new regional medical center project bid."], "suggested_actions": [{"action_type": "draft_followup", "title": "Hospital Bid Builders Risk", "description": "Send quote comparison for hospital construction bid to general counsel."}, {"action_type": "review_task", "title": "Crane Maintenance Verification", "description": "Confirm crane operator certification records with site safety manager."}], "evidence_citations": ["CLM-55904", "P08", "EV14"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 1110, "tokens_out": 295, "total_tokens": 1405, "latency_ms": 1780, "cost_usd": 0.009975}}','genailab-maas-gpt-4o',1),
('BR08','A04','regional_leader',1,'2026-10-08 08:10:00','{"summary": "Commercial construction account generating $950,000 premium; upcoming $45M hospital bid requires builders risk placement.", "agenda": ["1. Review $950K commercial construction account renewal readiness.", "2. Monitor heavy equipment loss CLM-55904 subrogation recovery.", "3. Support commercial contractor hospital project placement."], "talking_points": ["Portfolio status: $950,000 premium commercial contractor in medium risk tier.", "Underwriter relationship solid across commercial auto and inland marine lines."], "prioritized_risks": ["Heavy machinery claim CLM-55904 subrogation recovery.", "Builders risk capacity constraints across commercial carriers."], "opportunity_hypotheses": ["Opportunity (70% confidence): Builders risk extension - Coverage extension for new regional medical center project bid."], "suggested_actions": [{"action_type": "review_task", "title": "Contractor Placement Alignment", "description": "Coordinate commercial surety and builders risk facility with branch underwriting."}], "evidence_citations": ["CLM-55904", "P08", "EV14"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 1140, "tokens_out": 280, "total_tokens": 1420, "latency_ms": 1830, "cost_usd": 0.0099}}','genailab-maas-gpt-4o',1),
('BR09','A05','producer',1,'2026-10-08 08:10:00','{"summary": "Harbor Marine Partners holds $640,000 marine program; cargo transit claim CLM-33077 active and document confidentiality enforced.", "agenda": ["1. Review admiralty reserve status for container damage claim CLM-33077.", "2. Audit marine cargo vessel schedule P10.", "3. Evaluate excess marine liability options for international routes."], "talking_points": ["Confirmed fact: Open marine cargo claim CLM-33077 carries $85,000 reserve.", "Confirmed fact: Account subject to client-requested document confidentiality."], "prioritized_risks": ["Open cargo transit loss CLM-33077 under maritime admiralty review.", "Restricted access controls enforce data separation for survey reports."], "opportunity_hypotheses": ["Opportunity (65% confidence): Excess marine liability - Excess marine liability coverage expansion for international port routes."], "suggested_actions": [{"action_type": "draft_followup", "title": "Marine Survey Follow-up", "description": "Coordinate with port surveyor on vessel safety certification."}, {"action_type": "review_task", "title": "Bill of Lading Audit", "description": "Audit ocean transit bills of lading for limitation of liability compliance."}], "evidence_citations": ["CLM-33077", "P10", "EV17"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 1020, "tokens_out": 270, "total_tokens": 1290, "latency_ms": 1650, "cost_usd": 0.00915}}','genailab-maas-gpt-4o',1),
('BR10','A05','regional_leader',1,'2026-10-08 08:10:00','{"summary": "Specialty marine logistics program with $640,000 premium; strict RBAC data restrictions in effect for survey findings.", "agenda": ["1. Regional oversight of specialty maritime risks and port authority requirements.", "2. Monitor maritime claim CLM-33077 legal defense progress.", "3. Verify compliance with restricted survey document protocol."], "talking_points": ["Specialty line portfolio: $640,000 marine transport program.", "Data governance check: Document restrictions strictly enforced by RBAC."], "prioritized_risks": ["Maritime admiralty liability exposure under claim CLM-33077.", "Confidentiality governance protocol compliance."], "opportunity_hypotheses": ["Opportunity (65% confidence): Excess marine liability - Excess marine liability coverage expansion for international port routes."], "suggested_actions": [{"action_type": "review_task", "title": "Maritime Governance Audit", "description": "Audit compliance with confidential survey access rules."}], "evidence_citations": ["CLM-33077", "P10", "EV17"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 1050, "tokens_out": 255, "total_tokens": 1305, "latency_ms": 1700, "cost_usd": 0.009075}}','genailab-maas-gpt-4o',1),
('BR11','A06','producer',1,'2026-10-08 08:10:00','{"summary": "High-risk food processor ($1.15M premium) facing renewal date contradiction (Oct 30 vs Nov 04), spoilage claim CLM-77305, and invoice B03 overdue.", "agenda": ["1. Reconcile renewal date mismatch (Oct 30 vs Nov 04) and invoice B03 payment before binding.", "2. Review refrigeration ammonia leak claim CLM-77305 spoilage remediation.", "3. Discuss equipment breakdown coverage for automated cold storage."], "talking_points": ["Confirmed fact: Spoilage claim CLM-77305 reserve is $310,000; invoice B03 is overdue.", "Confirmed discrepancy: PolicyCenter renewal date (Oct 30) conflicts with CRM (Nov 04)."], "prioritized_risks": ["Open refrigeration ammonia leak claim CLM-77305 with $310,000 spoilage reserve.", "Renewal date conflict between PolicyCenter (Oct 30) and CRM (Nov 04).", "Overdue premium invoice B03 ($112,500) outstanding for 30+ days."], "opportunity_hypotheses": ["Opportunity (60% confidence): Equipment breakdown - Equipment breakdown endorsement for automated cold storage facility expansion."], "suggested_actions": [{"action_type": "draft_followup", "title": "Reconcile Policy Dates & Billing", "description": "Meet with CFO to clear invoice B03 and lock renewal date before binding."}, {"action_type": "review_task", "title": "Cold Storage Ammonia Safety Audit", "description": "Review refrigeration maintenance logs tied to CLM-77305 spoilage claim."}], "evidence_citations": ["CLM-77305", "P11", "B03", "EV20", "EV21", "EV23"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 1220, "tokens_out": 325, "total_tokens": 1545, "latency_ms": 1890, "cost_usd": 0.010975}}','genailab-maas-gpt-4o',1),
('BR12','A06','regional_leader',1,'2026-10-08 08:10:00','{"summary": "High-risk food processing portfolio ($1.15M premium); $310,000 spoilage reserve and overdue billing require urgent underwriter intervention.", "agenda": ["1. High-risk food manufacturing retention strategy ($1.15M premium).", "2. Address $310,000 claim reserve and outstanding $112.5K premium invoice.", "3. Coordinate underwriting conference to resolve date contradiction before binding."], "talking_points": ["High-risk account: $1.15M food processing portfolio exposed to binding cancellation.", "Executive intervention required on accounting reconciliation and claim loss runs."], "prioritized_risks": ["$1.15M food processing portfolio exposed to binding cancellation.", "Overdue invoice B03 ($112.5K) and $310K refrigeration claim severity."], "opportunity_hypotheses": ["Opportunity (60% confidence): Equipment breakdown - Equipment breakdown endorsement for automated cold storage facility expansion."], "suggested_actions": [{"action_type": "review_task", "title": "Carrier Executive Escalation", "description": "Conference with carrier underwriting manager on date reconciliation."}], "evidence_citations": ["CLM-77305", "P11", "B03", "EV20", "EV21"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 1250, "tokens_out": 310, "total_tokens": 1560, "latency_ms": 1940, "cost_usd": 0.0109}}','genailab-maas-gpt-4o',1),
('BR13','A07','producer',1,'2026-10-08 08:10:00','{"summary": "Cedar Logistics holds $890,000 commercial auto program with zero open claims; vehicle endorsement E07 pending and EV pilot noted as unverified hypothesis.", "agenda": ["1. Review pending endorsement E07 to add 6 commercial fleet vehicles.", "2. Validate client need for EV fleet pilot (unverified hypothesis - 30% confidence).", "3. Confirm true fleet count following resolution of PolicyCenter 42 vs CRM 48 records."], "talking_points": ["Confirmed fact: Endorsement E07 pending since Oct 02 to add 6 transport vehicles.", "Hypothesis (unverified): EV pilot coverage based on single survey remark; client confirmation mandatory before quoting."], "prioritized_risks": ["Pending endorsement E07 to add 6 commercial vehicles pending underwriter approval.", "Fleet count contradiction (PolicyCenter 42 vehicles vs CRM 48 vehicles)."], "opportunity_hypotheses": ["Hypothesis (unverified) (30% confidence): EV pilot coverage - Mentioned once in passing in survey notes; validate client adoption before coverage modeling. Assumptions: Client validation required."], "suggested_actions": [{"action_type": "draft_followup", "title": "Vehicle Schedule Clarification", "description": "Confirm accurate vehicle count (42 vs 48) and finalize endorsement E07."}, {"action_type": "review_task", "title": "EV Infrastructure Discovery", "description": "Interview fleet operations manager regarding actual EV charger deployment status."}], "evidence_citations": ["P13", "E07", "EV25", "EV27"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 1080, "tokens_out": 290, "total_tokens": 1370, "latency_ms": 1740, "cost_usd": 0.00975}}','genailab-maas-gpt-4o',1),
('BR14','A07','regional_leader',1,'2026-10-08 08:10:00','{"summary": "Commercial transport account ($890,000 premium) with clean loss history; fleet endorsement pending and EV pilot governed as unverified hypothesis.", "agenda": ["1. Review Midwest logistics book retention and fleet expansion trends.", "2. Validate fleet size reconciliation (42 vs 48 vehicles) prior to policy endorsement.", "3. Note EV pilot as unverified hypothesis; ensure no premature binding."], "talking_points": ["Commercial transportation account: $890,000 premium with clean claim record.", "Strict hypothesis governance: EV pilot is unverified hypothesis with 30% confidence."], "prioritized_risks": ["Vehicle schedule expansion timing exposure.", "Fleet size reconciliation between administrative systems."], "opportunity_hypotheses": ["Hypothesis (unverified) (30% confidence): EV pilot coverage - Mentioned once in passing in survey notes; validate client adoption before coverage modeling. Assumptions: Client validation required."], "suggested_actions": [{"action_type": "review_task", "title": "Logistics Book Review", "description": "Analyze commercial transport rate trends across Midwest region."}], "evidence_citations": ["P13", "E07", "EV25"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 1110, "tokens_out": 275, "total_tokens": 1385, "latency_ms": 1790, "cost_usd": 0.009675}}','genailab-maas-gpt-4o',1),
('BR15','A08','producer',1,'2026-10-08 08:10:00','{"summary": "Lakeside Hospitality carries low renewal risk with $420,000 premium and 120 days to renewal; resort spa renovation requires building value updates.", "agenda": ["1. Review post-renovation building valuations for resort spa and banquet wing.", "2. Schedule comprehensive stewardship review (last meeting 207 days ago).", "3. Confirm liquor liability limits and beverage service safety certifications."], "talking_points": ["Confirmed fact: Last logged client review meeting was 207 days ago; stewardship overdue.", "Confirmed fact: Resort completed spa renovation; property valuation update required."], "prioritized_risks": ["Potential underinsurance if capital improvement spa renovation is unendorsed.", "No logged stewardship meeting for over 200 days."], "opportunity_hypotheses": ["Opportunity (65% confidence): Property values after renovation - Property values appraisal adjustment following spa and banquet hall renovation."], "suggested_actions": [{"action_type": "draft_followup", "title": "Schedule In-Person Stewardship", "description": "Book executive stewardship luncheon with resort general manager."}, {"action_type": "review_task", "title": "Capital Improvements Valuation", "description": "Obtain contractor cost sheets for spa renovation to update property schedules."}], "evidence_citations": ["P15", "EV28", "EV29", "EV30"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 990, "tokens_out": 265, "total_tokens": 1255, "latency_ms": 1600, "cost_usd": 0.008925}}','genailab-maas-gpt-4o',1),
('BR16','A08','regional_leader',1,'2026-10-08 08:10:00','{"summary": "Low-risk hospitality resort ($420,000 premium) with stable operations; relationship touchpoint needed after 207-day stewardship gap.", "agenda": ["1. Review hospitality portfolio property schedule updates.", "2. Address relationship stewardship recency with resort ownership.", "3. Evaluate umbrella limits following capital improvements."], "talking_points": ["Low-risk hospitality account: $420,000 annual premium with zero open claims.", "Stewardship engagement required to protect renewal relationship."], "prioritized_risks": ["Appraisal valuation lag following resort capital expenditures.", "Client engagement recency exceeds normal stewardship cadence."], "opportunity_hypotheses": ["Opportunity (65% confidence): Property values after renovation - Property values appraisal adjustment following spa and banquet hall renovation."], "suggested_actions": [{"action_type": "review_task", "title": "Hospitality Risk Advisory", "description": "Conduct portfolio review on Midwest hospitality property rates."}], "evidence_citations": ["P15", "EV28", "EV29"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 1020, "tokens_out": 250, "total_tokens": 1270, "latency_ms": 1650, "cost_usd": 0.00885}}','genailab-maas-gpt-4o',1),
('BR17','A09','producer',1,'2026-10-08 08:10:00','{"summary": "Maple Tech Solutions carries low renewal risk ($510,000 premium); new SaaS product launch requires Technology E&O limit evaluation.", "agenda": ["1. Review Technology E&O coverage specifications for new enterprise SaaS product.", "2. Address cyber pricing sensitivity with multi-carrier benchmarking.", "3. Evaluate Directors & Officers liability coverage for expanding executive board."], "talking_points": ["Confirmed fact: Client hiring 25 engineers for 2027 enterprise SaaS launch.", "Confirmed fact: Client voiced price sensitivity during last cyber policy renewal."], "prioritized_risks": ["Hiring 25 cloud engineers and launching enterprise SaaS expands E&O exposure.", "Client raised price sensitivity at prior cyber renewal."], "opportunity_hypotheses": ["Opportunity (70% confidence): Tech E&O expansion - Technology E&O and Cyber limit expansion ahead of 2027 SaaS product launch."], "suggested_actions": [{"action_type": "draft_followup", "title": "SaaS Contract Review", "description": "Provide enterprise SaaS insurance requirement guidelines to VP of Engineering."}, {"action_type": "review_task", "title": "Cyber Limits Benchmarking", "description": "Prepare peer benchmarking presentation to address cyber pricing sensitivity."}], "evidence_citations": ["P17", "EV31", "EV32", "EV33"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 1040, "tokens_out": 275, "total_tokens": 1315, "latency_ms": 1680, "cost_usd": 0.009325}}','genailab-maas-gpt-4o',1),
('BR18','A09','regional_leader',1,'2026-10-08 08:10:00','{"summary": "Fast-growing SaaS software client ($510,000 premium); client raised cyber pricing sensitivity during previous renewal.", "agenda": ["1. Monitor high-growth technology portfolio account ($510K premium).", "2. Strategy touchpoint on SaaS cyber market rates to address price sensitivity.", "3. Coordinate management liability package placement for 2027."], "talking_points": ["Clean loss history: $510,000 tech account in rapid growth phase.", "Proactive cyber rate benchmarking needed to retain account."], "prioritized_risks": ["Enterprise SaaS scaling creates higher cyber and contractual indemnity exposure.", "Cyber market rate sensitivity may threaten retention."], "opportunity_hypotheses": ["Opportunity (70% confidence): Tech E&O expansion - Technology E&O and Cyber limit expansion ahead of 2027 SaaS product launch."], "suggested_actions": [{"action_type": "review_task", "title": "Tech Sector Retention Review", "description": "Benchmark cyber and tech E&O rates across regional software clients."}], "evidence_citations": ["P17", "EV31", "EV32"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 1070, "tokens_out": 260, "total_tokens": 1330, "latency_ms": 1730, "cost_usd": 0.00925}}','genailab-maas-gpt-4o',1),
('BR19','A10','producer',1,'2026-10-08 08:10:00','{"summary": "BrightPath Education carries low renewal risk ($310,000 premium); planned STEM academic hall requires course of construction planning.", "agenda": ["1. Review property replacement appraisal update ahead of renewal.", "2. Plan course of construction coverage for planned 2027 STEM building.", "3. Review campus safety protocols and student transit risk management."], "talking_points": ["Confirmed fact: Commercial Property policy schedules have not been updated since Sept 2024.", "Confirmed fact: Campus master plan includes new STEM facility scheduled for 2027."], "prioritized_risks": ["Property schedules last updated in 2024; potential building replacement cost lag.", "Upcoming STEM campus construction introduces student transit hazards."], "opportunity_hypotheses": ["Opportunity (65% confidence): Property coverage for STEM building - Course of construction and property addition for planned 2027 STEM building."], "suggested_actions": [{"action_type": "draft_followup", "title": "Groundbreaking Insurance Plan", "description": "Send university risk manager the construction safety guidelines for STEM hall."}, {"action_type": "review_task", "title": "Campus Replacement Cost Valuation", "description": "Request updated Statement of Values (SOV) across all academic facilities."}], "evidence_citations": ["P18", "EV35", "EV36"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 960, "tokens_out": 255, "total_tokens": 1215, "latency_ms": 1580, "cost_usd": 0.008625}}','genailab-maas-gpt-4o',1),
('BR20','A10','regional_leader',1,'2026-10-08 08:10:00','{"summary": "Institutional education account ($310,000 premium) with zero claim history; Statement of Values update recommended prior to construction.", "agenda": ["1. Review institutional education sector retention ($310K premium).", "2. Verify Statement of Values updates for academic facilities.", "3. Ensure construction insurance requirements are structured before STEM ground break."], "talking_points": ["Low-risk education account: $310,000 premium with zero loss history.", "Property value re-benchmarking recommended ahead of construction."], "prioritized_risks": ["Statement of Values aging across institutional campus facilities.", "Construction risk management alignment before project groundbreaking."], "opportunity_hypotheses": ["Opportunity (65% confidence): Property coverage for STEM building - Course of construction and property addition for planned 2027 STEM building."], "suggested_actions": [{"action_type": "review_task", "title": "Education Sector Portfolio Check", "description": "Review public and private school program loss ratios."}], "evidence_citations": ["P18", "EV35", "EV36"], "telemetry": {"model": "genailab-maas-gpt-4o", "tokens_in": 990, "tokens_out": 240, "total_tokens": 1230, "latency_ms": 1630, "cost_usd": 0.00855}}','genailab-maas-gpt-4o',1);

INSERT INTO audit_log (log_id,user_id,account_id,persona,action,model,tokens_in,tokens_out,total_tokens,cost_usd,latency_ms,completeness_passed,blocked_flag,block_reason,created_at) VALUES
('LOG_BR03','U1','A01','producer','brief_generation','genailab-maas-gpt-4o',1180,310,1490,0.010550,1820,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR04','U5','A01','regional_leader','brief_generation','genailab-maas-gpt-4o',1210,295,1505,0.010475,1870,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR01','U1','A02','producer','brief_generation','genailab-maas-gpt-4o',980,260,1240,0.008800,1620,0,0,NULL,'2026-10-07 09:00:00'),
('LOG_BR02','U5','A02','regional_leader','brief_generation','genailab-maas-gpt-4o',1010,245,1255,0.008725,1670,0,0,NULL,'2026-10-07 09:00:00'),
('LOG_BR05','U1','A03','producer','brief_generation','genailab-maas-gpt-4o',1050,280,1330,0.009450,1710,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR06','U5','A03','regional_leader','brief_generation','genailab-maas-gpt-4o',1080,265,1345,0.009375,1760,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR07','U2','A04','producer','brief_generation','genailab-maas-gpt-4o',1110,295,1405,0.009975,1780,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR08','U5','A04','regional_leader','brief_generation','genailab-maas-gpt-4o',1140,280,1420,0.009900,1830,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR09','U2','A05','producer','brief_generation','genailab-maas-gpt-4o',1020,270,1290,0.009150,1650,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR10','U5','A05','regional_leader','brief_generation','genailab-maas-gpt-4o',1050,255,1305,0.009075,1700,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR11','U2','A06','producer','brief_generation','genailab-maas-gpt-4o',1220,325,1545,0.010975,1890,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR12','U5','A06','regional_leader','brief_generation','genailab-maas-gpt-4o',1250,310,1560,0.010900,1940,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR13','U2','A07','producer','brief_generation','genailab-maas-gpt-4o',1080,290,1370,0.009750,1740,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR14','U5','A07','regional_leader','brief_generation','genailab-maas-gpt-4o',1110,275,1385,0.009675,1790,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR15','U1','A08','producer','brief_generation','genailab-maas-gpt-4o',990,265,1255,0.008925,1600,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR16','U5','A08','regional_leader','brief_generation','genailab-maas-gpt-4o',1020,250,1270,0.008850,1650,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR17','U1','A09','producer','brief_generation','genailab-maas-gpt-4o',1040,275,1315,0.009325,1680,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR18','U5','A09','regional_leader','brief_generation','genailab-maas-gpt-4o',1070,260,1330,0.009250,1730,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR19','U2','A10','producer','brief_generation','genailab-maas-gpt-4o',960,255,1215,0.008625,1580,1,0,NULL,'2026-10-08 08:10:00'),
('LOG_BR20','U5','A10','regional_leader','brief_generation','genailab-maas-gpt-4o',990,240,1230,0.008550,1630,1,0,NULL,'2026-10-08 08:10:00');

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



