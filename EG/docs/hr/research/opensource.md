# Open-Source HR/HRMS Research for EG-System (hire-to-retire)

Researched 2026-11-04. Target: "EG - المصرية الألمانية" factory (WPC/PVC, Gamasa, Dakahlia; 100-300 staff, mostly blue-collar shift workers, Arabic RTL first).

## 0. How to read this file

- Every sourced claim has a URL. "(unverified)" = could not be confirmed on an official page/repo. "not verified" = a number/version I could not obtain.
- **Primary evidence preferred**: I read the actual source trees (Frappe HRMS doctype JSON, Odoo 19.0 addon manifests/models, OrangeHRM plugin entities, Horilla settings/models, Sentrifugo controllers), because marketing pages mostly do not state the Community vs Paid split. Where I infer "Community vs Enterprise" from "the module is absent in the public repo", I say so.
- **Star counts and "latest release"** come from the GitHub REST API queried on **2026-11-04** (stars change daily; treat as approx). Examples: https://api.github.com/repos/frappe/hrms , https://api.github.com/repos/odoo/odoo , https://api.github.com/repos/orangehrm/orangehrm . My API quota ran out mid-session, so for a few repos I used the GitHub web page instead (flagged).
- Not legal advice. The licensing notes in section 1 are engineering guidance.

---

## 1. Licensing: what it implies if we only borrow ideas/UX, not code

| Project | License (verified) | If we only borrow ideas, entity/field concepts, workflows, UX | If we copy/adapt code, schemas files, translations, CSS/UI assets |
|---|---|---|---|
| Frappe HR (hrms) | GPL-3.0 ([license.txt](https://raw.githubusercontent.com/frappe/hrms/develop/license.txt)) | Free. Ideas/data-model concepts are not copyrighted. | Strong copyleft: any derivative we distribute (incl. the Flutter app if it embeds code) must be GPL-3.0. Using it as a separate self-hosted service is fine. |
| Odoo Community | LGPL-3.0 ([LICENSE](https://raw.githubusercontent.com/odoo/odoo/19.0/LICENSE)); GitHub API shows "NOASSERTION" ([API](https://api.github.com/repos/odoo/odoo)) because the file bundles COPYRIGHT text. Odoo Enterprise is proprietary (not in the public repo). | Free. Do NOT read/copy Enterprise code (payroll, appraisal) - closed. | LGPL: modifications to the library files must stay LGPL; linking is looser than GPL. Enterprise modules cannot be reused. |
| OrangeHRM Starter | GPL-3.0 since v5.6 ([CHANGELOG](https://raw.githubusercontent.com/orangehrm/orangehrm/main/CHANGELOG.TXT), "License Upgrade to GPLv3") | Free. | GPL-3.0 copyleft. Paid editions (Advanced) are proprietary. |
| Horilla | LGPL-2.1 per LICENSE file ([LICENSE](https://raw.githubusercontent.com/horilla-opensource/horilla/master/LICENSE)); README badge says "LGPL" ([README](https://raw.githubusercontent.com/horilla-opensource/horilla/master/README.md)); vendor site page shows both "MIT" and "LGPL-2.1" inconsistently ([horilla.com/features](https://www.horilla.com/features/)) | Free. | Treat as LGPL-2.1 (weak copyleft). Licensing inconsistency - confirm before any reuse. |
| IceHrm | **Elastic License 2.0 (ELv2)** ([LICENSE](https://raw.githubusercontent.com/gamonoid/icehrm/master/LICENSE)). GitHub API: "NOASSERTION" ([API](https://api.github.com/repos/gamonoid/icehrm)). **Not OSI open source** (source-available). | Free. | ELv2 forbids offering it as a hosted/managed service and circumventing license-key features; internal use allowed. Avoid copying. |
| Sentrifugo | GPL-3.0 ([API](https://api.github.com/repos/sapplica/sentrifugo)) | Free. | GPL-3.0; codebase is dead (see 2.7). |
| Jorani | MIT ([github.com/jorani/jorani](https://github.com/jorani/jorani); API shows MIT: [API](https://api.github.com/repos/bbalet/jorani)) | Free. | MIT: code reuse allowed with notice. Best-licensed reference for leave logic. |
| TimeTrex Community | AGPL (SourceForge: [sourceforge.net/projects/timetrex](https://sourceforge.net/projects/timetrex/); fork README: [FairnessTNA](https://github.com/aydancoskun/FairnessTNA)); older 9.0 listing said MPL ([Softpedia](https://linux.softpedia.com/get/Office/Scheduling/TimeTrex-16448.shtml)) | Free. | AGPL network copyleft - avoid copying into a SaaS-style ERP. |
| OpenCATS | MPL-2.0 for new code + CATS Public License 1.1a for 2007 code ([LICENSE.md](https://raw.githubusercontent.com/opencats/OpenCATS/master/LICENSE.md)) | Free. | MPL file-level copyleft. |
| Ever Gauzy | AGPL-3.0 (+ commercial licenses) ([github.com/ever-co/ever-gauzy](https://github.com/ever-co/ever-gauzy)) | Free. | AGPL. |
| Urlaubsverwaltung | Apache-2.0 ([repo](https://github.com/urlaubsverwaltung/urlaubsverwaltung)) | Free. | Permissive; good reference for 2-stage approval. |
| Payroll Engine | MIT ([repo](https://github.com/Payroll-Engine/PayrollEngine)) | Free. | Permissive; interesting for rule-layered payroll. |
| OCA/payroll, OCA/hr (Odoo community add-ons) | AGPL-3.0 ([API OCA/payroll](https://api.github.com/repos/OCA/payroll), [API OCA/hr](https://api.github.com/repos/OCA/hr)) | Free. | AGPL. |

**Bottom line**: borrowing *concepts, field lists, state machines and UX layouts* is safe for all of the above. Do not paste code/templates/translation files from GPL/AGPL/ELv2 projects into EG-System. MIT/Apache projects (Jorani, Urlaubsverwaltung, Payroll Engine) are the only ones where code reuse is license-compatible with a closed in-house product.

---

## 2. Project-by-project profiles

### 2.1 Frappe HR (HRMS for ERPNext) - the most complete open-source HR+Payroll

| Item | Value |
|---|---|
| License | GPL-3.0 ([license.txt](https://raw.githubusercontent.com/frappe/hrms/develop/license.txt)) |
| Stack | Python (>=3.10) on Frappe Framework + MariaDB; desktop UI by Frappe, mobile/PWA front-end in Vue with frappe-ui ([README](https://raw.githubusercontent.com/frappe/hrms/develop/README.md), [pyproject](https://raw.githubusercontent.com/frappe/hrms/develop/pyproject.toml)). Requires ERPNext (`required_apps = ["frappe/erpnext"]`, [hooks.py](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hooks.py)). |
| Stars | ~9,017 (2026-11-04) ([API](https://api.github.com/repos/frappe/hrms)); ERPNext ~40,905 ([API](https://api.github.com/repos/frappe/erpnext)) |
| Latest release | v16.53.1 and v15.64.8 both published 2026-11-04; v14.38.2 on 2026-09-18 ([releases](https://github.com/frappe/hrms/releases)) |
| Activity | Very high (pushes hours old on 2026-11-04; ~478 open issues) ([API](https://api.github.com/repos/frappe/hrms)) |
| Edition split | Single open-source product; Frappe Cloud is paid hosting ([README](https://raw.githubusercontent.com/frappe/hrms/develop/README.md)). No feature paywall. |

**Modules by lifecycle** (from the doctype tree: [hr/doctype](https://github.com/frappe/hrms/tree/develop/hrms/hr/doctype), [payroll/doctype](https://github.com/frappe/hrms/tree/develop/hrms/payroll/doctype)):

- **Recruitment/ATS**: Staffing Plan (+detail), Job Requisition, Job Opening (+template), Job Applicant (+source), Interview Type / Interview / Interview Feedback / Interviewer / Skill Assessment, Job Offer (+terms, components), Appointment Letter (+template), Employee Referral.
- **Onboarding**: Employee Onboarding (+template, activities), Appointment Letter, Employee Grade, Holiday List Assignment.
- **Core HR**: Employee (in ERPNext), Employee Grade, Employment Type, Employee Promotion, Employee Transfer, Employee Property History, Employee Skill Map, Identification Document Type, Org chart page ([hr/page](https://github.com/frappe/hrms/tree/develop/hrms/hr/page)), Department Approver.
- **Time & attendance / shifts**: Employee Checkin (device_id, geolocation), Attendance, Attendance Request, Shift Type, Shift Assignment, Shift Request, Shift Schedule (+assignment), Shift Location, Shift Assignment Tool, Employee Attendance Tool, Overtime Type / Overtime Slip / Overtime Details. A separate `roster` app folder exists ([repo root](https://github.com/frappe/hrms)).
- **Leave**: Leave Type, Leave Policy (+assignment), Leave Period, Leave Allocation, Leave Application, Leave Ledger Entry, Leave Encashment, Leave Block List, Compensatory Leave Request, Earned Leave Schedule, Leave Adjustment.
- **Payroll & benefits**: Salary Component, Salary Structure, Salary Structure Assignment (+bulk), Payroll Entry, Salary Slip, Additional Salary, Arrear, Payroll Correction, Salary Withholding (+cycle), Payroll Period, Income Tax Slab, Tax Exemption declarations/proofs, Employee Benefit Application/Claim/Ledger, Employee Incentive, Retention Bonus, Gratuity (+rule, slabs), Salary Slip Loan, Payroll Settings.
- **Performance**: KRA, Goal (tree), Appraisal Template, Appraisal Cycle, Appraisal, Employee Performance Feedback, Employee Feedback Criteria/Rating.
- **Training**: Training Program, Training Event (+employees), Training Feedback, Training Result.
- **Disciplinary/grievance**: Employee Grievance + Grievance Type. No formal warning/disciplinary-action doctype found in the list (not verified elsewhere).
- **Assets**: Full & Final Asset (asset recovery at exit); main Asset module lives in ERPNext (not verified here). Vehicle Log / Vehicle Service.
- **Expenses/loans/advances**: Expense Claim (+type, taxes, advances), Employee Advance, Travel Request. Loans: HRMS only has `salary_slip_loan`; loans themselves are the separate Frappe Lending app (GPL-3.0, ~366 stars) which does not mention employee/salary loans on its page ([frappe/lending](https://github.com/frappe/lending)).
- **Offboarding**: Employee Separation (+template), Exit Interview, Full and Final Statement (+outstanding, assets), Gratuity, Leave Encashment.
- **Reports**: Monthly Attendance Sheet, Shift Attendance, Employee Leave Balance (+summary), Leave Ledger, Employee Analytics, Employee Exits, Recruitment Analytics, Appraisal Overview, Salary Register, Bank Remittance, Income Tax Computation, Employee CTC Break-up, etc. ([hr/report](https://github.com/frappe/hrms/tree/develop/hrms/hr/report), [payroll/report](https://github.com/frappe/hrms/tree/develop/hrms/payroll/report)).
- **Self-service/mobile**: Frappe HR PWA: apply/approve leave, check-in/out, profile ([README](https://raw.githubusercontent.com/frappe/hrms/develop/README.md)); HR Settings has `allow_employee_checkin_from_mobile_app`, `allow_geolocation_tracking` ([hr_settings.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/hr_settings/hr_settings.json)).

**Notable features / UX worth borrowing**

- Salary Structure = ordered Earnings/Deductions/Employer-Contribution rows, each a Salary Component with formula/condition, `depends_on_payment_days`, taxable flag, `statistical_component`, `do_not_include_in_total`; assignment is effective-dated per employee with `base`/`variable`/CTC ([salary_component.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/payroll/doctype/salary_component/salary_component.json), [salary_structure_assignment.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/payroll/doctype/salary_structure_assignment/salary_structure_assignment.json)).
- Payroll run: Payroll Entry -> Get Employees (filter branch/department/designation) -> optional attendance validation -> Create Salary Slips -> Submit -> accrual journal -> bank entry; entry status Draft/Submitted/Cancelled/Queued/Failed, slip status Draft/Submitted/Cancelled/Withheld ([docs](https://docs.frappe.io/hr/payroll-entry), [payroll_entry.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/payroll/doctype/payroll_entry/payroll_entry.json), [salary_slip.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/payroll/doctype/salary_slip/salary_slip.json)). Includes Salary Withholding, Payroll Correction (reverse LWP), Arrears.
- Shift model: Shift Type (start/end, grace periods for late entry/early exit, half-day/absent hour thresholds, auto-attendance, check-in window, overtime) + Shift Assignment (employee, dates) + Shift Request (approval creates assignment) + Shift Schedule (repeating pattern auto-generating assignments hourly) + monthly Roster calendar with drag-to-swap and "WO" weekly-off blocks ([docs](https://docs.frappe.io/hr/shift-management), [shift_type.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/shift_type/shift_type.json)).
- Attendance: raw Employee Checkin log (with device_id, lat/long, off-shift flag) -> auto Attendance (Present/Absent/On Leave/Half Day/Work From Home, late_entry, early_exit, overtime) ([employee_checkin.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/employee_checkin/employee_checkin.json), [attendance.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/attendance/attendance.json)).
- Leave: policy-based allocation (Leave Policy -> Assignment -> Allocation), append-only Leave Ledger Entry (the balance is a sum of ledger rows), earned-leave schedules, carry-forward + expiry, encashment, block lists, compensatory leave for work on holidays ([leave_type.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/leave_type/leave_type.json), [leave_ledger_entry.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/leave_ledger_entry/leave_ledger_entry.json)).
- Overtime as first-class: Overtime Type with weekend/public-holiday multipliers -> Overtime Slip per period -> picked up by Payroll Entry (`overtime_step`) ([overtime_type.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/overtime_type/overtime_type.json), [overtime_slip.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/overtime_slip/overtime_slip.json)).
- Exit: Employee Separation checklist -> Exit Interview -> Full & Final Statement with payables, receivables and asset recovery ([full_and_final_statement.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/full_and_final_statement/full_and_final_statement.json)).
- HR Settings page holds policy toggles (prevent self-approval, mandatory approver, backdated-leave restriction, retirement age, holiday/birthday/anniversary reminders) ([hr_settings.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/hr_settings/hr_settings.json)).

**Arabic/RTL, localization, biometric**

- Arabic translation file exists in HRMS (`locale/ar.po`, ~2,250 msgids) ([ar.po](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/locale/ar.po)); Frappe framework ships RTL asset bundles (`assets-rtl.json` referenced in [frappe/utils/__init__.py](https://raw.githubusercontent.com/frappe/frappe/develop/frappe/utils/__init__.py)). Real RTL quality of the HR screens/PWA: not verified.
- Country payroll regionals shipped in repo: **India and UAE only** ([hrms/regional](https://github.com/frappe/hrms/tree/develop/hrms/regional)). **No Egypt** in the open-source repo. A paid third-party "Egypt Payroll & Social Insurance" ERPNext app exists (vendor marketing claim, v15/v16) ([ecosire.com](https://ecosire.com/apps/erpnext/erpnext-egypt-payroll)) - unverified quality.
- Biometric: no native device driver; Employee Checkin has `device_id`, and Frappe publishes a polling tool that syncs biometric-device logs into ERPNext ([frappe/biometric-attendance-sync-tool](https://github.com/frappe/biometric-attendance-sync-tool)); device brands supported: not verified.

**Weaknesses/gaps**: needs full ERPNext (heavy, accounting coupling; Payroll posts journal entries); no formal disciplinary warnings; no Egypt payroll (insurance, tax, minimum wage) out of the box; steep Frappe learning curve; UX is generic desk-style; loans in a separate app; GPL.

---

### 2.2 Odoo HR - Community vs Enterprise (be explicit)

| Item | Value |
|---|---|
| License | Community: LGPL-3.0; Enterprise: proprietary ([LICENSE](https://raw.githubusercontent.com/odoo/odoo/19.0/LICENSE)) |
| Stack | Python + PostgreSQL + Owl (JS) ([manifests](https://github.com/odoo/odoo/tree/19.0/addons/hr)) |
| Stars | ~55,531 for the whole Odoo repo (2026-11-04) ([API](https://api.github.com/repos/odoo/odoo)) |
| Version | Public branches 18.0, 19.0, 20.0 and `master` (= 20.1 alpha) ([branches](https://github.com/odoo/odoo/branches), [release.py](https://raw.githubusercontent.com/odoo/odoo/master/odoo/release.py)). Secondary sources say Odoo 20 was announced ~24 Sept 2026 ([cybrosys](https://www.cybrosys.com/odoo/odoo-20-features/)) - release date not verified on odoo.com. My model-level analysis below is from **19.0** (verified) and the **20.0** addon list. |
| Activity | Very high (pushed hours ago) ([API](https://api.github.com/repos/odoo/odoo)) |

**Community HR modules (verified by presence in the public repo, 19.0)** ([addons dir](https://github.com/odoo/odoo/tree/19.0/addons)): `hr` (employees, departments, jobs, work locations, contract templates, departure reasons, onboarding/offboarding activity plans), `hr_attendance` (+ kiosk, barcode/badge, geolocation, **overtime rulesets**), `hr_holidays` (Time Off: types, **accrual plans**, allocations, mandatory days, 1-2 step validation), `hr_work_entry` (+ `_holidays`), `hr_expense`, `hr_recruitment` (+ `_skills`, `_survey`, `_sms`, `website_hr_recruitment`, talent pools, job platforms), `hr_skills` (+ slides/survey/event), `hr_timesheet` (+ `_attendance`), `hr_presence`, `hr_calendar`, `hr_homeworking` (19.0), `hr_maintenance` (equipment assigned to employees), `hr_fleet`, `hr_gamification`, `hr_livechat`, `hr_hourly_cost`, `l10n_eg` and `l10n_eg_edi_eta` (accounting + e-invoice only).
In **19.0 `hr_contract` no longer exists**: contracts were merged into `hr` as dated **`hr.version`** records (wage, contract dates, trial end, job, department, work schedule, departure data) ([hr_version.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr/models/hr_version.py), absent from [19.0 addons](https://github.com/odoo/odoo/tree/19.0/addons); present in [18.0](https://github.com/odoo/odoo/tree/18.0/addons)). The 20.0 branch keeps `hr`, `hr_attendance`, `hr_holidays`, `hr_expense`, `hr_recruitment`, `hr_skills`, `hr_timesheet`, `hr_work_entry`, `hr_presence`, `hr_maintenance`, `hr_fleet` ([20.0 addons](https://github.com/odoo/odoo/tree/20.0/addons)).

**Enterprise-only (inferred: NOT in the public repo for 18/19/20)**: **Payroll** (`hr_payroll`, all country payrolls incl. `l10n_eg_hr_payroll`), **Appraisals** (`hr_appraisal`), **Referrals** (`hr_referral`), **Planning/roster** (`planning`), payroll-expense bridge. I checked for names starting with `hr`, `payroll`, `planning`, `recruit`, `l10n_eg` in the 18.0/19.0/20.0 addon lists ([19.0](https://github.com/odoo/odoo/tree/19.0/addons)). Secondary sources agree payroll and appraisals are Enterprise ([cybrosys blog](https://www.cybrosys.com/blog/what-are-the-differences-between-odoo-18-community-and-enterprise-in-terms-of-hr) - vendor blog, partly inaccurate: it wrongly implies Community time-off is basic; the source shows accrual plans in Community). The Odoo edition comparison page did not render per-app tick marks, so there is no official per-app edition table I could verify ([odoo.com/page/editions](https://www.odoo.com/page/editions)). Frontdesk, Lunch, Approvals, Sign, Documents are listed in docs as separate apps ([HR docs index](https://www.odoo.com/documentation/19.0/applications/hr.html)); edition not verified.

**Egypt payroll (Enterprise)**: modules `l10n_eg_hr_payroll` and `_account`; employer social insurance 18.75% and employee 11% of a per-contract "Social Insurance Reference Amount" (paid to NOSI); annual leave 21 days; sick leave 30 days 100%, next 60 days 75%, then unpaid; progressive income tax 0-27.5% with EGP 20,000 personal exemption; overtime 1.35x day / 1.70x night / 2.0x rest days & holidays; monthly end-of-service and leave provisions; unused-leave compensation on end-of-service payslip ([Odoo 18 Egypt payroll docs](https://www.odoo.com/documentation/18.0/applications/hr/payroll/payroll_localizations/egypt.html)). The docs page does not state "Enterprise-only", but the module is absent from the public repo. Check numbers against current NOSI/tax law before copying (these are Odoo's 18.0 figures).

**Modules by lifecycle (Community unless noted)**

- Recruitment/ATS: Job position (expected/target employees, `no_of_recruitment`), Applicant with stages (`hired_stage`, `rotting_threshold_days`, kanban_state blocked/done/normal), refuse reasons, degrees, sources (UTM), interviewers (`interviewer_ids`), meetings via calendar, talent pool, categories/tags, salary expected/proposed, priority stars ([hr_applicant.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_recruitment/models/hr_applicant.py), [hr_recruitment_stage.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_recruitment/models/hr_recruitment_stage.py)). Offer/salary-package builder and AI CV screening: Enterprise (not in public repo; unverified detail).
- Onboarding/offboarding: Activity Plans (steps with assignee = manager/coach/employee/default user, offset before/after plan date) launched from the employee ([docs](https://www.odoo.com/documentation/19.0/applications/hr/employees/onboarding.html), [mail_activity_plan.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr/models/mail_activity_plan.py)); departure wizard with departure reason (`hr.departure.reason`) ([hr_departure_reason.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr/models/hr_departure_reason.py)).
- Core HR: Employee (private/work data, emergency contact, bank accounts, visa/permit, barcode/PIN, `parent_id` manager, `coach_id`, tags), Department tree with manager and master department, Job, Work Location, Resource Calendar (work schedule, flexible), org chart ([hr_employee.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr/models/hr_employee.py), [hr_department.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr/models/hr_department.py)). Employee form tabs: Work, Resume, Certifications, Personal, Payroll (EE), Settings ([docs](https://www.odoo.com/documentation/19.0/applications/hr/employees/new_employee.html)).
- Time & attendance: check-in/out with IP, browser, GPS, mode (kiosk/manual/...), `expected_hours`, `overtime_hours`, `overtime_status` to_approve/approved/refused, `validated_overtime_hours`; Overtime Ruleset -> Rules (base_off, timing, tolerance employee/employer, `paid`, `amount_rate`) ([hr_attendance.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_attendance/models/hr_attendance.py), [hr_attendance_overtime_rule.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_attendance/models/hr_attendance_overtime_rule.py)). Biometric devices: kiosk with badge/barcode in Community ([manifest](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_attendance/__manifest__.py)); native fingerprint-device drivers not verified (third-party add-ons exist - unverified).
- Leave: Time Off Type (validation none/HR/manager/both, requires_allocation, unit day/half/hour, unpaid, public-holiday handling, support document, negative balance), Allocation (+accrual plan with levels, carryover, caps), Request with first/second approver, mandatory days; Gantt "All Time Off" team overview ([hr_leave_type.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_holidays/models/hr_leave_type.py), [hr_leave_accrual_plan_level.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_holidays/models/hr_leave_accrual_plan_level.py), [docs](https://www.odoo.com/documentation/19.0/applications/hr/time_off.html)).
- Work entries (payroll input): per-day entries by type (is_leave, is_work, is_extra_hours, amount_rate), states draft/conflict/validated("In Payslip")/cancelled ([hr_work_entry.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_work_entry/models/hr_work_entry.py)).
- Payroll (EE): contracts, salary structures/rules, payslips, pay runs, localizations ([HR docs index](https://www.odoo.com/documentation/19.0/applications/hr.html)). Not inspectable (closed).
- Performance: Appraisals (EE) incl. 360 and goals per docs index; Community has only `hr_gamification` badges ([addons](https://github.com/odoo/odoo/tree/19.0/addons)).
- Training: Skills inventory, resume lines, certifications, eLearning link (`hr_skills_slides`) ([hr_skills models](https://github.com/odoo/odoo/tree/19.0/addons/hr_skills/models)).
- Disciplinary/grievance: none found.
- Assets: `hr_maintenance` equipment assigned to employee/department; `hr_fleet` vehicles ([models](https://github.com/odoo/odoo/tree/19.0/addons/hr_maintenance/models)).
- Expenses/loans/advances: Expense (state/approval_state, attachments, multi-currency, duplicate detection, pay by employee/company) ([hr_expense.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_expense/models/hr_expense.py)); loans/advances: no Community model (salary attachments in Payroll EE - unverified).
- Reports: attendance, time-off summaries (by employee/type/balance) ([docs](https://www.odoo.com/documentation/19.0/applications/hr/time_off.html)).

**Arabic/RTL**: Arabic translations ship in addons (e.g. [account ar.po](https://github.com/odoo/odoo/blob/19.0/addons/account/i18n/ar.po)); Odoo is widely used with Arabic RTL, but I did not verify an RTL statement on an official page. **Biometric**: see above.

**Weaknesses/gaps**: payroll, appraisals, roster, referrals are paid; Egypt payroll is closed; the ERP footprint is large; module churn between versions (hr_contract removed in 19) means upgrade effort; customization by studio/Python skill.

OCA community add-ons (AGPL) partly fill Community gaps: OCA/payroll ~124 stars ([API](https://api.github.com/repos/OCA/payroll)) and OCA/hr ~285 stars ([API](https://api.github.com/repos/OCA/hr)); coverage per version and Egypt rules: not verified. No OCA Egypt payroll found ([search](https://www.odoo.com/documentation/18.0/applications/hr/payroll/payroll_localizations/egypt.html)).

---

### 2.3 OrangeHRM (open-source "Starter" edition)

| Item | Value |
|---|---|
| License | GPL-3.0 (since 5.6) ([CHANGELOG](https://raw.githubusercontent.com/orangehrm/orangehrm/main/CHANGELOG.TXT)) |
| Stack | PHP 7.4-8.5, Symfony 5.4 components + Doctrine ORM, Vue 3 front-end with OXD UI kit, MySQL/MariaDB ([composer.json](https://raw.githubusercontent.com/orangehrm/orangehrm/main/src/composer.json), [package.json](https://raw.githubusercontent.com/orangehrm/orangehrm/main/src/client/package.json)) |
| Stars | ~1,160 (2026-11-04) ([API](https://api.github.com/repos/orangehrm/orangehrm)) |
| Latest release | v5.9 (2026-06-28): Slack/Google Chat workspace notifications ([API](https://api.github.com/repos/orangehrm/orangehrm/releases/latest), [CHANGELOG](https://raw.githubusercontent.com/orangehrm/orangehrm/main/CHANGELOG.TXT)) |
| Activity | Moderate; one release per few months |
| Editions | "Starter" = open source; "Advanced" = paid; the website lists modules without marking the split ([orangehrm.com/open-source](https://www.orangehrm.com/en/open-source/)) |

**Plugins actually in the open-source repo** ([src/plugins](https://github.com/orangehrm/orangehrm/tree/main/src/plugins)): Admin, **PIM**, **Leave**, **Time** (project timesheets), **Attendance**, **Recruitment**, **Performance**, **Claim** (5.5), **Buzz** (5.3 social feed), Corporate Directory, Corporate Branding, Dashboard, Maintenance (GDPR purge), Mobile (5.4), LDAP/OpenID/OAuth2, Workspace Notifications. Changelog dates: Recruitment/Performance/Directory in 5.1, Buzz 5.3, mobile app + OAuth2 + password policy 5.4, Claim 5.5 ([CHANGELOG](https://raw.githubusercontent.com/orangehrm/orangehrm/main/CHANGELOG.TXT)).

- Core HR entities (PIM): Employee, Emergency Contact, Dependent, Immigration Record, Work Experience, Education, Skill, Language, License, Membership, Salary (record only), Contract, Report-To (+reporting method), Termination Record (+reason), Custom Fields, Attachments, Work Shift ([PIM entities](https://github.com/orangehrm/orangehrm/tree/main/src/plugins/orangehrmPimPlugin/entity)). Admin: Job Title, Pay Grade, Employment Status, Job Category, Subunit (org tree), Location, Nationality, Work Shift ([Admin entities](https://github.com/orangehrm/orangehrm/tree/main/src/plugins/orangehrmAdminPlugin/entity)).
- Leave: Leave Type, Entitlement, Request, Holiday, Work Week, leave period ([Leave entities](https://github.com/orangehrm/orangehrm/tree/main/src/plugins/orangehrmLeavePlugin/entity)).
- Recruitment: Vacancy, Candidate (+history), Interview (+interviewers), attachments ([Recruitment entities](https://github.com/orangehrm/orangehrm/tree/main/src/plugins/orangehrmRecruitmentPlugin/entity)).
- Performance: KPI, Performance Review, Tracker (+reviewer logs), Reviewer groups/ratings ([Performance entities](https://github.com/orangehrm/orangehrm/tree/main/src/plugins/orangehrmPerformancePlugin/entity)).
- Claim: Claim Request, Expense Type, Expense, Event ([Claim entities](https://github.com/orangehrm/orangehrm/tree/main/src/plugins/orangehrmClaimPlugin/entity)).
- **No payroll engine, no onboarding checklist, no assets, no training, no disciplinary** in the repo plugin list. The marketing site lists Onboarding, Training, Discipline, Roster, Request Desk, etc. without marking which edition ([orangehrm.com/open-source](https://www.orangehrm.com/en/open-source/)) -> treat those as paid.
- Self-service/mobile: My Info, Dashboard, mobile app for Starter 5.4+ ([CHANGELOG](https://raw.githubusercontent.com/orangehrm/orangehrm/main/CHANGELOG.TXT)).

**Arabic/RTL/localization/biometric**: language packages importable via XLIFF (5.7) ([CHANGELOG](https://raw.githubusercontent.com/orangehrm/orangehrm/main/CHANGELOG.TXT)); Arabic pack and RTL: not verified. No payroll localization; no biometric integration found.

**Weaknesses**: no payroll in open source; shallow recruitment; heavier features paywalled; GPL; no Egypt.

---

### 2.4 Horilla (newer, modern; Django)

| Item | Value |
|---|---|
| License | LGPL-2.1 (LICENSE file); inconsistent statements elsewhere ([LICENSE](https://raw.githubusercontent.com/horilla-opensource/horilla/master/LICENSE), [horilla.com/features](https://www.horilla.com/features/)) |
| Stack | Python/Django 4.2 (server-rendered templates), PostgreSQL recommended, django-apscheduler ([README](https://raw.githubusercontent.com/horilla-opensource/horilla/master/README.md), [requirements.txt](https://raw.githubusercontent.com/horilla-opensource/horilla/master/requirements.txt)) |
| Stars | ~1,489 (2026-11-04) ([API](https://api.github.com/repos/horilla-opensource/horilla)) - repo redirects to `horilla/horilla-hr`. |
| Latest release | 2.3.0 on 2026-11-03 ([API](https://api.github.com/repos/horilla-opensource/horilla/releases/latest)) |
| Activity | High (pushed 2026-11-03) |
| Editions | Vendor says "every feature, every plan", self-host free or managed $7/user/month ([horilla.com/features](https://www.horilla.com/features/)) |

**Modules in the repo** (`INSTALLED_APPS`/sidebar: recruitment, onboarding, employee, attendance, leave, payroll, pms, offboarding, asset, helpdesk, project; plus biometric, backup, automations, audit) ([settings.py](https://raw.githubusercontent.com/horilla-opensource/horilla/master/horilla/settings.py), [horilla_apps.py](https://raw.githubusercontent.com/horilla-opensource/horilla/master/horilla/horilla_apps.py)). Models of interest:
- Recruitment: Recruitment, Stage, Candidate, Rejected reasons, Survey/questions, Skill Zone (talent pool), Interview Schedule, Candidate document request, LinkedIn account ([models](https://raw.githubusercontent.com/horilla-opensource/horilla/master/recruitment/models.py)).
- Onboarding: Onboarding Stage/Task, Candidate Stage/Task, Onboarding Portal (candidate-facing) ([models](https://raw.githubusercontent.com/horilla-opensource/horilla/master/onboarding/models.py)).
- Core HR: Employee, Work Information, Bank Details, Notes, Policy (documents), Bonus Points, Disciplinary Action ([models](https://raw.githubusercontent.com/horilla-opensource/horilla/master/employee/models.py)).
- Attendance: Attendance, Activity (punch log), Overtime, Late-come/Early-out, Validation Conditions, Grace Time, Batch attendance ([models](https://raw.githubusercontent.com/horilla-opensource/horilla/master/attendance/models.py)).
- Leave: Leave Type, Available Leave, Request (+comments/files), Allocation Request, conditional approval, Restrict Leave, Holiday, Company Leave ([models](https://raw.githubusercontent.com/horilla-opensource/horilla/master/leave/models.py)).
- Payroll: Contract, Allowance, Deduction, Payslip (+auto-generate), Loan Account, Reimbursement, Encashment settings, Work Record, Filing Status ([models](https://raw.githubusercontent.com/horilla-opensource/horilla/master/payroll/models/models.py)).
- Performance (PMS): Period, Objective, Key Result, Employee Objective, 360 Feedback, anonymous feedback, Meetings, Bonus points ([models](https://raw.githubusercontent.com/horilla-opensource/horilla/master/pms/models.py)).
- Offboarding: Offboarding stages/tasks, Resignation Letter, Exit Reason, Notes ([models](https://raw.githubusercontent.com/horilla-opensource/horilla/master/offboarding/models.py)). Assets: Category, Lot, Asset, Assignment, Request, Report ([models](https://raw.githubusercontent.com/horilla-opensource/horilla/master/asset/models.py)). Helpdesk, Projects.

**Biometric**: device types **ZKTeco/eSSL, Anviz, Matrix COSEC, Dahua, e-Time Office**, with direction in/out/alternate ([biometric/models.py](https://raw.githubusercontent.com/horilla-opensource/horilla/master/biometric/models.py)) - most relevant of all projects for an Egyptian factory using ZKTeco-style devices (assumption about their devices: unverified).
**Arabic/RTL**: Arabic locale exists (`locale/ar`, [LANGUAGES in settings.py](https://raw.githubusercontent.com/horilla-opensource/horilla/master/horilla/settings.py)); the `<html dir=rtl>` switch is **commented out** in `templates/index.html` ([index.html](https://raw.githubusercontent.com/horilla-opensource/horilla/master/templates/index.html)) so RTL layout likely incomplete (runtime behavior not verified). Default timezone Asia/Kolkata and India-centric payroll defaults.
**Weaknesses**: young codebase, India-centric, RTL gap, license confusion, payroll rules less flexible than Frappe (Allowance/Deduction with conditions; no Egypt), no training module found, no formal full-and-final settlement.

---

### 2.5 IceHrm

| Item | Value |
|---|---|
| License | **Elastic License 2.0** (source-available, not OSI) ([LICENSE](https://raw.githubusercontent.com/gamonoid/icehrm/master/LICENSE)) |
| Stack | PHP + JavaScript, MySQL 8, Docker ([github.com/gamonoid/icehrm](https://github.com/gamonoid/icehrm)) |
| Stars / release | ~738 stars (2026-11-04); latest release v36.0.1 on 2026-10-01 ([API](https://api.github.com/repos/gamonoid/icehrm)) |
| Activity | Active (pushed 2026-11-03) |
| Editions | Open-source core + paid "IceHrmPro" / extensions; the pricing page does not list which features are Pro ([icehrm.com/pricing](https://www.icehrm.com/pricing)); repo has `extensions/` incl. leave, directory, advance_reports, company_overview ([tree](https://github.com/gamonoid/icehrm/tree/master/extensions)) |

**Modules (README)**: employee records, company structure (list/org chart), leave (apply/approve/types/holidays/team calendar), time & attendance (punch, history, **overtime requests/approvals**), projects & timesheets with approval, self-service dashboard, staff directory ([repo](https://github.com/gamonoid/icehrm)). The product menu additionally lists Documents/e-signing, Assets, Payroll, Expenses, Performance, Recruitment, Training, Tasks, Reports - edition not stated ([pricing](https://www.icehrm.com/pricing)) -> treat as paid until proven. Mobile app exists (edition not stated) ([pricing](https://www.icehrm.com/pricing)).
**Arabic/RTL/Egypt/biometric**: not verified.
**Weaknesses**: not OSI-open; key modules likely paid; JS-heavy legacy UI.

### 2.6 Jorani (leave & overtime only)

MIT; PHP 8.1+ (framework not verified), MySQL 8; ~411 stars; latest release v1.0.4 on 2026-03-29; last push 2026-04-04 ([API](https://api.github.com/repos/bbalet/jorani), [README](https://github.com/jorani/jorani)). Features: leave requests with **one validator**, overtime requests with one validator, org tree with supervisor per entity, non-working days per contract, monthly presence report, calendars (individual/team/collaborators), REST API OAuth2, SSO via SAML/LDAP/AD; **Arabic among 15 languages** ([README](https://github.com/jorani/jorani)). Gaps: no payroll/attendance/recruitment; single-level approval; RTL not verified.

### 2.7 Sentrifugo (legacy but feature-rich; use as a checklist only)

GPL-3.0; PHP 5.3+/Zend-style MVC/Apache; v3.1.1; ~546 stars; **last push 2021-07-02** (a 2017 mirror also exists) ([API](https://api.github.com/repos/sapplica/sentrifugo), [repo](https://github.com/sapplica/sentrifugo)); vendor website refused connection on 2026-11-04 (`sentrifugo.com`). Despite being dead, its controller list is a good HR checklist ([controllers](https://github.com/sapplica/sentrifugo/tree/master/application/modules/default/controllers), [modules](https://github.com/sapplica/sentrifugo/tree/master/application/modules)): Requisition (+approved/rejected, history), Candidate details, Shortlisted, Interview rounds & scheduling, Background-check screening (agencies, types), Employee jobs history, Dependents, Visa/immigration, Work eligibility, Disability, Training & certifications, Leave management (+approved/cancelled/pending/rejected), Holiday groups, **Disciplinary incidents/violations (+my/team views)**, Appraisal (categories, groups, questions, ratings, self/team/manager) and **Feedforward**, Medical claims, Payslips (records), Policy documents, Announcements, **Exit** module, **Assets** module, **Expenses** module, **Services** (service desk), Time management (projects/timesheets), Roles & privileges, HR wizard. Weaknesses: abandoned, PHP 5-era, security risk; no payroll engine; no RTL.

### 2.8 TimeTrex Community Edition

AGPL; PHP; time & attendance, scheduling, timeclock, payroll, job costing, HR, recruitment listed on SourceForge (last update 2023-06-02) ([SourceForge](https://sourceforge.net/projects/timetrex/)). The official GitHub repo has ~10 stars and a last push/release of 2018 (v11.3.0) ([API](https://api.github.com/repos/timetrex/timetrex)); a third-party fork/mirror (FairnessTNA, ~9 stars, v11.6.1 series) continues CE code ([FairnessTNA](https://github.com/aydancoskun/FairnessTNA)). Payroll is North-America focused; tax filing is a paid feature ([review summary](https://www.hr.software/reviews/timetrex-community-edition) - third-party, unverified). Current CE version and activity: not verified. Useful as a time-policy reference (premium/overtime/break/absence policies); not a base.

### 2.9 Recruiting-focused OSS

| Project | License / stack / stars | Notes |
|---|---|---|
| **OpenCATS** | MPL-2.0 + CPL-1.1a; PHP/MySQL; ~774 stars; release v0.12.0 on 2026-10-22 ([API](https://api.github.com/repos/OpenCATS/OpenCATS), [LICENSE.md](https://raw.githubusercontent.com/opencats/OpenCATS/master/LICENSE.md)) | Recruiter-CRM style ATS: job posting -> candidate application -> selection/submission; modernisation roadmap to PHP 8.4/8.5 ([README](https://raw.githubusercontent.com/opencats/OpenCATS/master/README.md)). Agency-oriented (job orders, clients) rather than factory hiring; no onboarding hand-off. Feature depth beyond the README not verified. |
| **Odoo Recruitment** | LGPL-3 (Community) | See 2.2: kanban pipeline, stages, interviewers, refuse reasons, talent pool, careers website, SMS/survey add-ons. Best open-source ATS UX for a hire->employee conversion. |
| **Frappe HR recruitment** | GPL-3 | Requisition -> Opening -> Applicant -> Interview(+feedback) -> Offer -> Onboarding; ATS depth called "shallow" by a vendor comparison ([reqcore blog](https://reqcore.com/blog/best-open-source-applicant-tracking-systems), biased source). |
| **OrangeHRM recruitment** | GPL-3 | Vacancy/Candidate/Interview; "recruitment is shallow" per same vendor blog. |
| **Horilla recruitment** | LGPL-2.1 | Stage pipeline, survey, skill zone, interview schedule, LinkedIn account. |
| **CandidATS** (OpenCATS fork), **Harly** (MIT, self-hosted ATS), **FreeATS** (MIT, Ruby) | - | Named in 2026 roundups ([reqcore](https://reqcore.com/blog/best-open-source-applicant-tracking-systems), [search results](https://harly.dev/)); stars/activity not verified. A vendor-run "Reqcore" is described as proprietary in one article but AGPL in another search result - unverified. |

### 2.10 Notable newcomers / others (2023-2026)

| Project | Notes |
|---|---|
| **Ever Gauzy** | AGPL-3.0 (commercial licenses available); TypeScript/NestJS/Angular; ~8.7k stars; HRM + ATS + time tracking + time off + expenses; payroll not a dedicated module ([repo](https://github.com/ever-co/ever-gauzy)). Created 2019 ([search API](https://api.github.com/search/repositories?q=hrms)). |
| **Skapp** (SkappHQ) | AGPL-3.0; React/TypeScript + NestJS + PostgreSQL; ~66 stars; people directory, org hierarchy, onboarding workflows, leave workflows, attendance/timesheets; APICTA 2025 Gold ([repo](https://github.com/SkappHQ/skapp)). Early-stage. |
| **ahmed-fawzy99/hr-management-system** | MIT; Laravel 10 + Vue 3/Inertia + PostgreSQL; ~102 stars; attendance (self check-in, IP check, overtime/undertime), leave, auto payroll with payslip emails, **English + Arabic** (RTL not explicitly stated) ([repo](https://github.com/ahmed-fawzy99/hr-management-system)). Small hobby-scale but the closest Arabic-aware lightweight reference. |
| **Urlaubsverwaltung** | Apache-2.0; Java/Spring Boot/PostgreSQL; ~302 stars; two-stage approval, department heads, sick notes, overtime, German/English ([repo](https://github.com/urlaubsverwaltung/urlaubsverwaltung)). |
| **Timeoff.Management** | MIT; Node.js/SQLite; ~1.0k stars; 3-step request-approval-accounting, calendar feeds, CSV export ([repo](https://github.com/timeoff-management/timeoff-management-application)); activity: not verified. |
| **Payroll Engine** | MIT; C#/.NET; ~136 stars; regulation-layered, multi-country payroll with cases/wage types/collectors ([repo](https://github.com/Payroll-Engine/PayrollEngine)). Interesting model if Egypt rules must be data, not code; heavy. |
| **Wukong HRM** | Chinese Java/Spring Cloud/Vue2; ~1.6k stars; recruitment, attendance, payroll, social insurance, performance, ESS; license type not stated on page; docs mainly Chinese ([repo](https://github.com/WuKongOpenSource/Wukong_HRM)). Not suitable (language). Its "social insurance" module is conceptually relevant to NOSI. |
| **Open HRMS (Cybrosys)** | Odoo-based HR add-on family; free/paid status and repo not verified ([Odoo apps listing via search](https://apps.odoo.com/apps/modules/12.0/oh_appraisal)). |
| **Egypt-specific OSS HR** | I found no maintained open-source HR with Egyptian social-insurance/tax payroll; only vendor-sold add-ons for [ERPNext](https://ecosire.com/apps/erpnext/erpnext-egypt-payroll) and [Odoo](https://ecosire.com/apps/odoo/odoo-egypt-payroll) (marketing claims, unverified), plus an old AGPL Odoo 8.0 module ([apps.odoo.com](https://apps.odoo.com/apps/modules/8.0/l10n_eg_hr_payroll)). |

---

## 3. Cross-project feature matrix

Legend: ✔ = present (verified in source/docs); partial = limited or only a record/definition; ✘ = absent/not found; ? = not verified. "Odoo EE" column shows what Enterprise ADDS (✔ = Enterprise-only feature, blank = same as CE).

| Feature | Frappe HR | Odoo CE | Odoo EE adds | OrangeHRM Starter | Horilla | IceHrm (OSS core) | Sentrifugo | Jorani | TimeTrex CE | OpenCATS |
|---|---|---|---|---|---|---|---|---|---|---|
| Headcount requisition/staffing plan | ✔ | partial (job target) | | ✘ | ? | ✘ | ✔ | ✘ | ✘ | ✘ |
| ATS pipeline (stages/kanban) | ✔ | ✔ | | ✔ | ✔ | ? | ✔ | ✘ | partial (listing) | ✔ |
| Interview scheduling + feedback | ✔ | partial (calendar) | | ✔ | ✔ | ? | ✔ | ✘ | ? | ? |
| Job offer / appointment letter | ✔ | ✘ | ✔ (unverified) | ✘ | ✘ | ? | ? | ✘ | ✘ | ✘ |
| Careers/public job page | ✔ | ✔ | | ? | ✔ | ? | ? | ✘ | ? | ✔ |
| Onboarding checklist | ✔ | ✔ (plans) | | ✘ | ✔ | ? | ? | ✘ | ✘ | ✘ |
| Employee records (full profile) | ✔ | ✔ | | ✔ | ✔ | ✔ | ✔ | partial | ✔ | ✘ |
| Org chart / department tree | ✔ | ✔ | | ✔ (subunits) | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| Effective-dated job/contract history | partial (promotion/transfer/SSA) | ✔ (hr.version 19) | | partial | partial | ? | ✔ (job history) | ✘ | ? | ✘ |
| Documents/ID expiry tracking | partial | ✔ (permit/visa) | | ✔ (immigration) | ✔ | ? | ✔ | ✘ | ? | ✘ |
| Attendance punch (web/mobile/geo) | ✔ | ✔ | | ✔ | ✔ | ✔ | partial | ✘ | ✔ | ✘ |
| Biometric device sync | partial (sync tool) | partial (kiosk/badge) | | ✘ | ✔ (ZK, Anviz, COSEC, Dahua) | ? | ✘ | ✘ | ? | ✘ |
| Shift definition | ✔ | partial (work schedule) | | partial | ✔ | ? | ✘ | ✘ | ✔ | ✘ |
| Shift roster / schedule / swap | ✔ | ✘ | ✔ (Planning) | ✘ | partial | ✘ | ✘ | ✘ | ✔ | ✘ |
| Attendance regularization request | ✔ | partial | | ? | ✔ | ? | ? | ✘ | ? | ✘ |
| Late/early rules, grace time | ✔ | partial (tolerance) | | ? | ✔ | ? | ? | ✘ | ✔ | ✘ |
| Overtime rules / approval | ✔ | ✔ (rulesets) | | ✘ | ✔ | ✔ (requests) | ✘ | ✔ (requests) | ✔ | ✘ |
| Leave types/policies/balances | ✔ | ✔ | | ✔ | ✔ | ✔ | ✔ | ✔ | partial | ✘ |
| Accrual / carry-forward / encashment | ✔ | ✔ (accrual+carryover) | | partial | ✔ | ? | ? | ? | ? | ✘ |
| Multi-step leave approval | partial (workflow) | ✔ (1-2 step) | | ✔ | ✔ (conditional) | ✔ | ✔ | ✘ (single) | ? | ✘ |
| Team leave calendar | ✔ | ✔ (Gantt) | | ✔ | ✔ | ✔ | ✔ | ✔ | ? | ✘ |
| Payroll engine (salary structure/components) | ✔ | ✘ | ✔ | ✘ (record only) | ✔ (allowance/deduction) | ? (paid?) | partial (payslip records) | ✘ | ✔ (US/CA) | ✘ |
| Payslip generation + approval states | ✔ | ✘ | ✔ | ✘ | ✔ | ? | partial | ✘ | ✔ | ✘ |
| Statutory tax / social insurance | partial (India, UAE regional) | ✘ | ✔ (Egypt module, EE) | ✘ | ✘ | ✘ | ✘ | ✘ | partial (US/CA) | ✘ |
| Arrears / corrections / withholding | ✔ | ✘ | ? | ✘ | ✘ | ✘ | ✘ | ✘ | ? | ✘ |
| Loans / advances | partial (advance ✔, loans via Lending) | ✘ | ? | ✘ | ✔ (LoanAccount) | ? | ✘ | ✘ | ✘ | ✘ |
| Benefits / allowances claims | ✔ | ✘ | ✔ | ✘ | partial | ? | ✔ (benefits) | ✘ | ✘ | ✘ |
| Expense claims | ✔ | ✔ | | ✔ | ✔ (reimbursement) | ? | ✔ | ✘ | ✘ | ✘ |
| Performance / appraisal / KPI | ✔ | ✘ | ✔ (Appraisals) | ✔ | ✔ | ? | ✔ | ✘ | ✘ | ✘ |
| Goals / OKR | ✔ | ✘ | ✔ | ✔ (KPI) | ✔ | ? | partial | ✘ | ✘ | ✘ |
| Training / certification | ✔ | partial (skills, slides) | | ✘ (paid) | ✘ | ? | partial | ✘ | ✘ | ✘ |
| Disciplinary / warnings | ✘ (grievance only) | ✘ | ✘ | ✘ (paid?) | ✔ | ? | ✔ | ✘ | ✘ | ✘ |
| Grievance / helpdesk | ✔ (grievance) | ✘ | | ✘ | ✔ (helpdesk) | ? | ✔ (service desk) | ✘ | ✘ | ✘ |
| Asset assignment/recovery | partial (+ERPNext asset) | partial (equipment) | | ✘ | ✔ | ? | ✔ | ✘ | ✘ | ✘ |
| Offboarding checklist | ✔ | ✔ (plans+wizard) | | partial (termination record) | ✔ | ? | ✔ (exit) | ✘ | ✘ | ✘ |
| Exit interview | ✔ | ✘ | | ✘ | partial (survey) | ? | ? | ✘ | ✘ | ✘ |
| Full & final settlement | ✔ | ✘ | ✔ (EE payslip, Egypt) | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Analytics / reports / exports | ✔ | ✔ | | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Employee self-service portal | ✔ | ✔ | | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| Mobile app / PWA | ✔ (PWA) | partial (responsive; native app ?) | | ✔ (5.4+) | partial | ✔ (edition ?) | ✘ | ✘ | ? | ✘ |
| Audit log / history | ✔ (doc versioning) | ✔ (chatter tracking) | | partial | ✔ (auditlog) | ? | ✔ | ✘ | ? | ✘ |
| Arabic UI translation | ✔ (ar.po) | ✔ | | ? | ✔ (ar) | ? | ? | ✔ | ? | ? |
| Real RTL layout | ? | ? | | ? | partial/? (dir switch commented out) | ? | ✘ | ? | ? | ? |
| Egypt payroll (NOSI/tax) | ✘ (3rd-party paid) | ✘ | ✔ (EE) | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | n/a |

Sources for the matrix: Frappe doctype trees ([hr](https://github.com/frappe/hrms/tree/develop/hrms/hr/doctype), [payroll](https://github.com/frappe/hrms/tree/develop/hrms/payroll/doctype)); Odoo addons ([19.0](https://github.com/odoo/odoo/tree/19.0/addons)); OrangeHRM plugins ([src/plugins](https://github.com/orangehrm/orangehrm/tree/main/src/plugins)); Horilla models (links in 2.4); Sentrifugo controllers (2.7); Jorani, IceHrm, TimeTrex pages (2.5, 2.6, 2.8); OpenCATS ([README](https://raw.githubusercontent.com/opencats/OpenCATS/master/README.md)). IceHrm/TimeTrex "?" cells reflect missing verification, not absence.

---

## 4. Canonical data model (what Frappe HR and Odoo HR actually model)

All fields below were read from source: Frappe `develop` JSON (https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/<name>/<name>.json, payroll: .../hrms/payroll/doctype/<name>/<name>.json) and Odoo 19.0 models (https://raw.githubusercontent.com/odoo/odoo/19.0/addons/<module>/models/<file>.py). Statuses quoted exactly.

### 4.1 Organisation and Core HR
- **Employee**
  - Frappe ([employee.json](https://raw.githubusercontent.com/frappe/erpnext/develop/erpnext/setup/doctype/employee/employee.json)): employee_number, first/middle/last name, gender, date_of_birth, date_of_joining, status (Active|Inactive|Suspended|Left), company, branch, department, designation, reports_to, employment_type, grade, holiday_list, default shift, salary_mode (Bank|Cash|Cheque), bank_name/bank_ac_no/iban, attendance_device_id, scheduled_confirmation_date/final_confirmation_date, contract_end_date, notice_number_of_days, date_of_retirement, emergency contact (person, phone, relation), personal/company email, cell_number, permanent/current address, passport (number, issue, expiry), marital_status, blood_group, education & work-history child tables, resignation_letter_date, relieving_date, reason_for_leaving, leave_encashed, user_id link.
  - Odoo ([hr_employee.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr/models/hr_employee.py)): name/legal_name, work_contact_id, work phone/mobile/email, private phone/email, birthday, place/country_of_birth, parent_id (manager), coach_id, category_ids (tags), barcode, pin, bank_account_ids, primary_bank_account_id, visa_no/permit_no/visa_expire, certificate/study_field/study_school, emergency_contact/phone, private_car_plate, id_card, driving_license, resource_calendar_id, tz, user_id, `current_version_id` + `version_ids`.
- **Employee version / contract (Odoo 19 `hr.version`)** ([hr_version.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr/models/hr_version.py)): date_version, department_id, job_id, job_title, work_location_id, address_id, employee_type, contract_type_id, contract_template_id, contract_date_start/end, trial_date_end, resource_calendar_id (+is_flexible), wage, structure_type_id, hr_responsible_id, departure_reason_id/date/description, identification/ssnid/passport (+expiry), marital, spouse, children, distance_home_work. Pattern: one stable Employee + many dated "versions" - best model for promotions/transfers/raises history.
- **Department**: Frappe has Department (tree) + `department_approver` child table (leave/expense/shift approvers). Odoo `hr.department` ([hr_department.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr/models/hr_department.py)): name, complete_name, parent_id, child_ids, manager_id, member_ids, jobs_ids, plan_ids (onboarding plans), master_department_id, company_id, color.
- **Designation / Job**: Frappe Designation (+skills). Odoo `hr.job` ([hr_job.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr/models/hr_job.py)): name, department_id, expected_employees, no_of_employee, no_of_recruitment, description, requirements, contract_type_id, user_id (recruiter).
- **Employee Grade / Employment Type / Contract Type**: Frappe Employee Grade, Employment Type; Odoo `hr.contract.type`.
- **Lifecycle events**: Frappe Employee Promotion (promotion_details table, current/revised CTC), Employee Transfer (new company/department, reallocate leaves, new employee id) ([promotion](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/employee_promotion/employee_promotion.json), [transfer](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/employee_transfer/employee_transfer.json)).

### 4.2 Recruitment / ATS
- **Staffing Plan / Job Requisition** (Frappe): requisition = designation, department, no_of_positions, expected_compensation, requested_by, posting_date, expected_by, reason_for_requesting, time_to_fill, status (Pending|Open & Approved|Rejected|Filled|On Hold|Cancelled) ([job_requisition.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/job_requisition/job_requisition.json)). Staffing Plan: department, period, details (vacancies, estimated cost), total_estimated_budget.
- **Job Opening**: job_title, designation, department, status (Open|Closed), vacancies, posted_on/closes_on, publish (website), salary range, employment_type, location, job_requisition, staffing_plan ([job_opening.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/job_opening/job_opening.json)). Odoo: the `hr.job` itself (no_of_recruitment, interviewer_ids, alias email, application counts) ([hr_recruitment/hr_job.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_recruitment/models/hr_job.py)).
- **Applicant**: Frappe Job Applicant: applicant_name, email_id, phone_number, status (Open|Replied|Shortlisted|Rejected|Hold|Accepted), job_title, source, resume_attachment, applicant_rating, salary range, employee_referral ([job_applicant.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/job_applicant/job_applicant.json)). Odoo `hr.applicant`: partner_name, email_from, phone, linkedin_profile, stage_id, kanban_state, priority, job_id, user_id, interviewer_ids, salary_expected/proposed, availability, source/medium/campaign, refuse_reason_id, categ_ids, date_closed, day_open/day_close, talent_pool_ids ([hr_applicant.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_recruitment/models/hr_applicant.py)). Stage: name, sequence, requirements, template_id (auto email), fold, hired_stage, rotting_threshold_days.
- **Interview**: Frappe Interview Type, Interview (job_applicant, scheduled_on, from/to time, status Pending|Under Review|Cleared|Rejected|Cancelled, average_rating), Interview Feedback (interviewer, skill_assessment ratings, result) ([interview.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/interview/interview.json)). Odoo: calendar events linked to applicant.
- **Job Offer**: applicant, designation, department, grade, employment_type, offer_date, offer_valid_till, date_of_joining, salary_structure, base/variable/ctc, probation_period_days, notice terms, leave_policy, holiday_list, terms template, status (Draft|Ready to Send|Awaiting Response|Accepted|Rejected|Cancelled) ([job_offer.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/job_offer/job_offer.json)). Appointment Letter (template + terms).

### 4.3 Onboarding / Offboarding
- **Employee Onboarding**: job_offer/job_applicant, employee, date_of_joining, boarding_status, template, activities (task, user/role, begin/end, required_for_employee_creation), holiday_list ([employee_onboarding.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/employee_onboarding/employee_onboarding.json)). Odoo `mail.activity.plan` (+templates: activity type, responsible type, delay count/unit, before/after).
- **Employee Separation**: employee, resignation_letter_date, template, activities, exit_interview ([employee_separation.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/employee_separation/employee_separation.json)). **Exit Interview**: relieving_date, interviewers, status (Pending|Scheduled|Completed|Cancelled), questionnaire, summary. Odoo: `hr.departure.reason` + departure wizard + offboarding plan.
- **Full and Final Statement**: employee, relieving_date, payables (component, amount, account), receivables, assets_allocated (cost to recover), totals, status (Paid|Unpaid|Cancelled).

### 4.4 Time & attendance / shifts
- **Shift Type** (Frappe): start_time, end_time, holiday_list, determine_check_in_and_check_out, working_hours_calculation_based_on, working_hours_threshold_for_half_day / _for_absent, begin_check_in_before_shift_start_time, allow_check_out_after_shift_end_time, late_entry_grace_period, early_exit_grace_period, enable_auto_attendance, process_attendance_after, mark_auto_attendance_on_holidays, absent_buffer_days, enable_late_entry_marking, enable_early_exit_marking, allow_overtime, overtime_type, color.
- **Shift Assignment / Request / Schedule**: Assignment(employee, shift_type, start/end date, status Active|Inactive, shift_location, overtime_type); Request(shift_type, employee, from/to, approver, status Draft|Approved|Rejected); Schedule(frequency, repeat_on_days, shift_type) + Schedule Assignment.
- **Employee Checkin / Attendance** (Frappe): Checkin(employee, log_type IN/OUT, time, device_id, shift, lat/long, offshift, skip_auto_attendance, linked attendance); Attendance(employee, attendance_date, status Present|Absent|On Leave|Half Day|Work From Home, working_hours, shift, in_time/out_time, late_entry, early_exit, leave_type/application, overtime_type, actual_overtime_duration). **Attendance Request**(from/to, half_day, reason, explanation, shift, include_holidays).
- **Attendance** (Odoo): employee, check_in, check_out, worked_hours, expected_hours, overtime_hours, overtime_status, validated_overtime_hours, in/out latitude/longitude/IP/browser/mode. **Overtime** (`hr.attendance.overtime.line`): date, duration, manual_duration, status, amount_rate, rule_ids; **Ruleset/Rule**: base_off, timing_type, expected_hours(+from contract), quantity_period, paid, amount_rate, employee_tolerance, employer_tolerance ([overtime models](https://github.com/odoo/odoo/tree/19.0/addons/hr_attendance/models)).
- **Work Entry** (Odoo): employee, version, date, duration, work_entry_type (code, is_leave, is_work, is_extra_hours, amount_rate), state draft|conflict|validated|cancelled.
- **Holiday List** (Frappe) / Resource Calendar + Leaves (Odoo).
- **Overtime Type** (Frappe): overtime_salary_component, standard_multiplier, weekend_multiplier, public_holiday_multiplier, maximum_overtime_hours_allowed, overtime_calculation_method, hourly_rate. **Overtime Slip**: employee, start/end date, overtime_details (child), total_overtime_duration, salary_slip, payroll_entry.

### 4.5 Leave
- **Leave Type** (Frappe): max_leaves_allowed, applicable_after, max_continuous_days_allowed, is_carry_forward, maximum_carry_forwarded_leaves, expire_carry_forwarded_leaves_after_days, is_lwp, is_ppl (+fraction_of_daily_salary_per_leave), is_optional_leave, allow_negative, include_holiday, is_compensatory, allow_encashment (+max_encashable, earning_component), is_earned_leave (+frequency, rounding, allocate_on_day). Odoo `hr.leave.type`: leave_validation_type (no_validation|hr|manager|both), requires_allocation, allocation_validation_type, request_unit (day/half/hour), time_type (leave|other), unpaid, include_public_holidays_in_duration, support_document, allows_negative/max_allowed_negative, accruals_ids, responsible_ids, country_id.
- **Policy/Allocation**: Frappe Leave Policy (details: leave_type, annual_allocation) -> Leave Policy Assignment (employee, period/effective dates, carry_forward) -> Leave Allocation (new_leaves_allocated, carry_forward, unused_leaves, from/to) + append-only **Leave Ledger Entry** (transaction_type, leaves +/-, is_expired, is_carry_forward, is_lwp). Odoo: Accrual Plan -> Levels (start after N days/months, frequency weekly/monthly/yearly, added_value, caps, carryover rules, validity) -> Allocation (state, validation, accrual_plan_id, nextcall/lastcall, carryover expiry).
- **Leave Application/Request**: Frappe (employee, leave_type, from/to, half_day(+date), total_leave_days, leave_balance, leave_approver, status Open|Approved|Rejected|Cancelled, salary_slip link) / Odoo (state confirm|refuse|validate1|validate|cancel, request_date_from/to, request_hour_from/to, half-day period, first_approver_id, second_approver_id, supported attachment, has_mandatory_day) ([hr_leave.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_holidays/models/hr_leave.py)). Also Leave Block List, Compensatory Leave Request, Leave Encashment, Mandatory Days.

### 4.6 Payroll
- **Salary Component**: salary_component, abbreviation, type (Earning|Deduction), depends_on_payment_days, amount_based_on_formula + formula, condition, amount, is_tax_applicable, statistical_component, do_not_include_in_total, variable_based_on_taxable_salary, is_flexible_benefit, accrual/arrear flags, accounts (per company).
- **Salary Structure**: company, payroll_frequency, is_active, currency, earnings[], deductions[], employer_contributions[], salary-slip-based-on-timesheet/hour_rate, leave_encashment_amount_per_day, mode_of_payment. **Salary Structure Assignment**: employee, salary_structure, from_date, base, variable, ctc, income_tax_slab, payroll_cost_centers. Odoo EE: contract wage + structure type + rules (closed).
- **Payroll Entry (run)**: payroll_frequency, start/end date, company/branch/department/designation/grade filters, employees[], validate_attendance, cost_center, payment_account, salary_slips_created, salary_slips_submitted, status (Draft|Submitted|Cancelled|Queued|Failed), error_message, overtime_step.
- **Salary Slip**: employee, start/end date, salary_structure, total_working_days, payment_days, leave_without_pay, absent_days, unmarked_days, earnings[], deductions[], gross_pay, total_deduction, net_pay, rounded_total, year_to_date/month_to_date, ctc, employer_contributions, bank details, status (Draft|Submitted|Cancelled|Withheld), leave_details.
- **Adjustments**: Additional Salary (employee, component, amount, payroll_date, recurring, overwrite structure, type), Arrear, Payroll Correction, Salary Withholding (cycles; status Draft|Withheld|Released|Cancelled), Employee Incentive, Retention Bonus, Gratuity (rule + slabs, `pay_via_salary_slip`), Leave Encashment, Employee Benefit Application/Claim/Ledger, Income Tax Slab / Taxable Salary Slab / Tax Exemption declaration & proof ([payroll doctypes](https://github.com/frappe/hrms/tree/develop/hrms/payroll/doctype)).
- **Payroll Settings** toggles: payroll_based_on (Leave / Attendance), include_holidays_in_total_working_days, daily_wages_fraction_for_half_day, email_salary_slip_to_employee, encrypt_salary_slips_in_emails, consider_unmarked_attendance_as, create_overtime_slip, show_leave_balances_in_salary_slip ([payroll_settings.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/payroll/doctype/payroll_settings/payroll_settings.json)).

### 4.7 Performance
- Frappe: KRA (title), **Goal** (tree; employee, kra, appraisal_cycle, progress, start/end, status Pending|In Progress|Completed|Archived|Closed), **Appraisal Template** (KRAs/goals with weightage, rating criteria), **Appraisal Cycle** (start/end, branch/department/designation filters, kra_evaluation_method, final_score_formula, status Not Started|In Progress|Completed, appraisees[]), **Appraisal** (employee, cycle, self_ratings, goals, feedback score, total/final score, remarks, reflections), **Employee Performance Feedback** (reviewer, ratings), Employee Feedback Criteria. Odoo Appraisals: Enterprise (not inspectable). Horilla: Objective, Key Result, Feedback, anonymous feedback, Meetings ([pms models](https://raw.githubusercontent.com/horilla-opensource/horilla/master/pms/models.py)). OrangeHRM: KPI, Performance Review (+reviewers, ratings), Tracker.

### 4.8 Training / skills
- Frappe: Training Program, Training Event (event_status, trainer, location, employees[], has_certificate), Training Result, Training Feedback, Skill, Employee Skill Map, Designation Skill. Odoo: `hr.skill.type/level/skill`, `hr.employee.skill`, `hr.resume.line`, `hr.job.skill`, eLearning/survey links.

### 4.9 Disciplinary / grievance
- Frappe Employee Grievance: grievance_type, raised_by, grievance_against (employee/party), subject, description, cause, status (Open|Investigated|Resolved|Invalid|Cancelled), resolved_by, resolution_detail/date ([employee_grievance.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/employee_grievance/employee_grievance.json)). Horilla Disciplinary Action + Actiontype ([models](https://raw.githubusercontent.com/horilla-opensource/horilla/master/employee/models.py)). Sentrifugo Disciplinary Incident/Violation (+history) ([controllers](https://github.com/sapplica/sentrifugo/tree/master/application/modules/default/controllers)). Neither Frappe nor Odoo CE has a formal warning/penalty (deduction) ladder - EG must define it.

### 4.10 Assets, expenses, advances, loans
- Frappe Employee Advance: employee, purpose, advance_amount, paid_amount, claimed_amount, return_amount, pending_amount, repay_unclaimed_amount_from_salary, status (Draft|Paid|Partially Paid|Unpaid|Claimed|Returned|Partly Claimed and Returned|Cancelled) ([employee_advance.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/employee_advance/employee_advance.json)). Expense Claim: employee, expense_approver, approval_status (Draft|Approved|Rejected|Cancelled), status (Draft|Paid|Partially Paid|Unpaid|Rejected|Submitted|Cancelled), expenses[] (type, amount, sanctioned_amount), advances[], taxes, project ([expense_claim.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/expense_claim/expense_claim.json)). Odoo hr.expense: product/category, quantity, price, total, state + approval_state, payment_mode (employee/company), attachments, duplicate detection. Horilla LoanAccount ([payroll models](https://raw.githubusercontent.com/horilla-opensource/horilla/master/payroll/models/models.py)). Asset assignment: Horilla AssetAssignment/AssetRequest ([asset models](https://raw.githubusercontent.com/horilla-opensource/horilla/master/asset/models.py)); Odoo `maintenance.equipment` with employee_id.

---

## 5. Top 25 features for EG-System (ranked for a 100-300 person Egyptian factory)

★ = table-stakes (system is not credible/usable without it). Ranking considers: blue-collar shift workforce, Arabic RTL, monthly payroll accuracy, Egyptian statutory context (labor law 14/2025 in force since 1 Sept 2025 per [Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law), [Deloitte](https://www.deloitte.com/middle-east/en/services/tax/perspectives/egypt-new-labor-law-entering-into-effect.html); private-sector minimum wage EGP 7,000 from 1 Mar 2025, with annual raise rules, 2026 status unclear per [Bloomberg Law](https://news.bloomberglaw.com/payroll/egypt-raises-minimum-wage-for-private-sector-to-egp7-000-month) / [playroll](https://playroll.com/minimum-wage/egypt)). Verify all statutory numbers with a payroll/legal advisor before coding.

| # | Feature | One-line justification | Table-stakes | Borrow from |
|---|---|---|---|---|
| 1 | Employee master with full profile (personal, national ID, address, bank, emergency contact, documents) + status lifecycle | Everything else keys off it; national-ID/insurance-number/bank fields are mandatory in Egypt | ★ | Frappe Employee, Odoo hr.employee |
| 2 | Effective-dated employment history (job, department, grade, wage, contract type, probation end) | Needed for raises/promotions/transfers audit and for correct payroll by date; Odoo 19 `hr.version` is the cleanest model | ★ | Odoo hr.version, Frappe Promotion/Transfer/SSA |
| 3 | Org structure: departments tree, positions/designations, reports-to, approver chain | Drives approvals, filtering, and org chart | ★ | Frappe Department Approver, Odoo hr.department |
| 4 | Attendance capture from fingerprint/face devices (ZKTeco-style) + mobile/web fallback with geofence | Factory attendance is device-based; raw punch log -> processed attendance is the proven pattern | ★ | Frappe Employee Checkin->Attendance, Horilla biometric (ZK/Anviz/COSEC/Dahua) |
| 5 | Shift types + assignment + rotating schedule + monthly roster (swap, weekly-off) | Multi-shift factory; drives lateness, overtime, night premiums | ★ | Frappe Shift Type/Assignment/Schedule/Roster |
| 6 | Attendance rules: grace time, late/early, half-day/absent thresholds, auto-mark, holiday/weekly-off handling | Converts punches to payable days automatically | ★ | Frappe Shift Type settings, Horilla Grace Time |
| 7 | Attendance regularization/correction request with approval + audit trail | Missed punches are daily reality; avoid manual edits without trace | ★ | Frappe Attendance Request, Horilla attendance request |
| 8 | Overtime engine: rules, multipliers (day/night/rest/holiday), caps, approval, payroll feed | Large part of blue-collar pay; Odoo's Egypt rule uses 1.35/1.70/2.0 (verify vs. law) | ★ | Frappe Overtime Type/Slip, Odoo overtime rulesets |
| 9 | Leave types, policy, entitlement by service years, balance ledger, carry-forward/expiry | Egyptian statutory leave (annual, sick tiers, maternity, Hajj etc.) must be coded as policy data | ★ | Frappe Leave Policy/Ledger, Odoo accrual plans |
| 10 | Leave request + multi-level approval + team calendar + balance cards + attachments (medical) | Daily employee/manager interaction; sick-leave certificate requirement | ★ | Odoo Time Off (Gantt, balance), Frappe Leave Application |
| 11 | Public holiday calendar + per-employee/shift holiday & weekly-off assignment | Affects attendance, OT pay and leave day counting | ★ | Frappe Holiday List Assignment |
| 12 | Salary structure with components (basic, allowances, formulas/conditions, effective-dated per employee) | Core of payroll flexibility; avoids hardcoding | ★ | Frappe Salary Component/Structure/Assignment |
| 13 | Payroll run workflow (draft -> calculate -> review/exceptions -> approve -> lock/pay -> close) with attendance/leave/OT/loan inputs and re-run | Monthly accuracy and control; the exception review step is where errors are caught | ★ | Frappe Payroll Entry + Odoo work-entry conflict resolution |
| 14 | Egyptian statutory engine: social insurance (employee/employer shares on insurable wage with min/max caps, NOSI references), progressive income tax with exemption, effective-dated parameters | Not in any open-source core (only paid add-ons); biggest build-vs-buy decision. Odoo EE documents 11%/18.75% and tax bands as reference ([docs](https://www.odoo.com/documentation/18.0/applications/hr/payroll/payroll_localizations/egypt.html)) | ★ | Odoo EE Egypt docs (concepts only), Frappe Income Tax Slab (effective-dated tables) |
| 15 | Payslip (Arabic, printable/PDF, PIN/encrypted delivery in app) + bank transfer/cash disbursement file + payroll register | Employees and bank/finance consume these outputs | ★ | Frappe Salary Slip, Bank Remittance report |
| 16 | Loans and salary advances with installment schedule and auto-deduction + approval | Very common in Egyptian factories; Frappe splits it into Lending app, Horilla has LoanAccount | ★ | Frappe Employee Advance + Salary Slip Loan, Horilla LoanAccount |
| 17 | Additional pay/deductions: bonuses, penalties/deductions with reason, arrears/corrections, salary hold | Real payroll needs one-off items and corrections after the fact | | Frappe Additional Salary/Arrear/Payroll Correction/Salary Withholding |
| 18 | Hiring requisition -> job opening -> applicant pipeline -> interview -> offer -> hire-to-employee conversion | Delivers the "hire" half of hire-to-retire; keep light for blue-collar volume hiring | | Frappe Requisition->Offer chain, Odoo kanban stages |
| 19 | Onboarding and offboarding checklists (documents, IT/asset, safety training, insurance enrollment) with task owners and due dates | Egyptian onboarding requires documents + insurance registration; offboarding gates final pay | ★ | Odoo activity plans, Frappe Onboarding/Separation templates |
| 20 | Exit/end-of-service: resignation/termination record with reason, notice, final settlement (unpaid salary, leave payout, deductions, asset recovery) | Highest legal risk event; Frappe F&F Statement and Odoo EE end-of-service payslip are the references | ★ | Frappe Full & Final, Odoo EE Egypt end-of-service |
| 21 | Disciplinary/penalty ladder (warnings, deductions, suspension) + grievance/complaints, tied to payroll | Factory discipline needs a formal record; open source offers Horilla/Sentrifugo patterns only | | Horilla Disciplinary Action, Sentrifugo Disciplinary, Frappe Grievance |
| 22 | Employee self-service app (Flutter): punch/geo, leave, advance request, payslip, attendance corrections, notifications, Arabic RTL | Delivers value to 100+ workers; Frappe PWA, OrangeHRM mobile, Horilla mobile punch are references | ★ | Frappe HR PWA actions |
| 23 | Role-based access (HR, payroll, dept manager, supervisor, employee) with field-level protection of salary/ID data + audit log | Salary confidentiality and accountability | ★ | Horilla auditlog, Frappe permissions/doc versions |
| 24 | Notifications and reminders (approvals pending, contract/probation end, ID/health-card/permit expiry, birthdays/anniversaries) via in-app/push (and WhatsApp/SMS - unverified in any project) | Reduces missed approvals/expiries | | Frappe HR Settings reminders |
| 25 | Reports/analytics: headcount, turnover, absence/lateness, OT cost, payroll cost by dept, leave balance, ID expiry, attendance monthly grid export | Management review and audits | ★ | Frappe reports list, Odoo reports |

Lower-priority (after v1): performance appraisal & goals (Frappe/Horilla), training records/certifications & safety training (Frappe), assets/uniform/PPE issue & recovery (Horilla), expense claims (Frappe/Odoo), talent pool, surveys/helpdesk, shift-swap requests, medical insurance tracking.

---

## 6. Approval-workflow patterns observed

### 6.1 Leave
- **Frappe**: approver = employee's `leave_approver`, else first in Department's Department Approver list; employee-level overrides department; Leave Application status Open -> Approved | Rejected | Cancelled; approver submits the document (doc is auto-shared with submit permission). Restrictions: cannot apply in a Leave Block List, must fall in one allocation period, cannot submit once salary processed for that period ([docs](https://docs.frappe.io/hr/leave-application)). HR Settings: `leave_approver_mandatory_in_leave_application`, `prevent_self_leave_approval`, `restrict_backdated_leave_application` + role allowed for backdating ([hr_settings.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/hr_settings/hr_settings.json)). Docs do not describe a configurable workflow for leave; Frappe's generic Workflow tool can add states (not verified in docs).
- **Odoo**: per-Leave-Type `leave_validation_type`: none | HR officer | employee's approver | both (two-step). States: confirm ("To Approve") -> validate1 ("Second Approval") -> validate ("Approved"), or refuse / cancel; fields first_approver_id / second_approver_id; flags can_approve/can_validate/can_refuse/can_cancel/can_back_to_approve ([hr_leave.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_holidays/models/hr_leave.py), [hr_leave_type.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_holidays/models/hr_leave_type.py)). Allocations have their own validation type. Second-approval shown striped on the team calendar ([docs](https://www.odoo.com/documentation/19.0/applications/hr/time_off.html)).
- **Others**: Horilla conditional approval (`LeaveRequestConditionApproval`) and allocation requests with comments ([leave models](https://raw.githubusercontent.com/horilla-opensource/horilla/master/leave/models.py)); Jorani single validator ([README](https://github.com/jorani/jorani)); Urlaubsverwaltung department head + final "Freigabe-Verantwortlicher" second stage ([repo](https://github.com/urlaubsverwaltung/urlaubsverwaltung)); Timeoff.Management three-step request/approval/accounting ([repo](https://github.com/timeoff-management/timeoff-management-application)).
- **Recommended for EG**: per-leave-type chain config (none | direct manager | manager + HR), fallback approver by department, delegation when approver absent, hard rules (no overlap, balance check, medical attachment for sick > N days), approval allowed from mobile.

### 6.2 Overtime
- **Frappe**: Attendance has `overtime_type` and `actual_overtime_duration`; Shift Type allows overtime; Overtime Slip groups overtime_details per employee/period and links to Salary Slip/Payroll Entry (`submitted_via_payroll_entry`); Overtime Type multipliers for weekend/public holiday ([overtime_slip.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/overtime_slip/overtime_slip.json), [overtime_type.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/overtime_type/overtime_type.json)). Approval is by submitting the slip (document-level).
- **Odoo CE**: system computes `overtime_hours` per attendance from rulesets; status to_approve -> approved/refused; HR sets `validated_overtime_hours`; ruleset rule has `paid` and `amount_rate` ([hr_attendance.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_attendance/models/hr_attendance.py)). Pay conversion is in Payroll (EE) via work entry type `is_extra_hours` ([hr_work_entry_type.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_work_entry/models/hr_work_entry_type.py)).
- **Jorani / IceHrm**: overtime *requests* with single validator ([Jorani](https://github.com/jorani/jorani), [IceHrm](https://github.com/gamonoid/icehrm)).
- **Recommended for EG**: system-detected overtime from punches vs shift -> supervisor pre/post-approval -> HR validation -> locks into the payroll period; multipliers by type (day/night/rest/holiday); monthly cap.

### 6.3 Advance / loan
- **Frappe**: Employee Advance (status Draft -> Unpaid/Paid/Partially Paid -> Claimed/Returned/Partly Claimed and Returned); advance can be adjusted in an Expense Claim; `repay_unclaimed_amount_from_salary` deducts leftovers via payroll; Salary Slip Loan links installments to slips ([employee_advance.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/employee_advance/employee_advance.json)).
- **Horilla**: LoanAccount deducted through payslip ([payroll models](https://raw.githubusercontent.com/horilla-opensource/horilla/master/payroll/models/models.py)). **Odoo CE**: none.
- **Recommended for EG**: request -> direct manager -> HR -> finance approval (amount thresholds), schedule of installments, auto deduction with cap of % of net salary (policy configurable), early settlement, stop on termination -> flows into F&F.

### 6.4 Payroll
- **Frappe**: Payroll Entry (Draft -> Queued -> Submitted / Failed / Cancelled) creates Salary Slips (Draft -> Submitted / Cancelled / Withheld); batch submit books accrual JE; bank entry afterwards; Salary Withholding for held pay; Payroll Correction for post-hoc LWP reversal ([docs](https://docs.frappe.io/hr/payroll-entry)). Approval = document submit permission (Payroll Manager role) - no multi-sign-off built in (not verified).
- **Odoo**: work entries must be conflict-free (states draft/conflict/validated "In Payslip") before payslips are generated ([hr_work_entry.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_work_entry/models/hr_work_entry.py)); pay-run batch states in EE not inspectable (unverified).
- **Recommended for EG**: Draft -> Calculated -> Exceptions resolved -> HR review -> Finance/Management approval -> Locked (attendance/leave for the period frozen) -> Paid -> Closed; reopen only with audit + reason.

### 6.5 Hiring requisition
- **Frappe**: Staffing Plan / Job Requisition (Pending -> Open & Approved | Rejected | On Hold -> Filled | Cancelled) -> Job Opening (Open/Closed) -> Job Applicant (Open -> Replied/Shortlisted/Hold -> Accepted/Rejected) -> Interview (Pending/Under Review/Cleared/Rejected) with per-interviewer Feedback -> Job Offer (Draft -> Ready to Send -> Awaiting Response -> Accepted/Rejected) -> Employee Onboarding ([job_requisition.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/job_requisition/job_requisition.json), [job_offer.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/job_offer/job_offer.json)).
- **Odoo**: job position target (`no_of_recruitment`, `expected_employees`) -> applicant stages with `hired_stage` -> convert to employee; refuse reasons with canned emails ([hr_job.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr/models/hr_job.py), [hr_recruitment_stage.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_recruitment/models/hr_recruitment_stage.py)).
- **Sentrifugo**: Requisition with approved/rejected lists and history, then shortlisted candidates and interview rounds ([controllers](https://github.com/sapplica/sentrifugo/tree/master/application/modules/default/controllers)).
- **Recommended for EG**: department head raises requisition (headcount + budget check) -> HR -> GM approval -> opening; bulk-hiring mode for production workers.

### 6.6 Other approvals seen
- Shift change: Frappe Shift Request (Draft -> Approved/Rejected -> auto-creates Shift Assignment) ([docs](https://docs.frappe.io/hr/shift-management)).
- Attendance correction: Frappe Attendance Request (submittable) ([attendance_request.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/attendance_request/attendance_request.json)); Horilla attendance request with comments/files ([attendance models](https://raw.githubusercontent.com/horilla-opensource/horilla/master/attendance/models.py)).
- Expense: Frappe `approval_status` Draft/Approved/Rejected/Cancelled + `expense_approver` (mandatory toggle in HR Settings) ([expense_claim.json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/expense_claim/expense_claim.json)); Odoo `approval_state` ([hr_expense.py](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_expense/models/hr_expense.py)).
- Exit: Employee Separation -> Exit Interview -> F&F Statement (Paid/Unpaid) ([F&F json](https://raw.githubusercontent.com/frappe/hrms/develop/hrms/hr/doctype/full_and_final_statement/full_and_final_statement.json)).

**Generic engine suggestion for EG-System** (synthesis): one `ApprovalRequest` entity (type, subject_id, requester, current_step, status Pending/Approved/Rejected/Cancelled/Escalated) + `ApprovalChainTemplate` per type with steps resolved by role (direct manager -> dept head -> HR -> finance), fallback/delegate, SLA/escalation, comments, and immutable decision log. Both Frappe (department approver tables + settings) and Odoo (per-type validation mode) hard-code simpler variants of this.

---

## 7. UX patterns worth borrowing (summary)

- **Employee profile as tabs** (Odoo: Work / Resume / Certifications / Personal / Payroll / Settings; OrangeHRM PIM: personal, contact, emergency, dependents, immigration, job, salary, qualifications, memberships) - map to EG: Overview, Job & Contract history, Attendance, Leave, Payroll, Documents, Loans/Advances, Disciplinary, Assets, Training ([Odoo docs](https://www.odoo.com/documentation/19.0/applications/hr/employees/new_employee.html), [OrangeHRM PIM entities](https://github.com/orangehrm/orangehrm/tree/main/src/plugins/orangehrmPimPlugin/entity)).
- **Leave balance cards + team Gantt/"who is out" total line** (Odoo All Time Off) ([docs](https://www.odoo.com/documentation/19.0/applications/hr/time_off.html)).
- **Roster grid with drag-to-swap, coloured shift blocks, "WO" weekly-off tokens** (Frappe) ([docs](https://docs.frappe.io/hr/shift-management)).
- **Kanban recruitment pipeline with stage-specific emails, refuse reasons, stale-card warnings (`rotting_threshold_days`)** (Odoo) ([stage model](https://raw.githubusercontent.com/odoo/odoo/19.0/addons/hr_recruitment/models/hr_recruitment_stage.py)).
- **Attendance conflict view before payroll** (Odoo work-entry "In Conflict" state).
- **Append-only ledgers** for leave balance (Frappe Leave Ledger Entry) and likewise for loans/advances.
- **Settings page of HR policy toggles** (Frappe HR Settings, Payroll Settings).
- **Onboarding/offboarding as templated checklists with owner + offset-days** (Odoo plans, Frappe templates).
- **Payroll run screen**: filter -> get employees -> create slips -> review -> submit -> pay; status chips Queued/Failed with error message (Frappe `error_message`).

---

## 8. Gaps nobody fills (build ourselves)

1. Egyptian statutory payroll (social insurance caps/forms, income-tax brackets, minimum-wage checks) as effective-dated data - only paid third-party add-ons exist ([ERPNext](https://ecosire.com/apps/erpnext/erpnext-egypt-payroll), [Odoo](https://ecosire.com/apps/odoo/odoo-egypt-payroll); vendor claims, unverified).
2. True Arabic-first RTL UX - none of the projects verified as RTL-first; Horilla has an Arabic locale but the RTL switch is commented out ([index.html](https://raw.githubusercontent.com/horilla-opensource/horilla/master/templates/index.html)).
3. Formal disciplinary ladder tied to payroll deductions.
4. Production-floor features: gate/shift handover, multi-shift roster with night premiums, piece-rate/production-based pay (unverified in all).
5. WhatsApp/SMS notification channel for workers without smartphones (not found in any project).

---

## 9. Items I could not verify

- Odoo 20.0 official release date and its HR changes; Odoo Enterprise-only status of Egypt payroll is inferred from absence in the public repo (docs do not label it).
- Whether Odoo EE has salary attachments/loans (suspected, not verified).
- Horilla mobile app, Horilla RTL runtime behaviour, OrangeHRM Arabic pack/RTL, IceHrm community-vs-Pro module split, IceHrm/TimeTrex Arabic/RTL.
- TimeTrex Community current version and whether CE is still published upstream.
- Stars for Harly, FreeATS, CandidATS, Timeoff.Management activity; Wukong license type.
- Frappe HR RTL quality and Frappe Workflow usage for leave (docs describe a fixed flow).
- Egyptian law details (probation length, annual-leave increments, overtime caps) - sources conflict ([Clyde & Co](https://www.clydeco.com/en/insights/2025/05/egypt-new-labour-law), [Lockton](https://global.lockton.com/us/en/news-insights/egypt-adopts-comprehensive-new-labor-law)); confirm with a lawyer.

## 10. Source index (main)

GitHub API (2026-11-04): https://api.github.com/repos/frappe/hrms · /frappe/erpnext · /odoo/odoo · /orangehrm/orangehrm · /horilla-opensource/horilla · /gamonoid/icehrm · /sapplica/sentrifugo · /bbalet/jorani · /timetrex/timetrex · /OpenCATS/OpenCATS · /OCA/payroll · /OCA/hr. Search endpoint: https://api.github.com/search/repositories?q=hrms
Docs: https://docs.frappe.io/hr/introduction · https://docs.frappe.io/hr/leave-application · https://docs.frappe.io/hr/payroll-entry · https://docs.frappe.io/hr/shift-management · https://www.odoo.com/documentation/19.0/applications/hr.html · https://www.odoo.com/documentation/18.0/applications/hr/payroll/payroll_localizations/egypt.html · https://www.orangehrm.com/en/open-source/ · https://www.horilla.com/features/ · https://www.icehrm.com/pricing
