# EG (المصرية الألمانية) — HR Module Research: Lifecycle, Manufacturing Needs, KPIs, Workflows, UX, Notifications, Documents

Prepared 2026-11-04 for the ERP web dashboard (Arabic RTL first). Plant: WPC and PVC building products, Gamasa, Dakahlia; 100+ workers, mostly shift-based blue-collar; private sector.

## 0. How to read this file (confidence legend)

- **[S]** = claim backed by a fetched or searched source, URL given inline.
- **(unverified)** = domain knowledge or a vendor behaviour I could not confirm in this research pass. Check it before it goes into a spec or a legal document.
- **Rec.** = my design recommendation, not a factual claim.
- Egyptian law figures come from law-firm and HR-vendor summaries, not the official Gazette. **None should be hard-coded.** Every legal number must be a configurable policy value (effective-dated), reviewed by Egyptian counsel (see §9).
- No primary SHRM, CIPD or Gartner lifecycle framework page was found. The searches returned only secondary sources. The lifecycle in §1 is a synthesis of common stage models and is not "the SHRM model".
- Vendor UI descriptions (Rippling, HiBob, Personio, Gusto, Deel, Zoho People) could not be verified by search. §6 marks them "(unverified)". Validate them against trial accounts or help-centre screenshots.

### 0.1 Egyptian legal baseline (Law 14/2025, in force 1 Sep 2025) — what the sources say

| Topic | Value found | Source | Note |
|---|---|---|---|
| Effective date; specialised labour courts | Law in force 1 Sep 2025; labour courts from 1 Oct 2025 | [Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law) | |
| Workforce statement to Ministry | Within 30 days of effect | [Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law) | |
| Contract language / copies | Arabic, 4 copies; translation allowed, Arabic prevails | [Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law) | Contract template must be Arabic-first |
| Probation | Max 3 months, once per employer | [ZenHR](https://www.zenhr.com/en/egypt-labor-law) | One RemotePass page still says 6 months; conflict flagged by search, so verify |
| Working time | 8 h/day, 48 h/week max; at least 1 h of breaks, no more than 5 continuous hours | [ZenHR](https://www.zenhr.com/en/egypt-labor-law) | A secondary source also says total daily hours (incl. overtime) must not exceed 10 (unverified, see [sadanykhalifa](https://sadanykhalifa.com/ar/single-blog/442)) |
| Overtime premium | Day +35%, night +70%; weekly rest day worked = double pay plus a compensatory day; public holiday = day's wage plus double pay, or a compensatory day on written request | [ZenHR](https://www.zenhr.com/en/egypt-labor-law) | **Conflict:** another source puts night overtime at 135% (unverified). Make rates configurable |
| Weekly rest | At least 24 consecutive hours, paid | [ZenHR](https://www.zenhr.com/en/egypt-labor-law) | Friday is typical (unverified) |
| Annual leave | 15 days in year 1 (after 6 months' service); 21 from year 2; 30 for 10+ years' service or age 50+; 45 for people with disabilities | [ZenHR](https://www.zenhr.com/en/egypt-labor-law), [Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law) | |
| Casual/emergency leave | ZenHR: 6 days/yr, max 2 consecutive. Clyde: 7 days/yr, max 2 consecutive, deducted from annual leave | both URLs above | **Conflict between sources** |
| Sick leave | Certified; first 3 months 100%, next 6 months 85%, last 3 months 75%; paid through social insurance; dismissal during certified sick leave prohibited | [ZenHR](https://www.zenhr.com/en/egypt-labor-law) | |
| Maternity | 120 days, up to 3 times; paternity on day of birth, up to 3 times; unpaid childcare leave up to 2 years, up to 3 times after 1 year's service | [Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law) | No overtime during pregnancy or the 6 months after birth |
| Notice and termination | Indefinite contracts: 3 months' written notice. Employer termination without legitimate reason: at least 2 months' salary per year of service (indefinite). Early termination of a fixed-term contract by the employer: 1 month per year | [Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law), [ZenHR](https://www.zenhr.com/en/egypt-labor-law) | |
| Resignation | Must be validated by the labour office; employee may withdraw within 10 days of employer acceptance; employer must respond in 10 days | [Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law), [Deloitte](https://www.deloitte.com/middle-east/en/services/tax/perspectives/egypt-new-labor-law-entering-into-effect.html), [ZenHR](https://www.zenhr.com/en/egypt-labor-law) | |
| Unjustified absence | No longer gross misconduct; treated as voluntary resignation | [Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law) | Drives the "absence without notice" workflow (§2). Verify the exact conditions and notice steps |
| Annual raise | At least 3% of social-insurance salary | [Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law), [Deloitte](https://www.deloitte.com/middle-east/en/services/tax/perspectives/egypt-new-labor-law-entering-into-effect.html) | Auto-generate a due-raise list |
| Record retention | Employee files at least 5 years after termination | [Deloitte](https://www.deloitte.com/middle-east/en/services/tax/perspectives/egypt-new-labor-law-entering-into-effect.html) | |
| Training fund | 0.25% of minimum insurable wage for employers with 30+ employees | [Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law) | |
| Disability quota | 20+ employees: 5% people of determination plus a register | [Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law) | KPI: quota compliance |
| Discipline | Art. 139 penalty ladder: written warning, deduction from base pay, delayed raise/promotion, demotion or pay cut, dismissal. One penalty per violation. Deduction cap of 5 days' pay/month. Written notice of the violation, hearing of the employee, investigation to start within 7 days of discovery; oral hearing allowed for warning or deductions of up to 1 day; reasoned decision | [sadanykhalifa](https://sadanykhalifa.com/ar/single-blog/442), [almalnews](https://almalnews.com/2132230/5-أيام-حد-أقصى-للخصم-تعرف-على/); [Mondaq translation](https://www.mondaq.com/employee-rights-labour-relations/1673824/translation-of-labor-law-no-14-of-2025) | Secondary sources. Verify article numbers against the Gazette text. Drives the discipline workflow |
| Public holidays | ZenHR lists 12 named holidays, says 13. Islamic holiday dates depend on moon sighting | [ZenHR](https://www.zenhr.com/en/egypt-labor-law) | Holiday calendar must be editable by HR yearly |
| Social insurance 2026 | Employee 11%, employer 18.75%; insurable wage cap EGP 16,700 (from Jan 2026); floor EGP 2,700 (one source) | [PwC](https://taxsummaries.pwc.com/Egypt/Individual/Other-taxes), [Nativeteams](https://help.nativeteams.com/egypt-payroll-changes-2026), [BDO](https://www.bdo.global/en-gb/insights/tax/expatriate-tax/egypt-maximum-and-minimum-salaries-subject-to-social-insurance-increased) | Limits are revised every January; one source says 15%/yr floor steps. Employers had to update wage data via "Form 2" after the Jan 2025 change |
| OHS framework | Labour law Book 5 and Executive Decree 134/2003; OSHA department of the Ministry of Manpower inspects | [Rivermate](https://rivermate.com/guides/egypt/health-and-safety) | Committee/officer thresholds, medical exam and injury reporting deadlines **not confirmed**. Get them from the Arabic text |
| Possible 2026 amendment | One commercial page mentions a "Law 14 of 2026" amending OHS duties | [globallawexperts](https://globallawexperts.com/egypt-labour-law-2026/) | Single commercial source (unverified). Confirm with counsel |

**Rec.** Build a **Policy Engine** (effective-dated rules table: overtime rates, leave entitlements, probation length, deduction caps, holiday calendar, insurance rates/caps). Legal changes then become a data change, not a release.

---

## 1. The complete employee lifecycle

### 1.1 Stage models in the wild (what to align with)

- Vendors and training providers typically describe 5 to 7 stages: attract → recruit → onboard → develop → retain → separate (→ alumni). The CIPD-attributed variants range from 5 to 7 stages and are only seen in secondary sources: [Bakkah](https://bakkah.com/knowledge-center/employee-life-cycle-in-cipd), [HR University (SHRM topic page)](https://hr.university/shrm/talent-management/employee-life-cycle/), [Darwinbox](https://darwinbox.com/blog/employee-lifecycle-hr-leaders). No Gartner-owned lifecycle framework was found.
- HR metrics are commonly grouped along the same chain (recruiting, onboarding, performance, compensation, engagement, development, separation): [MiHCM people-analytics guide](https://mihcm.com/resources/blog/the-ultimate-guide-to-people-analytics-metrics/), [Rippling metrics](https://www.rippling.com/blog/best-metrics-to-track-for-hr).
- **Rec.** For a plant ERP, extend the generic model with a **"run" layer** that generic models omit. That layer is the daily operational loop (roster, attendance, overtime, safety, custody, deductions) that consumes most HR admin time on a shop floor. It sits between "onboard" and "separate".

### 1.2 Stage map (this module's information architecture)

| # | Phase | Stage / sub-process |
|---|---|---|
| A | Plan | A1 Workforce plan and budget; A2 Position and job-description management |
| B | Acquire | B1 Requisition and approval; B2 Sourcing; B3 Screening; B4 Interviews and trade test; B5 Offer; B6 Medical fitness and background; B7 Contract; B8 Pre-boarding |
| C | Onboard | C1 Day-1 onboarding; C2 Social-insurance and records set-up; C3 Safety induction and PPE/uniform issue; C4 Probation management; C5 Confirmation |
| D | Run | D1 Core records; D2 Shifts and rosters; D3 Time and attendance; D4 Leave; D5 Overtime; D6 Payroll; D7 Loans and deductions; D8 Benefits and allowances |
| E | Develop | E1 Performance; E2 Learning and skills matrix; E3 Career, promotion, transfer |
| F | Protect | F1 Discipline and grievance; F2 Occupational health and safety; F3 Medical and sick leave; F4 Legal cases |
| G | Retain | G1 Recognition and incentives; G2 Engagement and surveys; G3 Retention risk |
| H | Separate | H1 Resignation / termination; H2 Exit interview; H3 Clearance; H4 Final settlement; H5 Social-insurance exit and certificates; H6 Alumni / rehire pool |

### 1.3 Sub-process specification

SLA values are **Rec.** defaults, configurable per organisation. "Owner" is the accountable role. Notification codes (N-xx) refer to §7.

#### A. Plan

| Sub-process | Purpose | Trigger | Owner | Inputs | Outputs / documents | Approvals | SLA (Rec.) | Statuses | Notifications |
|---|---|---|---|---|---|---|---|---|---|
| A1 Workforce plan / budget | Match headcount and labour cost to production plan | Annual budget cycle; new line or shift added | GM + HR Manager + Plant Manager | Production plan, historical turnover, overtime trend, budget | Approved headcount budget per department/cost centre/shift | Dept head → HR → Finance → GM | Annual; quarterly review | Draft, Submitted, Approved, Locked | N-01 |
| A2 Position and JD | Single source of truth for jobs: grade, shift type, safety-critical flag, required certificates | New role; reorg | HR Manager | Org chart, skills catalogue | Position record, job description (JD), grade/pay band, required certifications | HR + dept head | 3 days | Draft, Active, Frozen, Closed | — |

#### B. Acquire

| Sub-process | Purpose | Trigger | Owner | Inputs | Outputs / documents | Approvals | SLA (Rec.) | Statuses | Notifications |
|---|---|---|---|---|---|---|---|---|---|
| B1 Requisition | Authorise a hire against budget (new or replacement) | Resignation, growth, shift gap | Line manager (initiator) | Position, budget line, reason | Requisition record | Dept head → HR → Finance (if unbudgeted) → GM (if over threshold) | Approve within 2 working days | Draft, Pending approval, Approved, Rejected, On hold, Filled, Cancelled | N-02, N-03 |
| B2 Sourcing | Build the candidate pool (walk-ins, referrals, job boards, agencies, technical schools) | Approved requisition | HR recruiter | JD, channels | Candidate records, source tag | — | Post within 1 day | New | — |
| B3 Screening | Shortlist on must-haves (age, military status, certificates, residence near Gamasa) | New applicant | HR recruiter | CV, ID data | Screen result with reason | — | 3 days | New, Shortlisted, Rejected, Talent pool | N-04 |
| B4 Interviews and trade test | Assess fit and practical skill (e.g. operator task test) | Shortlist | Hiring manager and HR | Scorecard, practical test sheet | Interview scorecard, test result | Panel decision | Complete in 7 days | Scheduled, Done, No-show, Pass, Fail | N-05 |
| B5 Offer | Agree pay and start date | Pass | HR Manager | Pay band, budget | Offer letter (AR) | HR → Dept head → GM if above band | Offer in 2 days; candidate response 3 days | Draft, Approved, Sent, Accepted, Declined, Expired, Withdrawn | N-06 |
| B6 Fitness and background | Pre-employment medical (safety-critical roles), documents check, references | Offer accepted | HR + site clinic/OHS officer | ID copy, military status, criminal-record certificate (as required) | Medical fitness certificate, document checklist | OHS officer on fitness | 5 days | Pending, Fit, Fit with limits, Unfit | N-07 |
| B7 Contract | Legal employment contract | Documents complete | HR Manager | Offer terms, policy values | Arabic contract in 4 copies ([Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law)), job description acknowledgement, regulations acknowledgement | HR signs, GM signs, employee signs | Before day 1 | Draft, Out for signature, Signed, Filed | N-08 |
| B8 Pre-boarding | Remove day-1 friction | Contract signed | HR officer | Start date | Welcome pack, ID/bank/insurance data form, uniform size, transport route | — | 1 to 5 days before start | Open, Complete | N-09 |

#### C. Onboard

| Sub-process | Purpose | Trigger | Owner | Inputs | Outputs / documents | Approvals | SLA (Rec.) | Statuses | Notifications |
|---|---|---|---|---|---|---|---|---|---|
| C1 Day-1 onboarding | Checklist-driven first day (badge, locker, team intro, tour) | Start date | HR + line supervisor | Checklist template per job family | Completed checklist with sign-offs | Supervisor sign-off | Day 1 | Not started, In progress, Complete, Overdue | N-10 |
| C2 Insurance and records | Social-insurance enrolment, bank/payroll set-up, tax data | Day 1 | HR officer | National ID, insurance data | Enrolment confirmation | Payroll officer | Within the legal enrolment window (verify; unverified) | Pending, Submitted, Confirmed | N-11 |
| C3 Safety induction, PPE, uniform | Must precede machine access | Day 1 | OHS officer + store | PPE matrix per job, sizes | Induction record, PPE/uniform issue slip with employee signature | OHS officer | Before first shift on line | Pending, Done | N-12 |
| C4 Probation | Structured evaluation with checkpoints (e.g. day 30/60/80) | Start date | Line supervisor | Probation form | Probation reviews | Dept head and HR | Review due 7 days before end | In probation, Review due, Confirmed, Extended (only if law allows), Terminated | N-13 |
| C5 Confirmation | Move to permanent status; payroll and benefits switch | End of probation | HR Manager | Evaluation | Confirmation letter | Dept head + HR | Before day 90 end | Pending, Confirmed | N-14 |

Probation is capped at 3 months and may be imposed once ([ZenHR](https://www.zenhr.com/en/egypt-labor-law)). The system must hard-warn before day 80 and must **not allow extension beyond the configured cap**.

#### D. Run

| Sub-process | Purpose | Trigger | Owner | Inputs | Outputs / documents | Approvals | SLA (Rec.) | Statuses | Notifications |
|---|---|---|---|---|---|---|---|---|---|
| D1 Core records | Authoritative employee master (identity, contacts, emergency contact, bank, dependants, documents, history) | Hire; any change | HR officer | Documents | Employee file (digital, retained at least 5 years post-exit: [Deloitte](https://www.deloitte.com/middle-east/en/services/tax/perspectives/egypt-new-labor-law-entering-into-effect.html)) | Sensitive-field changes need HR Manager (§4) | Change posted in 2 days | Candidate, Pre-boarding, Probation, Active, On leave, Suspended, Notice period, Terminated, Alumni | N-15 |
| D2 Shifts and rosters | Publish who works which shift | Weekly/monthly cycle | Production supervisor, approved by Production Manager | Demand plan, availability, leave, skills | Roster (§2.1) | Production Manager; HR checks compliance (rest, caps) | Publish 7 days ahead | Draft, Published, Amended | N-16, N-17 |
| D3 Time and attendance | Capture actual presence | Every clock event | Supervisor (exceptions), HR (policy) | Device punches, roster | Daily attendance record, exception list | Supervisor approves exceptions | Close exceptions within 24 h; period lock before payroll | Present, Late, Absent, On leave, Missing punch, Pending correction | N-18, N-19 |
| D4 Leave | Request and approve leave; keep balances accurate | Employee request | Supervisor → HR | Balance, roster, coverage | Leave record, balance update, leave form | Supervisor → HR (→ Dept head over N days) | Decide in 1 working day (urgent: same shift) | Draft, Pending, Approved, Rejected, Cancelled, Taken | N-20, N-21 |
| D5 Overtime | Control extra hours and cost | Production need | Supervisor requests | Roster, OT cap, budget | Overtime authorisation, hours for payroll | Supervisor → Production Manager → HR (cap check) | Pre-approval before shift; retroactive allowed within 48 h with reason | Requested, Approved, Rejected, Worked, Verified, Paid | N-22 |
| D6 Payroll | Monthly pay run | Cut-off date | Payroll officer | Attendance, OT, leave, deductions, loans, insurance, tax | Payroll register, payslips, bank file, insurance data | Payroll officer → HR Manager → Finance → GM (variance gate) | Run within 3 days of cut-off | Draft, Calculated, Checked, Approved, Paid, Closed | N-23, N-24 |
| D7 Loans and deductions | Advances (سلف), penalties, damages, schedules | Request / decision | HR + Finance | Request, ceiling, history | Loan agreement, repayment schedule, deduction notice | Dept head → HR → Finance (→ GM above ceiling) | 3 working days (emergency: same day) | Requested, Approved, Disbursed, Repaying, Settled, Written off | N-25 |
| D8 Allowances and benefits | Transport, meal, night, shift, attendance bonus, social/medical insurance | Policy/contract | HR + Payroll | Allowance rules | Allowance lines on payslip | HR Manager | Monthly | Active, Suspended | — |

#### E. Develop

| Sub-process | Purpose | Trigger | Owner | Inputs | Outputs / documents | Approvals | SLA (Rec.) | Statuses | Notifications |
|---|---|---|---|---|---|---|---|---|---|
| E1 Performance | Fair rating tied to pay/promotion; simple form for blue-collar | Quarterly/annual; probation end | Line supervisor | Goals/KPIs, attendance, quality data | Appraisal form | Supervisor → Dept head → HR | 14 days per cycle | Not started, Self (optional), Supervisor, Calibrated, Final, Acknowledged | N-26 |
| E2 Learning and skills | Keep people qualified and certificates valid | Hire, new machine, expiry, incident | HR/Training officer + OHS | Skills matrix, course catalogue | Training records, certificates, matrix | Dept head | Renewal task 60 days pre-expiry | Planned, Scheduled, Attended, Passed, Failed, Expired | N-27, N-28 |
| E3 Career / promotion / transfer | Grade change, shift/department move | Appraisal, vacancy | HR Manager | Skills, performance, vacancy | Promotion/transfer letter, pay-change record | Dept head → HR → Finance → GM | 5 days | Proposed, Approved, Effective, Rejected | N-29 |

#### F. Protect

| Sub-process | Purpose | Trigger | Owner | Inputs | Outputs / documents | Approvals | SLA (Rec.) | Statuses | Notifications |
|---|---|---|---|---|---|---|---|---|---|
| F1 Discipline and grievance | Lawful, documented penalties; give employees a voice | Violation report; grievance | HR Manager (committee) | Incident facts, regulations | Violation notice, hearing minutes, decision, warning/deduction letter; grievance record | HR + Dept head; dismissal by GM and legal | Start investigation within 7 days of discovery ([sadanykhalifa](https://sadanykhalifa.com/ar/single-blog/442)) | Reported, Notified, Hearing, Decided, Appealed, Closed | N-30, N-31 |
| F2 OHS | Prevent injury and prove compliance | Incident, near-miss, inspection | OHS officer | Reports, PPE logs, risk assessment | Incident report, corrective action (CAPA), KPI feed | OHS officer + Plant Manager | Report within 24 h; investigation 72 h (Rec.) | Reported, Investigating, Actions open, Closed | N-32, N-33 |
| F3 Medical and sick leave | Manage certified sickness and fitness for work | Sick note | HR + clinic | Medical certificate | Sick record, return-to-work assessment | HR | 1 day | Open, Certified, Returned, Extended | N-34 |
| F4 Legal cases | Track labour-court and labour-office cases | Claim/summons | HR + Legal counsel | Case documents | Case file, hearing dates, outcome, provisions | HR Manager + GM | Hearing reminders | Opened, Hearing scheduled, Judgement, Appeal, Closed | N-35 |

#### G. Retain

| Sub-process | Purpose | Trigger | Owner | Inputs | Outputs / documents | Approvals | SLA (Rec.) | Statuses | Notifications |
|---|---|---|---|---|---|---|---|---|---|
| G1 Recognition and incentives | Reward attendance, safety, output | Month end | Supervisor + HR | KPIs | Bonus list, certificate, announcement | Dept head + HR + Finance | Monthly | Nominated, Approved, Paid | N-36 |
| G2 Engagement | Pulse surveys, suggestion box, exit trends | Quarterly | HR | Short Arabic voice/pictogram survey | Report | — | Quarterly | Open, Closed | N-37 |
| G3 Retention risk | Flag likely leavers (rising lateness, absence, no raise > 12 months) | Weekly job | HR | Attendance, tenure, raise date | Watch-list, stay conversation | HR | Weekly | Flagged, Talked, Resolved | N-38 |

#### H. Separate

| Sub-process | Purpose | Trigger | Owner | Inputs | Outputs / documents | Approvals | SLA (Rec.) | Statuses | Notifications |
|---|---|---|---|---|---|---|---|---|---|
| H1 Resignation / termination | Lawful exit | Resignation, dismissal, contract end, death, retirement, absence treated as resignation | HR Manager | Letter, notice rules | Resignation form (labour-office validation, 10-day withdrawal and 10-day employer reply per [Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law), [ZenHR](https://www.zenhr.com/en/egypt-labor-law)), termination letter | Dept head → HR → GM; legal check for dismissals | Respond within 10 days | Submitted, Validated at labour office, Accepted, Withdrawn, Notice, Last day, Closed | N-39, N-40 |
| H2 Exit interview | Learn reasons for leaving | Notice start | HR officer (not the line manager) | Questionnaire | Reason code, notes | — | Last week of notice | Scheduled, Done, Declined | N-41 |
| H3 Clearance | Recover assets and release access | Notice period | HR coordinates; Store, IT, Finance, OHS, Security, Supervisor sign | Custody list (§2.8) | Clearance form | Each department signs | Complete before final settlement | Open, Partially cleared, Cleared | N-42 |
| H4 Final settlement | Compute everything owed or due | Last working day | Payroll + HR | Salary, leave balance, bonus, loans, deductions, notice pay/compensation | Final settlement statement | Payroll → HR → Finance → GM | Pay within 7 days (Rec.; verify the legal deadline, unverified) | Draft, Calculated, Approved, Paid | N-43 |
| H5 Insurance exit and certificates | Notify social insurance; issue experience certificate | Termination | HR officer | Exit date | Social-insurance exit form (e.g. "Form 6": unverified), experience certificate, clearance receipt | HR Manager | 3 days | Pending, Submitted, Issued | N-44 |
| H6 Alumni / rehire pool | Keep door open for good leavers | Exit | HR | Exit reason, rating | Rehire flag (eligible / not), talent pool entry | HR | — | Eligible, Not eligible | — |

### 1.4 Employee status state machine (Rec.)

`Candidate → Offered → Pre-boarding → Probation → Active ⇄ On leave / Suspended → Notice period → Terminated → Alumni`
Guard rules: no payroll without Active/Probation; no machine access without Safety Induction = Done; no Terminated until the clearance and final-settlement tasks are closed or waived by the GM (with audit reason).

---

## 2. Manufacturing / blue-collar specifics

Evidence base for tool behaviour: [Connecteam kiosk](https://connecteam.com/employee-time-clock-app/time-clock-kiosk-app/) and [reviews](https://connecteam.com/best-time-clock-kiosk-apps/) (frontline time clock/scheduling), [ZenHR attendance](https://blog.zenhr.com/en/what-features-does-zenhr-offer-for-payroll-attendance) and [ZenHR Egypt](https://www.zenhr.com/hr-payroll-software/egypt) (regional), and training-matrix tools ([Vector Solutions](https://www.vectorsolutions.com/resources/blogs/manufacturing-training-matrix/), [CompMatrx listing](https://www.getapp.com/all-software/a/compmatrx/), [Odoo add-on](https://apps.odoo.com/apps/modules/18.0/mandatory_training_matrix_compliance)). Any statement about Quinyx, Deputy, Kronos/UKG, SAP SuccessFactors, Oracle or Odoo behaviour beyond these is **(unverified)**.

| # | Need | What generic HR tools miss | Best-practice handling (what to build) | How leading tools do it |
|---|---|---|---|---|
| 2.1 | **Shift patterns and rotating rosters** | Assume fixed 9-to-5 | Shift templates (A/B/C 8 h, 12 h variants), rotation patterns (e.g. 6-on/1-off with weekly rotation), shift groups/crews, roster calendar with drag-and-drop, copy-week, swap requests with supervisor approval, publish and acknowledge. Compliance checks: minimum rest between shifts, weekly rest of 24 h ([ZenHR](https://www.zenhr.com/en/egypt-labor-law)), daily cap. Handle shifts that cross midnight (attribute to start date). Gamasa commute: transport route attached to shift | Connecteam: drag-and-drop, repeating shifts, templates, reminders; kiosk blocks clock-in without a scheduled shift (per [reviews](https://connecteam.com/best-time-clock-kiosk-apps/), vendor/review-site claims) |
| 2.2 | **Night-shift allowance** | One flat flag | Rule: shift window defines "night hours"; allowance = rate per night shift or % of base; separate from night overtime premium (+70% per [ZenHR](https://www.zenhr.com/en/egypt-labor-law); conflicting 135% claim seen, so keep configurable). Show on payslip as its own line | Generic payroll engines allow pay-element rules by time band (unverified) |
| 2.3 | **Overtime approval and caps** | Overtime computed after the fact | Pre-approval request by supervisor; caps per employee/day/week/month and per department budget; show running OT hours in the approval screen; hard stop or escalation at cap; reason code; rate by day type (weekday, night, weekly rest, public holiday: rates in §0.1); option to bank as compensatory time. Total daily hours limit (secondary source says 10 h: unverified) | Approval chains with threshold escalation are standard in workforce suites (unverified) |
| 2.4 | **Piece-rate / productivity incentives** | No production-data link | Incentive plan = formula over production output per crew/line (units, kg, m2 of profile), quality (reject rate) and attendance gate (no bonus if > N unexcused absences). Inputs imported from the production/MES module; a supervisor reviews the monthly incentive sheet; payroll pulls approved amounts. Keep individual and crew-level modes | Usually a custom integration or pay-element in ERP payroll (unverified) |
| 2.5 | **Attendance via biometric / RFID / face; gate / turnstile** | Only GPS/web clock-in | Device-agnostic punch ingest (ZKTeco-style push or pull, CSV fallback), device registry per gate/line, raw punch log immutable; pairing rules for IN/OUT; missing-punch workflow; anti-buddy-punching (face match or photo capture; see Connecteam selfie option per [reviews](https://brainsensei.com/connecteam-time-clock-app-review/): single review, unverified); offline buffering at device; turnstile event = gate presence (separate from line presence, if "line clock" exists) | ZenHR supports ZKTeco-family devices, biometric (fingerprint and face via BioTimeCloud), QR and GPS clock-in, and ties attendance to payroll ([ZenHR](https://blog.zenhr.com/en/what-features-does-zenhr-offer-for-payroll-attendance), [ZenHR Egypt](https://www.zenhr.com/hr-payroll-software/egypt)) |
| 2.6 | **Absence without notice** | Marks "absent" and stops | Auto-detect (no punch, no leave, no sick note) → supervisor call-log task same day → HR day-2 task → written notice template after N days → status "absence pending decision". Under Law 14/2025 unjustified absence is reportedly treated as voluntary resignation, not gross misconduct ([Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law)). Verify the exact conditions and notice sequence before automating any termination; Rec.: system only **proposes**, HR Manager decides | Escalation ladders exist as configurable rules in mature suites (unverified) |
| 2.7 | **Contractor / agency / daily-wage labour** | Treats everyone as employee | "Worker type" on the person record: Employee / Agency worker (supplier + contract + invoice basis) / Daily-wage (day-rate, daily headcount sheet, paid weekly) / Intern. Daily muster (call-in list per supervisor), gate pass, daily cost roll-up, attendance by supplier for invoice verification, safety induction still mandatory, contractor headcount shown separately in KPIs. Seasonal staffing: temporary requisition type with end date and auto-expiry reminder. Employers of irregular workers face an emergency-fund contribution ([Deloitte](https://www.deloitte.com/middle-east/en/services/tax/perspectives/egypt-new-labor-law-entering-into-effect.html)); check applicability | Frontline tools treat contractors as users with limited access (unverified) |
| 2.8 | **Skills matrix and certificate expiry (machine operators)** | Training = course completions only | Skills matrix: rows = operators, columns = machines/skills, cells = level 0-4 + certificate date + expiry + proof file. Rule "operate machine X requires level ≥ 3 and a valid certificate", surfaced in the roster tool (warn if a roster violates it). Expiry alerts at 60/30/7 days; cell colour (green/amber/red); gaps feed training plan. Vector Solutions recommends three fields per regulated skill: last training date, expiry/renewal date, link to proof ([source](https://www.vectorsolutions.com/resources/blogs/manufacturing-training-matrix/)); they suggest spreadsheets suffice below about 50 operators, and purpose-built tools beyond that or with multiple shifts/high turnover. CompMatrx listings describe colour-coded expiry views with alerts and an audit trail ([GetApp](https://www.getapp.com/all-software/a/compmatrx/)) | Odoo add-on ties a course library to job positions and tracks certificate expiry with alerts ([Odoo apps](https://apps.odoo.com/apps/modules/18.0/mandatory_training_matrix_compliance)) |
| 2.9 | **OHS: incident / near-miss log, LTIFR / TRIR, PPE tracking, medical fitness, safety training** | Safety lives in a different system | One-tap incident form (type, severity, body part, location, shift, witnesses, photos) usable from kiosk; near-miss as a first-class record (high volume is good); investigation + CAPA with owner and due date; hours-worked feed from attendance for rate denominators; PPE issue ledger (item, size, issue date, replacement due, signed slip); medical fitness records with next-due dates; safety-training matrix as above; toolbox-talk attendance. Egyptian OHS rules: Book 5 / Decree 134/2003 ([Rivermate](https://rivermate.com/guides/egypt/health-and-safety)). Reporting deadlines to authorities: **unverified**, get them from the Arabic text | EHS platforms (unverified); formulas in §3 |
| 2.10 | **Uniform and tool custody** | Asset module absent | Custody ledger: item, qty, size, issued date, condition, signature (kiosk PIN or tick on paper slip scanned), return/replace due date, charge-back rule for loss. Clearance (H3) auto-lists outstanding custody; value feeds the final settlement; deduction limit rules apply | Asset assignment is common in HRIS/IT modules (unverified) |
| 2.11 | **Transport and meal allowances; factory canteen** | Cash allowances only | Allowance types: fixed/monthly, per attended day, per shift; attendance-dependent rules. Canteen: meal entitlement by shift (taps on RFID card/QR), subsidised meal cost deduction or free entitlement; meal count per shift reported to canteen supplier. Transport: bus-route list per shift, seat allocation, route attendance. All values policy-driven | Allowance rules exist in regional payroll tools (unverified) |
| 2.12 | **Loans / advances (سلف) and deduction schedules** | One-off deduction | Loan product table (max amount as multiple of salary, max instalments, max monthly deduction %), request → approval chain → disbursement record → instalment schedule → auto-deduct in payroll → early settlement → balance on final settlement. Keep loan deductions inside the legal deduction ceiling (discipline deductions are capped at 5 days' pay/month per [sadanykhalifa](https://sadanykhalifa.com/ar/single-blog/442); the ceiling that applies to loan repayments is **unverified**; confirm with counsel). Show employee a clear schedule and statement | Loan modules exist in regional payroll tools (unverified) |
| 2.13 | **Labour-court / legal case tracking** | No legal module | Case register (court/labour office, case number, plaintiff, claim type, amount claimed, hearing dates, lawyer, documents, outcome, provision booked). Hearing reminders to HR and lawyer; link to employee file with confidentiality tier; case status feeds the provision figure for Finance. Labour courts are specialised from 1 Oct 2025 ([Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law)) | Typically a custom/matter-management tool (unverified) |
| 2.14 | **Egypt-specific payroll items** | Tax and insurance rules differ | Social insurance employee 11% / employer 18.75% within floor/cap that change every January ([PwC](https://taxsummaries.pwc.com/Egypt/Individual/Other-taxes), [Nativeteams](https://help.nativeteams.com/egypt-payroll-changes-2026)); annual raise at least 3% of insurable salary ([Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law)); income tax brackets (unverified; not researched); wage data update forms to NOSI ([BDO](https://www.bdo.global/en-gb/insights/tax/expatriate-tax/egypt-maximum-and-minimum-salaries-subject-to-social-insurance-increased)) | ZenHR advertises Egypt payroll with taxes, social insurance, martyrs tax and gratuity ([ZenHR Egypt](https://www.zenhr.com/hr-payroll-software/egypt)) |

---

## 3. KPIs and dashboards

### 3.1 Formulas

Common conventions: "period" is a month unless stated. "Average headcount" = (headcount at period start + headcount at period end) / 2. **Count employees only** unless the metric is marked "incl. contractors". Source for the turnover/time-to-fill/cost-per-hire definitions is the [SHRM monthly metrics form](https://shrm.org/topics-tools/tools/forms/hr-department-monthly-metrics-report) and [Rippling](https://www.rippling.com/blog/best-metrics-to-track-for-hr); other formulas are standard definitions (unverified as to a single authority) unless a URL is given.

| KPI | Exact formula | Direction | Notes / pitfalls |
|---|---|---|---|
| Headcount (period end) | Count of employees with status in {Probation, Active, On leave, Suspended, Notice} on the last day | — | Report FTE too: FTE = Σ(contracted hours) / standard hours. Show employee vs contractor vs daily-wage separately |
| Average headcount | (Start + End) / 2 | — | Denominator for rates |
| Turnover rate | Separations in period / Average headcount × 100 ([SHRM form](https://shrm.org/topics-tools/tools/forms/hr-department-monthly-metrics-report)) | Lower | Annualise = monthly × 12 or trailing-12-month sum. Split voluntary vs involuntary; exclude end of fixed-term only if you say so. SHRM-attributed benchmark of 18%/yr appears in [Glassdoor](https://www.glassdoor.com/blog/recruiting-metrics/) (year not stated); do not use as an Egyptian target |
| Early attrition (first 90 days) | Hires in cohort who separate within 90 days / Hires in cohort × 100 | Lower | Measure by hire-month cohort. Also 1st-year retention = hires still employed after 12 months / hires in cohort × 100. (A "first-year leavers / total hires" variant exists per search results.) |
| Absenteeism rate | Unplanned absence days / (Scheduled working days × Average headcount) × 100 (a "days lost ÷ days available" form is described by [LeaveBalance](https://www.leavebalance.com/blog/absence-rate-formula/); approved annual leave is normally excluded) | Lower | Define "unplanned" = absent without approved leave (sick with certificate reported separately). Do not mix with Bradford |
| Bradford Factor | B = S² × D (S = number of separate absence spells, D = total days absent in period; [IRIS](https://help-iris.co.uk/hr/hrpro/teammngmnt/bradford-factor.htm)) | Lower | Use only as a supervisor-level flag on short repeated absences. Does not consider reason, so exclude certified sickness, maternity, work injury. Rolling 52 weeks |
| Lateness rate | Late arrivals / Scheduled shifts attended × 100. Companion: average minutes late | Lower | Define grace period (e.g. 10 min) as policy; shift-start based, not calendar-day based |
| Overtime % | Overtime hours / Regular scheduled hours × 100. Cost view: OT pay / Base pay × 100 | Watch | Show per department and per employee vs cap |
| Time to fill | Σ(days from requisition approval to offer acceptance) / Hires ([SHRM form](https://shrm.org/topics-tools/tools/forms/hr-department-monthly-metrics-report): days elapsed to fill / number hired; a vendor guide uses requisition opening to offer acceptance) | Lower | Time to hire = first candidate contact → acceptance. Keep both. A 2017 SHRM benchmark of 36 days is cited in search results (secondary): context only |
| Cost per hire | (Internal recruiting cost + External cost [agency fees, ads, tests, medical, travel]) / Hires in period ([SHRM form](https://shrm.org/topics-tools/tools/forms/hr-department-monthly-metrics-report)) | Lower | Decide whether onboarding cost is included. Vendor guides differ |
| Offer acceptance rate | Offers accepted / Offers extended × 100 | Higher | Track decline reasons (pay, distance, shift) |
| Source effectiveness | Hires from source / Applicants from source; retention of hires from source at 90 days | Higher | Referral vs walk-in vs agency |
| Training hours per employee | Total training hours in period / Average headcount | Higher | Split mandatory safety vs skill training |
| Training completion / matrix coverage | Employees with all required, valid skills for their position / Employees × 100 | Higher | Per department and per machine |
| Compliance expiry rate | Required certificates/medicals expired / Required certificates × 100. Companion: "expiring ≤ 30/60/90 days" count | Lower (target 0) | Block roster assignment for safety-critical expired items |
| Payroll cost % of revenue | Total employment cost (gross pay + employer insurance + allowances + bonuses) / Revenue × 100 | Watch | Needs revenue from Finance module; show contractors cost separately |
| Revenue per employee | Revenue / Average headcount (or FTE) | Higher | Use production tonnage/m2 per labour hour as plant-level alternative |
| Labour cost per unit | Total labour cost / Units (or kg/m2) produced | Lower | The metric a GM actually acts on (unverified framing) |
| Overtime-adjusted productivity | Output / Total hours worked (regular + OT) | Higher | |
| LTIFR (international form) | Lost-time injuries × 1,000,000 / Total hours worked ([ehsinsight](https://ehsinsight.com/blog/what-is-lost-time-injury-how-do-you-calculate-it-and-why-should-you-track-it)) | Lower (target 0) | Some countries use 200,000 for "LTIR" (same source); state the base on the widget |
| TRIR (OSHA basis) | Recordable incidents × 200,000 / Total hours worked ([hseblog](https://www.hseblog.com/trir/), [NSC](https://injuryfacts.nsc.org/definitions/trir-total-recordable-incident-rate/)) | Lower | 200,000 = 100 FTE × 40 h × 50 weeks. TRIR counts all recordables, LTIFR only lost-time cases, and bases differ, so they are not interchangeable |
| Severity rate | Lost days × 1,000,000 / Hours worked (unverified definition; confirm base before use) | Lower | |
| Near-miss ratio | Near-misses reported / Recordable incidents | Higher (more reporting is healthy) | Rec. as leading indicator |
| Days since last lost-time injury | Today − date of last LTI | Higher | Kiosk and gate display |
| Contractor ratio | Contractor + daily-wage headcount / Total workforce | Watch | |
| Payroll accuracy | Payslips with correction / Payslips issued × 100 | Lower | |
| Loan exposure | Outstanding loan balance / Monthly net payroll | Watch | |
| Disciplinary rate | Disciplinary cases / Average headcount × 100 | Lower | Split by penalty level |
| Disability quota compliance | Employees with disabilities / Headcount × 100 vs 5% requirement for employers with 20+ staff ([Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law)) | ≥ 5% | |
| Raise-due backlog | Employees whose last raise is more than 12 months ago / Headcount | Lower | Annual raise of at least 3% ([Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law)) |
| Leave liability | Σ(unused leave days × daily rate) | Watch | Finance accrual |

### 3.2 Dashboard design by audience (Rec.; widget choices follow the form heuristic of one question per widget)

| Audience | Question they ask | Widgets (chart type) | Refresh |
|---|---|---|---|
| **Owner / GM** | "Is labour cost under control, are we safe, are we stable?" | KPI strip (headcount; turnover T12M; payroll % revenue; LTIFR; days since last LTI) each with sparkline and target band; **labour cost per unit** trend (line); headcount vs budget by department (bullet chart); risk list top 5 (expiring compliance, high-OT departments, open legal cases); monthly OT cost vs budget (column + line) | Daily; monthly pack |
| **HR Manager** | "What needs my action today and what is drifting?" | Approval inbox count; probation ends in 14 days (list); exceptions (missing punches, absence-without-notice); requisition funnel (horizontal funnel/bars); early-attrition cohort table (heatmap by hire month); turnover by department and reason (stacked bar); compliance expiry calendar (timeline/heatmap); open cases (legal, grievance, discipline) with next hearing | Live |
| **Production supervisor / line leader** | "Who is on my shift, who is missing, who can run what?" | Today's roster vs present (list with status chips); gap vs minimum crew; absent-no-call list with phone button; OT used vs cap (progress bar per person); skills coverage for today's machines (matrix); pending approvals (leave swap, OT); safety toolbox-talk checkbox | Live, mobile-first |
| **Employee** | "My shift, my pay, my balance, my requests" | Next shift card; leave balance; this month attendance summary (late/absent); payslip list; loan balance and next instalment; requests with status chips; PPE/uniform due | On open |
| **Payroll officer** | "Can I close the month?" | Cut-off checklist; variance vs last month (table with flags); unapproved OT; negative-net list; insurance mismatches | Month-end |
| **OHS officer** | "Where are the hazards and who is not compliant?" | Incident log (table), TRIR/LTIFR trend (line), near-miss count by area (bar), PPE replacement due, medical fitness due, CAPA overdue | Live |

Design rules (Rec.): traffic-light always with an icon or text (colour-blind safe); targets drawn as bands; every number drills to the list of people behind it; show "as of" timestamp; avoid pie charts beyond 3 slices; adminlte's [HR dashboard roundup](https://adminlte.io/blog/hr-dashboard-design-examples/) is a convenient visual reference (not verified in depth). Numbers on owner dashboards must reconcile with payroll (single definition per KPI, stored in a KPI-definition table with owner and formula text).

---

## 4. Approval workflows and RBAC

### 4.1 Approval matrix (Rec.; thresholds are placeholders for management to set)

| Request | Step 1 | Step 2 | Step 3 | Step 4 | Escalation / rules |
|---|---|---|---|---|---|
| Leave (annual/casual) | Direct supervisor | HR (balance, policy check) | — | — | Auto-escalate to Dept head after 1 working day; coverage check against roster; sick leave needs medical certificate attachment |
| Sick leave (certified) | HR records | — | — | — | Supervisor informed only (privacy: no diagnosis) |
| Overtime | Supervisor requests | Production Manager | HR (cap check) | Finance if over budget | Pre-approval; retroactive within 48 h with reason; emergency override logged |
| Shift swap | Both employees | Supervisor | — | — | Rest and skill rules checked automatically |
| Advance / loan | Dept head | HR | Finance | GM above ceiling | Cannot approve own; amount above limit needs GM |
| Hiring requisition | Dept head | HR | Finance (if unbudgeted) | GM (above threshold / new post) | |
| Offer | HR Manager | Dept head | GM (if above band) | — | |
| Salary / grade change | Dept head | HR Manager | Finance | GM | Effective-dated; the person making the change cannot approve it |
| Disciplinary penalty | Supervisor reports | HR investigates | HR Manager + Dept head decide | GM + legal for dismissal | Procedure per Art. 139 as reported ([sadanykhalifa](https://sadanykhalifa.com/ar/single-blog/442)); each step time-stamped |
| Termination (employer-initiated) | Dept head | HR Manager | Legal check | GM | Cannot terminate during certified sick leave ([ZenHR](https://www.zenhr.com/en/egypt-labor-law)): add a system block |
| Resignation acceptance | HR Manager | GM (managers) | — | — | Labour-office validation tracked as a task ([Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law)) |
| Payroll run | Payroll officer prepares | HR Manager reviews | Finance approves | GM (variance gate) | Maker/checker; lock period after approval |
| Final settlement | Payroll | HR | Finance | GM | Clearance gate |
| Custody write-off | Store | HR | — | — | |
| Document issuance (salary certificate) | HR officer | HR Manager (signature) | — | — | Log every certificate issued, to whom, purpose |

### 4.2 Roles (Rec.)

Employee (self), Line Supervisor, Department Head, Production Manager, HR Officer, HR Manager, Payroll Officer, Finance Controller, OHS Officer, Store Keeper, Legal/Case Handler, GM/Owner, Auditor (read-only), System Admin (no HR data by default).
Access is attribute-based (ABAC) on top of roles: a supervisor sees only people in their reporting line or shift group, an HR officer sees only assigned sites/departments, and Finance sees pay but not discipline or medical.

### 4.3 Segregation of duties (hard rules)

1. Whoever **creates** a payroll change, loan or bank-account change cannot **approve** it.
2. Bank-account changes require a second person plus a 24 h delay notification to the employee.
3. The person who calculates the final settlement is not the person who pays it.
4. HR officers cannot edit their own record or their relatives' (flag relationship in data).
5. Admins who manage users cannot see salary or medical data.
6. Delegation (a manager on leave) is time-boxed, logged, and cannot delegate self-approvals.

### 4.4 Confidentiality tiers (Rec.)

| Tier | Data | Who |
|---|---|---|
| T0 Public | Name, job title, department, work phone, photo | All staff |
| T1 Internal | Shift, roster, attendance for team, leave dates (no reason) | Supervisors for their team, HR |
| T2 Restricted | Personal phone/address, national ID, dependants, bank details, performance ratings | HR, payroll, the employee |
| T3 Confidential | Salary, allowances, loans, deductions, bonuses | Payroll, HR Manager, Finance, GM; employee sees own |
| T4 Highly confidential | Medical records, discipline and investigation files, legal cases, grievances, termination reasons | HR Manager, OHS officer (medical only), Legal, GM; employee sees own with limits |

Field-level masking: show last 4 digits of ID or bank account by default with "reveal" that writes an audit entry.

### 4.5 Audit trail

- Append-only audit log: who, what, old value, new value, when, device/IP, reason; no deletes (soft delete with tombstone).
- Log **reads** of T3/T4 data and exports; alert on bulk export.
- Approval steps time-stamped; "approved on behalf" marked with the delegate.
- Retain the log at least as long as the employee file (minimum 5 years after termination: [Deloitte](https://www.deloitte.com/middle-east/en/services/tax/perspectives/egypt-new-labor-law-entering-into-effect.html)).
- Monthly access review report for the GM; quarterly role-recertification.

---

## 5. Employee self-service (ESS) and manager self-service (MSS)

Evidence: Connecteam's kiosk uses a fixed tablet with personal PINs, optional selfie, shift-aware restrictions, reviewed as suitable for deskless teams ([Connecteam kiosk](https://connecteam.com/employee-time-clock-app/time-clock-kiosk-app/), [reviews](https://brainsensei.com/connecteam-time-clock-app-review/): third-party claims). ZenHR provides ESS and MSS apps in Arabic and English plus QR/GPS/biometric clock-in ([ZenHR](https://www.zenhr.com/hr-payroll-software/egypt)). Everything below is **Rec.** unless cited.

### 5.1 Principles for low-digital-literacy workers

1. **Five tasks only on the home screen:** my shift, my pay, my leave, my requests, report a problem.
2. **Big targets:** minimum 48 px touch targets, 16-18 px base text, high contrast, one primary action per screen.
3. **Icon + word + colour** together; add optional voice playback for key screens (Arabic TTS).
4. **Login without passwords:** employee code + PIN, or phone OTP (WhatsApp/SMS); face login on kiosk; long sessions on personal phones.
5. **Dialect-friendly Arabic microcopy** (Egyptian colloquial where appropriate, short sentences, no HR jargon); keep MSA for legal documents.
6. **Low-bandwidth:** PWA, light pages, offline queue for requests, SMS fallback.
7. **Forms with three fields at most;** dates via a big calendar with Friday and holidays marked; leave balance shown before submit.
8. **Confirmation by outcome:** "تم إرسال الطلب لمشرفك" with a status chip and the expected response time.
9. **Paper bridge:** printable QR slip for anyone without a phone; supervisor submits on their behalf (flagged "on behalf").

### 5.2 Employee self-service features

Schedule and swap; clock status; attendance history with dispute button ("نسيت البصمة"); leave request with balance; overtime acknowledgement; payslip (PDF + simple breakdown: base, allowances, overtime, deductions, net); loan request and schedule; document requests (salary certificate); personal data update (needs HR approval for sensitive fields); PPE/uniform due; safety report; policy acknowledgement (tap-to-sign); pulse survey; notifications inbox.

### 5.3 Manager (supervisor) self-service

Today's board (present/absent/late); approve in one tap with swipe or big buttons (approve / reject with reason chips); bulk approve for OT; call/WhatsApp button next to an absent person; roster editing with rule warnings; probation reviews due; team compliance (certificates expiring); incident quick report; "on behalf" entry.

### 5.4 Shop-floor kiosk mode

- Locked-down tablet in a rugged mount at each gate/line: PIN or card/face; large tiles (clock in/out, my shift, my leave balance, report incident, tool/PPE request).
- Shift-aware (warn if clocking outside own shift: see Connecteam behaviour in [reviews](https://connecteam.com/best-time-clock-kiosk-apps/)); auto-return to idle after 15 s; **no sensitive data on screen** (no salary), because the screen is public.
- Offline mode with queue and server-time reconciliation (vendor claim for Connecteam is a single review: unverified; make it a requirement for EG regardless).
- Announcement banner (safety alert of the day, days since last LTI).
- Admin PIN to exit kiosk; device heartbeat to HR; battery/network status.

### 5.5 WhatsApp-style notifications

- Use WhatsApp Business **utility templates** for transactional messages (leave decision, roster published, payslip ready). A vendor guide notes Utility messages are cheaper than Marketing and that mis-categorising marketing content as Utility is a risk; it quotes roughly $0.003 vs $0.027 per message in Egypt, which is third-party and may be outdated: [Recruitera](https://recruitera.ai/blog/whatsapp-templates-utility-marketing-guide). Arabic/RTL template support is claimed by vendors only (unverified), so **test with Meta approval early**.
- Managers approving by replying "1 / 2" or tapping buttons is described in vendor case studies ([ChatArchitect](https://chatarchitect.com/news/automating-hr-workflows-with-whatsapp-api-and-custom-platforms)); treat as a pattern to prototype.
- Rules: one message = one action; first line states the action; deep link opens the exact request; quiet hours for Info level; fall back to SMS if undelivered after N minutes for Urgent; never include salary or medical detail in message text.
- Keep the in-app notification centre as the system of record; WhatsApp is delivery only.

---

## 6. UX / UI patterns

### 6.1 Vendor patterns (read with caution)

The search pass produced little verifiable layout detail. Verified: BambooHR includes a "Who's Out" time-off calendar, mobile access, and a central dashboard for managers/HR to track and approve requests ([BambooHR Time Off](https://www.bamboohr.com/platform/time-and-attendance/time-off)); Rippling's dashboard spans HR/IT/spend/payroll products with a customisable home, per review summaries ([Capterra](https://www.capterra.com/p/172127/Rippling/reviews/?page=6)); HiBob is praised for a modern, social-style UI; Personio reviewers describe it as dense (German review, per search). The rest of the table is general product knowledge: **(unverified)** and should be checked on trial accounts.

| Screen | Pattern seen in leading tools (unverified unless cited above) | Rec. for EG |
|---|---|---|
| Home / dashboard | Greeting + task list ("To do") + shortcuts + company feed (HiBob, BambooHR); module tiles with alerts (Rippling) | Role-based home: **"What needs me today"** list first, KPI strip second. No social feed for v1 |
| Employee directory | Searchable card/table toggle with filters (department, location, status); quick contact | Table-first (Arabic names, code, department, shift, status); filters persisted; phone numbers shown LTR |
| Employee profile | Left tabs: Overview, Job, Pay, Time off, Documents, Performance, Timeline; header with photo and key facts; sensitive tabs permissioned | Tabs: Overview, Employment, Attendance, Leave, Pay (T3), Skills and certificates, Safety and PPE, Custody, Discipline (T4), Documents, Timeline. Alert bar for expiring items |
| Org chart | Interactive tree with collapse, zoom, and "reports to" navigation | Tree plus **shift/crew view** (more useful in a plant). Collapse by default; print to A3 |
| Absence calendar | Month/timeline calendar of who's out with colour by leave type (BambooHR "Who's Out": cited) | Add coverage line (minimum crew vs present) and Friday/holiday shading; Hijri secondary label |
| Approval inbox | Single list of pending items with type, requester, age, one-click approve/reject; bulk actions (Rippling/Zoho style, unverified) | One inbox for all request types with age timer and SLA colour; split by "I must act" vs "I'm waiting on" |
| Attendance exceptions | Table of anomalies (missing punch, late, early out) with inline fix and approve | Daily exception queue by shift; one-tap "accept device time / enter time / mark absence" with reason; reconcile before payroll lock |
| Payroll run wizard | Stepper: select period → review inputs → calculate → pre-run checks (errors/warnings) → approve → pay/export → payslips | Steps: Period lock → Inputs (attendance, OT, leave, loans) → Calculate → **Checks** (new hires, leavers, negative net, variance > X%, missing bank, insurance cap) → Approve (maker/checker) → Bank file + payslips → Close |
| Onboarding checklist | Template of tasks assigned to owners (HR, supervisor, IT, new hire) with due dates and progress bar | Job-family templates; tasks assigned to Store/OHS/Payroll/Supervisor; "no line access until safety induction" gate |
| Offboarding checklist | Same engine, exit tasks: access, assets, interview, settlement | Clearance matrix by department with sign-off; settlement locked until all signed or waived |
| Reports builder | Pick object → fields → filters → group → chart/table; save/schedule/export | Saved report library with owner, schedule via WhatsApp/email, export to Excel and PDF with Arabic fonts; every KPI in §3 prebuilt |

### 6.2 Arabic RTL and numeral gotchas

Sources: [Workday RTL/bidi guidelines](https://design.workday.com/globalization/rtl-and-bidi), [Saudisoft RTL checklist](https://localization.saudisoft.com/?p=38918), [Microsoft bidi bug note](https://learn.microsoft.com/en-us/archive/blogs/ericgu/weird-bug-i-had-yesterday). Items without a URL are Rec./(unverified).

| Area | Gotcha | Guidance |
|---|---|---|
| Document direction | Set at root | `<html lang="ar" dir="rtl">` ([Saudisoft](https://localization.saudisoft.com/?p=38918)); use CSS logical properties (`margin-inline-start`) not left/right |
| Icons | Directional icons must mirror (back, next, progress), non-directional ones (clock, check, phone) must not | Mirror per [Workday](https://design.workday.com/globalization/rtl-and-bidi); chart axes: time still runs right-to-left in an Arabic chart (Rec.; check with users) |
| Tab order | Runs right to left; arrow-key semantics per Workday | Test keyboard navigation |
| Numerals | Digits read left to right even inside RTL text ([Saudisoft](https://localization.saudisoft.com/?p=38918)). Arabic-Indic (٠١٢٣) vs Western (0123): sources disagree on which users prefer | Rec.: default to **Western digits** for IDs, codes, money, phone, time (Egyptian business convention, unverified), with a per-user switch to Arabic-Indic for reading text; store as numbers, format with `Intl.NumberFormat('ar-EG')` or `'ar-EG-u-nu-latn'` on purpose; never concatenate unlocalised strings with digits (bidi scrambling: [Microsoft](https://learn.microsoft.com/en-us/archive/blogs/ericgu/weird-bug-i-had-yesterday)) |
| Phone numbers and IDs | In RTL text, "+20 106 870 4877" can reorder or flip | Wrap in `<bdi dir="ltr">` or `unicode-bidi: isolate`; store E.164; use `dir="ltr"` inputs aligned to the start; show 14-digit national ID as LTR monospace with grouping |
| Mixed Arabic + Latin names | "Ahmed محمد" or company names in Latin break ordering; trailing punctuation jumps | Use `<bdi>` for every user-supplied name in lists and sentences; provide Arabic and English name fields (payroll bank files often need Latin spelling) |
| Names | No fixed first/last pattern; four-part names common | Store full name in 4 parts (first, father, grandfather, family) plus display name; avoid forcing "last name" |
| Dates | Hijri vs Gregorian; holidays follow Hijri and moon sighting ([ZenHR](https://www.zenhr.com/en/egypt-labor-law)) | Gregorian primary (payroll, contracts); show Hijri secondary in holiday calendar and leave picker (`Intl.DateTimeFormat('ar-EG-u-ca-islamic-umalqura')`, verify variant for Egypt: unverified); HR can adjust Eid dates once announced |
| Week | Egyptian weekly rest typically Friday (unverified; check policy) | Make week start/rest day configurable; calendar starts on Saturday (common) (unverified); mark Friday |
| Fonts | Latin-first fonts have weak Arabic; line-height too tight clips diacritics | Pick a family with true Arabic design (e.g. Noto Sans Arabic, IBM Plex Sans Arabic, Cairo; Rec.), line-height ≥ 1.6, no letter-spacing on Arabic (breaks joining) |
| Tables and charts | Numeric columns right-aligned in RTL are ambiguous | Align numbers to the end edge; keep currency symbol position consistent (`٣٬٥٠٠ ج.م` vs `EGP 3,500`); charts: legend and axis labels mirrored, tooltips RTL |
| PDF/printing | Payslips, contracts, certificates often break in HTML-to-PDF (missing shaping, bidi) | Use a renderer with Arabic shaping (e.g. headless Chromium); embed fonts; test with long names and mixed content; QR on every document for verification |
| Forms | Placeholders, validation messages, number input steppers may show different digits in different browsers ([WebKit bug discussion](https://bugs.webkit.org/show_bug.cgi?id=168290)) | Use text inputs with `inputmode="numeric"` and your own parser; accept both digit sets on input |
| Search | Arabic letter variants (أ إ آ ا, ة ه, ى ي) and diacritics | Normalise before indexing and querying; search by code, phone, national ID |
| Accessibility | Screen readers and contrast | WCAG 2.2 AA; focus order RTL; large-text mode; test with TalkBack in Arabic |
| Language switch | English fallback for managers/auditors | Whole UI bilingual; per-user language; do not rely on browser locale |

---

## 7. HR notifications catalogue

3-level scheme: **U = Urgent** (act now / safety or legal; push + WhatsApp, repeats, fallback SMS), **A = Action** (needs a decision or step; in-app + WhatsApp, reminders), **I = Info** (no action; in-app, digest, quiet hours). Channels: IA = in-app, WA = WhatsApp, SMS, EM = email, KS = kiosk banner. All are Rec. (SLA reminders follow §1.3).

| Code | Event | Recipients | Channel | Level |
|---|---|---|---|---|
| N-01 | Headcount budget needs approval | Dept head, HR, Finance, GM | IA, EM | A |
| N-02 | Requisition submitted | Next approver | IA, WA | A |
| N-03 | Requisition approved / rejected | Requester, HR recruiter | IA, WA | I |
| N-04 | New application / screening done | HR recruiter | IA | I |
| N-05 | Interview scheduled / candidate no-show | Panel, candidate (SMS/WA) | IA, WA, SMS | A (I for candidate) |
| N-06 | Offer sent / accepted / declined / expiring in 24 h | HR Manager, hiring manager, candidate | IA, WA | A |
| N-07 | Medical fitness result: unfit or fit-with-limits | HR Manager, OHS officer (restricted) | IA | A |
| N-08 | Contract ready for signature / signed | HR, employee, GM | IA, WA | A |
| N-09 | New hire starts in 3 days (checklist) | HR, Store, OHS, Supervisor, Payroll | IA, WA | A |
| N-10 | Onboarding task overdue | Task owner, HR | IA, WA | A |
| N-11 | Insurance enrolment pending > 3 days | HR officer, Payroll | IA | A |
| N-12 | Employee reached line without safety induction | OHS officer, Supervisor, HR | IA, WA, KS | **U** |
| N-13 | Probation review due in 7 days | Supervisor, HR | IA, WA | A |
| N-14 | Probation ends in 7 days without decision (day 83) | HR Manager, Dept head | IA, WA | **U** |
| N-15 | Sensitive record changed (bank, ID, salary) | HR Manager, employee (own bank change) | IA, WA | A (bank change to employee: U) |
| N-16 | Roster published / changed | Affected employees, Supervisor | WA, IA, KS | A |
| N-17 | Roster violates rule (rest, cap, uncertified operator) | Supervisor, Production Manager | IA | A |
| N-18 | Missing punch / exception to review | Supervisor | IA, WA | A |
| N-19 | Late / absent no-call detected | Supervisor (then HR at +1 day) | IA, WA | A → U if safety-critical post |
| N-20 | Leave request submitted | Supervisor; then HR | IA, WA | A |
| N-21 | Leave approved / rejected | Employee | WA, IA | I |
| N-22 | Overtime request / cap 90% reached / cap exceeded | Approver, Supervisor, HR | IA, WA | A (cap exceeded: U) |
| N-23 | Payroll cut-off tomorrow / unresolved exceptions | Payroll, HR, Supervisors | IA, EM | A |
| N-24 | Payroll approved / payslip ready | Employees (WA), Finance, GM (summary) | WA, IA | I |
| N-25 | Loan request / approved / instalment deducted / settled | Approvers, employee | IA, WA | A / I |
| N-26 | Appraisal due | Supervisor, employee | IA, WA | A |
| N-27 | Certificate or medical expires in 60 / 30 / 7 days | Employee, Supervisor, HR/Training | IA, WA | I → A → **U** |
| N-28 | Certificate expired and employee rostered on that machine | Supervisor, Production Manager, OHS | IA, WA, KS | **U** |
| N-29 | Promotion/transfer/pay change effective | Employee, Payroll, Supervisor | IA, WA | I |
| N-30 | Disciplinary violation reported; investigation must start within 7 days | HR Manager | IA, WA | A |
| N-31 | Hearing scheduled / decision issued | Employee, Supervisor, HR | IA, WA | A |
| N-32 | Incident or injury reported | OHS officer, Plant Manager, HR, GM (serious) | WA (call), IA, SMS | **U** |
| N-33 | CAPA overdue; near-miss submitted | Action owner, OHS | IA, WA | A / I |
| N-34 | Sick leave certificate pending / return-to-work due | HR, Supervisor | IA | A |
| N-35 | Court hearing in 7 / 2 days; new case opened | HR Manager, Legal, GM | IA, WA, EM | A → **U** |
| N-36 | Bonus/recognition approved | Employee, Supervisor | WA, KS | I |
| N-37 | Pulse survey open | Employees | WA, KS | I |
| N-38 | Retention-risk flag | HR Manager | IA | I |
| N-39 | Resignation submitted; labour-office validation pending; employer reply due in 10 days | HR Manager, Dept head, GM | IA, WA | A → U on day 8 |
| N-40 | Resignation withdrawn within 10-day window | HR, Dept head | IA, WA | A |
| N-41 | Exit interview scheduled | HR officer, employee | IA | I |
| N-42 | Clearance item pending (per department) | Dept signatories | IA, WA | A |
| N-43 | Final settlement ready for approval / paid | Approvers, employee | IA, WA | A / I |
| N-44 | Insurance exit filed; experience certificate ready | HR, employee | IA, WA | I |
| N-45 | Annual raise due (employees past 12 months) | HR Manager, Finance | IA, EM | A |
| N-46 | Disability quota or legal register out of compliance | HR Manager, GM | IA, EM | A |
| N-47 | Insurance wage floor/cap change effective in January | Payroll, HR, Finance | EM, IA | A |
| N-48 | Public-holiday calendar to confirm (Eid dates after announcement) | HR Manager | IA | A |
| N-49 | Kiosk/device offline > 15 min; sync backlog | HR admin, IT | IA, SMS | **U** (during shift) |
| N-50 | Bulk export of T3/T4 data; failed login burst; role change | Admin, GM/Auditor | EM, IA | **U** |
| N-51 | Contractor daily headcount submitted / differs from gate count | Production Manager, HR | IA | A |
| N-52 | Loss/damage charge-back proposed (custody) | HR, employee | IA, WA | A |

---

## 8. HR document templates catalogue

Legal documents must be Arabic-first. For employment contracts use Arabic and keep 4 copies ([Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law)). Wording, article references and mandatory content should be signed off by Egyptian counsel; the list below is **Rec.** Each template should merge fields from the employee record, carry a document number, version, QR verification, the signatory block, and be filed automatically in the employee file (retain at least 5 years after exit per [Deloitte](https://www.deloitte.com/middle-east/en/services/tax/perspectives/egypt-new-labor-law-entering-into-effect.html)).

| # | Document | Arabic name | Trigger | Signatories | Key fields / notes |
|---|---|---|---|---|---|
| **Recruitment** | | | | | |
| 1 | Job description | الوصف الوظيفي | Position creation | HR, Dept head | Duties, grade, shift type, safety-critical flag, required certificates |
| 2 | Requisition form | طلب تعيين | B1 | Requester, HR, GM | Budget line, reason, replacement for whom |
| 3 | Interview scorecard / trade test sheet | نموذج تقييم المقابلة / الاختبار العملي | B4 | Panel | Rating scale, practical task result |
| 4 | Offer letter | خطاب عرض العمل | B5 | HR Manager, candidate | Job, grade, pay components, start date, probation, validity of offer |
| 5 | ID and documents checklist | قائمة المستندات المطلوبة | B6/B8 | HR officer, employee | National ID copy, photo, military status, education certificate, criminal-record certificate if required, medical certificate, social-insurance data, bank account, residence proof, reference letters (items marked mandatory/optional per job) |
| 6 | Pre-employment medical referral and fitness certificate | طلب كشف طبي / شهادة لياقة | B6 | OHS officer, doctor | Fit / fit with limits / unfit |
| **Contract and onboarding** | | | | | |
| 7 | Employment contract (indefinite) | عقد عمل غير محدد المدة | B7 | Employer, employee | Arabic, 4 copies; probation clause consistent with the 3-month cap |
| 8 | Employment contract (fixed-term / seasonal) | عقد عمل محدد المدة / موسمي | B7 | Employer, employee | End date; renewal rules to verify |
| 9 | Agency / contractor worker agreement and daily-wage sheet | عقد مورد عمالة / كشف يومية | Contractor onboarding | Supplier, EG | Rate, hours, safety obligations |
| 10 | Work regulations acknowledgement | إقرار الاطلاع على لائحة تنظيم العمل | C1 | Employee | Disciplinary ladder per workplace regulations (Art. 139 context in §0.1) |
| 11 | Safety induction record and OHS rules acknowledgement | سجل التوعية بالسلامة | C3 | OHS officer, employee | Hazards of area, emergency exits, PPE rules |
| 12 | PPE / uniform / tool issue slip | إيصال استلام معدات وقاية / زي / عهدة | C3 | Store, employee | Item, size, qty, date, replacement date, charge-back clause |
| 13 | Confidentiality / data-protection undertaking | إقرار سرية | C1 | Employee | Where applicable (office staff) |
| 14 | Probation evaluation form | نموذج تقييم فترة الاختبار | C4 | Supervisor, HR | Scores at day 30/60/80 |
| 15 | Confirmation letter | خطاب تثبيت | C5 | HR Manager | Effective date, new terms |
| **Run: attendance, leave, pay** | | | | | |
| 16 | Leave request form | طلب إجازة | D4 | Employee, supervisor, HR | Type, dates, balance, replacement |
| 17 | Sick-leave record / medical certificate attachment | سجل إجازة مرضية | F3 | HR | No diagnosis in the visible record |
| 18 | Overtime authorisation | إذن عمل ساعات إضافية | D5 | Supervisor, Production Manager | Hours, reason, rate type |
| 19 | Missing punch / attendance correction form | نموذج تصحيح بصمة | D3 | Employee, supervisor | |
| 20 | Shift swap form | طلب تبديل وردية | D2 | Both employees, supervisor | |
| 21 | Payslip | قسيمة المرتب | D6 | System | Each component on its own line; QR; confidential |
| 22 | Loan / advance request and agreement | طلب سلفة / عقد سلفة | D7 | Employee, approvers | Amount, instalments, deduction authorisation |
| 23 | Repayment schedule and statement | جدول سداد السلفة | D7 | System | Balance, next instalment |
| 24 | Deduction notice | إخطار خصم | D7/F1 | HR, employee | Reason, amount, legal basis, cap check |
| 25 | Allowance entitlement letter (transport, meal, night, shift) | خطاب بدلات | D8 | HR | |
| **Career** | | | | | |
| 26 | Appraisal form | نموذج تقييم الأداء | E1 | Supervisor, employee, HR | |
| 27 | Training attendance sheet and certificate | شهادة حضور تدريب | E2 | Trainer, employee | Expiry date |
| 28 | Promotion / transfer / salary change letter | خطاب ترقية / نقل / تعديل أجر | E3 | HR Manager, GM | Effective date, new grade and pay |
| **Discipline and legal** | | | | | |
| 29 | Violation notice (written notification of the charge) | إخطار بمخالفة / استدعاء للتحقيق | F1 | HR, employee | Facts, date, hearing time ([sadanykhalifa](https://sadanykhalifa.com/ar/single-blog/442) on written notice and hearing) |
| 30 | Investigation minutes | محضر تحقيق | F1 | Investigator, employee, witnesses | Statements, decision recommended |
| 31 | Warning letter (written warning) | إنذار كتابي | F1 | HR Manager, employee | Reasoned decision; one penalty per violation |
| 32 | Absence-without-notice notice | إنذار غياب بدون إذن | 2.6 | HR | Sent to registered address, WhatsApp copy; text to be validated against Law 14/2025 treatment ([Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law)) |
| 33 | Grievance form and response | نموذج تظلم / رد | F1 | Employee, HR | |
| 34 | Dismissal decision | قرار فصل | F1/H1 | GM, legal | Only after legal check |
| 35 | Court case file cover sheet and hearing log | ملف قضية عمالية | F4 | HR, lawyer | |
| **Safety** | | | | | |
| 36 | Incident / near-miss report | محضر حادث / شبه حادث | F2 | Reporter, supervisor, OHS | Photos, root cause, CAPA |
| 37 | Work-injury notification for insurance/authorities | إخطار إصابة عمل | F2 | OHS, HR | Deadline and form to confirm (unverified) |
| **Separation** | | | | | |
| 38 | Resignation form and acceptance | استمارة استقالة وقبول استقالة | H1 | Employee, HR Manager | Labour-office validation, 10-day withdrawal window ([Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law)) |
| 39 | Termination letter (non-renewal / dismissal / contract end) | خطاب إنهاء خدمة | H1 | GM | Basis and notice stated |
| 40 | Notice-period handover sheet | نموذج تسليم أعمال | H1 | Employee, supervisor | |
| 41 | Exit interview form | نموذج مقابلة نهاية الخدمة | H2 | HR officer, employee | Reason codes |
| 42 | Clearance form (departmental) | إخلاء طرف | H3 | Store, IT, Finance, OHS, Security, Supervisor | PPE, tools, keys, badge, loans, vehicle |
| 43 | Final settlement statement | مخالصة نهائية / كشف تسوية | H4 | Payroll, HR, Finance, employee | Pay to date, leave encashment, notice pay/compensation if any, deductions (loans, custody), net; employee signature as release (wording from counsel) |
| 44 | Social-insurance exit form | استمارة إنهاء خدمة (تأمينات) | H5 | HR | Form numbering ("Form 6" referenced in press; "Form 2" for wage updates per [BDO](https://www.bdo.global/en-gb/insights/tax/expatriate-tax/egypt-maximum-and-minimum-salaries-subject-to-social-insurance-increased)): confirm current numbering with NOSI |
| 45 | Experience certificate | شهادة خبرة | H5 | HR Manager | Dates, position; neutral wording |
| **On-demand certificates** | | | | | |
| 46 | Salary certificate (bank/embassy) | شهادة مرتب / تعريف بالراتب | Employee request | HR Manager | Variants: to whom it may concern, bank, embassy (AR + EN), with/without salary, with QR; log purpose |
| 47 | Employment verification letter | شهادة قيد / تعريف بوظيفة | Request | HR | |
| 48 | Leave/residence letters (visa, travel) | خطاب إجازة للسفر | Request | HR | |
| 49 | Letter for new government forms (e.g. labour office, tax) | خطابات جهات حكومية | Request | HR | |
| **Reports** | | | | | |
| 50 | Monthly HR pack for GM | تقرير الموارد البشرية الشهري | Month-end | System | KPIs from §3 with commentary |

---

## 9. Open items and verification list (before implementation)

1. Obtain the Arabic text of Law 14/2025 and its executive regulations. Confirm: overtime premiums and caps (conflicting sources: 35%/70% vs 135% night), night-work definition, casual-leave days (6 vs 7), unjustified-absence rule and notice steps, deduction ceilings for loans, final-settlement payment deadline, resignation validation procedure, article numbers for discipline.
2. Confirm OHS obligations: safety officer/committee thresholds, medical examinations, injury-reporting deadlines, forms ([Rivermate](https://rivermate.com/guides/egypt/health-and-safety) confirms only the framework). Check the claim of a "Law 14 of 2026" amendment ([globallawexperts](https://globallawexperts.com/egypt-labour-law-2026/); single commercial source).
3. Confirm social-insurance forms and numbering with NOSI; confirm 2026 insurable wage floor and cap ([PwC](https://taxsummaries.pwc.com/Egypt/Individual/Other-taxes) for the cap; floor from one source).
4. Income-tax calculation, martyrs tax and stamp duty on payroll: **not researched**.
5. Test WhatsApp Business template approval for Arabic HR templates (Utility category) and Egyptian pricing with the chosen BSP.
6. Validate vendor UI patterns (§6.1) with trial accounts: Rippling, HiBob, Personio, Gusto, Deel, Zoho People. Only BambooHR time-off features and ZenHR/Connecteam attendance features were verified here.
7. Device compatibility: confirm which attendance hardware the plant owns (ZKTeco or other) before choosing the ingest method.
8. Decide numeral convention (Western vs Arabic-Indic) with real workers in a 5-person usability test.

## 10. Source list

- Egypt law: [Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law) · [Deloitte](https://www.deloitte.com/middle-east/en/services/tax/perspectives/egypt-new-labor-law-entering-into-effect.html) · [ZenHR labour-law summary](https://www.zenhr.com/en/egypt-labor-law) · [Mondaq translation](https://www.mondaq.com/employee-rights-labour-relations/1673824/translation-of-labor-law-no-14-of-2025) · [sadanykhalifa (discipline)](https://sadanykhalifa.com/ar/single-blog/442) · [almalnews](https://almalnews.com/2132230/5-أيام-حد-أقصى-للخصم-تعرف-على/) · [Rivermate OHS](https://rivermate.com/guides/egypt/health-and-safety) · [globallawexperts](https://globallawexperts.com/egypt-labour-law-2026/)
- Social insurance: [PwC](https://taxsummaries.pwc.com/Egypt/Individual/Other-taxes) · [Nativeteams](https://help.nativeteams.com/egypt-payroll-changes-2026) · [BDO](https://www.bdo.global/en-gb/insights/tax/expatriate-tax/egypt-maximum-and-minimum-salaries-subject-to-social-insurance-increased)
- Lifecycle and HR metrics: [HR University](https://hr.university/shrm/talent-management/employee-life-cycle/) · [Bakkah](https://bakkah.com/knowledge-center/employee-life-cycle-in-cipd) · [Darwinbox](https://darwinbox.com/blog/employee-lifecycle-hr-leaders) · [SHRM monthly metrics form](https://shrm.org/topics-tools/tools/forms/hr-department-monthly-metrics-report) · [Rippling metrics](https://www.rippling.com/blog/best-metrics-to-track-for-hr) · [MiHCM](https://mihcm.com/resources/blog/the-ultimate-guide-to-people-analytics-metrics/) · [Glassdoor](https://www.glassdoor.com/blog/recruiting-metrics/) · [IRIS Bradford Factor](https://help-iris.co.uk/hr/hrpro/teammngmnt/bradford-factor.htm) · [LeaveBalance absence rate](https://www.leavebalance.com/blog/absence-rate-formula/)
- Safety rates: [hseblog TRIR](https://www.hseblog.com/trir/) · [NSC TRIR](https://injuryfacts.nsc.org/definitions/trir-total-recordable-incident-rate/) · [ehsinsight LTIFR](https://ehsinsight.com/blog/what-is-lost-time-injury-how-do-you-calculate-it-and-why-should-you-track-it)
- Tools and UX: [Connecteam kiosk](https://connecteam.com/employee-time-clock-app/time-clock-kiosk-app/) · [Connecteam kiosk roundup](https://connecteam.com/best-time-clock-kiosk-apps/) · [BrainSensei review](https://brainsensei.com/connecteam-time-clock-app-review/) · [ZenHR Egypt](https://www.zenhr.com/hr-payroll-software/egypt) · [ZenHR attendance](https://blog.zenhr.com/en/what-features-does-zenhr-offer-for-payroll-attendance) · [BambooHR Time Off](https://www.bamboohr.com/platform/time-and-attendance/time-off) · [AdminLTE HR dashboards](https://adminlte.io/blog/hr-dashboard-design-examples/) · [Vector Solutions training matrix](https://www.vectorsolutions.com/resources/blogs/manufacturing-training-matrix/) · [CompMatrx (GetApp)](https://www.getapp.com/all-software/a/compmatrx/) · [Odoo training matrix add-on](https://apps.odoo.com/apps/modules/18.0/mandatory_training_matrix_compliance)
- RTL / WhatsApp: [Workday RTL](https://design.workday.com/globalization/rtl-and-bidi) · [Saudisoft RTL checklist](https://localization.saudisoft.com/?p=38918) · [Microsoft bidi note](https://learn.microsoft.com/en-us/archive/blogs/ericgu/weird-bug-i-had-yesterday) · [WebKit bug](https://bugs.webkit.org/show_bug.cgi?id=168290) · [Recruitera WhatsApp templates](https://recruitera.ai/blog/whatsapp-templates-utility-marketing-guide) · [ChatArchitect](https://chatarchitect.com/news/automating-hr-workflows-with-whatsapp-api-and-custom-platforms)
