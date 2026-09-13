# Smart Personal Finance Tracker

## Master Product Requirements Document

**Working name:** KharCha
**Initial user:** Single user / personal use
**Long-term possibility:** Multi-user personal finance product
**Development approach:** Incremental versions with testing and approval after every version

---

# 1. Product Vision

Build an extremely low-friction personal finance application where recording an expense feels almost as easy as sending a message.

The application should answer three fundamental questions:

1. **Where is my money going?**
2. **How much am I actually spending?**
3. **How much money left my account versus how much of that expense actually belongs to me?**

The current spreadsheet-based workflow separates expenses into:

### Fixed / Recurring Costs

Examples:

* Rent
* WiFi
* Gym
* Furniture rentals
* Appliances
* subscriptions
* recurring household expenses

### Variable / Daily Costs

Examples:

* Food
* Travel
* Grocery
* Essentials
* Shopping
* Entertainment
* miscellaneous purchases

The application should preserve this mental model while removing the manual effort required by spreadsheets.

The eventual ideal interaction is:

> "450 dinner at Meghana"

and the application understands:

Amount: ₹450
Category: Food & Dining
Merchant: Meghana
Date: Today
Time: Current time
My share: ₹450

Or:

> "1200 dinner split between 4"

and understands:

Total paid: ₹1,200
My share: ₹300
Recoverable: ₹900
Category: Food & Dining
Split: Equal, 4 participants
Date/time: Automatically captured

The long-term goal is not merely an expense tracker.

The product could eventually become a:

# Personal Financial Operating System

However, early versions should remain extremely focused.

---

# 2. Core Product Principles

## 2.1 Expense Entry Must Be Extremely Fast

The most important product metric initially is:

**How quickly can I record an expense?**

Target:

**Approximately 5 seconds or less for a normal expense.**

The application should never force the user through ten fields for something as simple as:

> ₹80 coffee

Advanced fields should exist but remain optional.

---

## 2.2 Cash Outflow Is Not The Same As Personal Spending

This distinction is fundamental.

Example:

I pay ₹3,000 for dinner for three people.

Cash leaving my account:

₹3,000

My actual expense:

₹1,000

Amount recoverable:

₹2,000

Therefore the application must separately track:

* Amount paid
* My share
* Amount recoverable

Never use only the transaction amount for personal spending analytics.

---

# 3. Expense Classification Model

Every expense belongs broadly to one of two groups.

## A. Variable Expense

An expense generated through everyday activity.

Examples:

Food
Uber
Groceries
Shopping
Movie
Medicine
Coffee
Travel

These are individual transactions.

---

## B. Fixed / Recurring Expense

An expense expected to repeat periodically.

Examples:

Rent
WiFi
Gym membership
Netflix
Appliance rental
Furniture rental
Insurance premium

These should not require manual re-entry every month.

---

# 4. Database Philosophy

Do NOT use Excel as the primary database.

Use a relational database.

Recommended:

**PostgreSQL**

Excel/CSV should be treated as:

* import format
* export format
* backup/reporting format

The application's source of truth must remain the database.

---

# 5. Important Data Modeling Principle

The spreadsheet may contain something such as:

> Food on September 5 = 100 + 240 + 80

Do NOT store this as:

`Food = ₹420`

Store:

Transaction 1 = ₹100
Transaction 2 = ₹240
Transaction 3 = ₹80

Then calculate:

Food total = ₹420

The database stores atomic transactions.

The UI generates summaries.

This enables future:

* merchant analytics
* spending patterns
* editing
* search
* AI analysis
* payment tracking
* split tracking

---

# 6. Core Entity: Transaction

Create a `Transaction` entity.

## Identity

`id`

UUID or equivalent unique identifier.

---

## Transaction Type

`transaction_type`

Future values:

* expense
* income
* refund
* transfer

Initially V1 only needs:

`expense`

---

## Expense Nature

`expense_nature`

Values:

* variable
* recurring_generated

This indicates whether the transaction was manually entered or generated from a recurring expense.

---

# 7. Transaction Financial Fields

## `total_amount`

The amount actually paid in the transaction.

Example:

₹1,200 dinner.

---

## `my_share`

The amount that belongs to the user.

Example:

₹300.

---

## `recoverable_amount`

Amount paid on behalf of others.

Formula:

`total_amount - my_share`

Example:

₹900.

---

## Currency

`currency`

Default:

`INR`

Do not hardcode the entire architecture around INR.

Future currencies may be supported.

---

# 8. Transaction Description Fields

## `description`

Human-readable description.

Examples:

Dinner
Uber to airport
Groceries
Shoes

---

## `merchant`

Optional.

Examples:

Meghana Foods
Uber
Zepto
Amazon
Nike

---

## `category_id`

Reference to category.

---

## `subcategory`

Optional initially.

Examples:

Food & Dining → Restaurant
Transport → Cab
Shopping → Clothing

---

## `notes`

Optional free-text field.

---

# 9. Transaction Date Fields

Keep the following separate:

## `transaction_date`

When the expense actually happened.

## `transaction_time`

When the expense actually happened.

## `created_at`

When it was entered into the application.

## `updated_at`

Last modification timestamp.

This separation is critical because users can enter past expenses.

Example:

Expense occurred:

September 4, 2026
8:30 PM

Expense entered:

September 8, 2026
11:30 AM

Analytics should use:

`transaction_date`

not:

`created_at`

---

# 10. Payment Information

Optional initially.

## `payment_method`

Potential values:

* UPI
* Credit Card
* Debit Card
* Cash
* Bank Transfer
* Wallet
* Other

## `payment_account_id`

Future reference to a financial account.

Examples:

HDFC Bank
ICICI Bank
HDFC Credit Card
Cash
PhonePe

---

# 11. Split Expense Information

Each transaction should support:

## `is_split`

Boolean.

---

## `participant_count`

Total number of participants INCLUDING the user.

Example:

Dinner with three friends + me:

`participant_count = 4`

---

## `split_type`

Values:

* equal
* custom

---

## `my_share`

Actual amount attributable to the user.

For equal split:

`my_share = total_amount / participant_count`

---

## Example

Dinner:

₹2,400

4 people.

Store:

Total amount = ₹2,400
Participant count = 4
My share = ₹600
Recoverable = ₹1,800

---

# 12. Recurring Expense Entity

Create a separate:

`RecurringExpense`

entity.

This represents the RULE that generates expenses.

Example:

Rent is not itself a transaction.

"₹14,000 rent every month" is a recurring expense rule.

That rule can generate monthly transaction instances.

---

# 13. Recurring Expense Fields

## Identity

`id`

---

## `name`

Examples:

Rent
WiFi
Gym
Netflix
Fridge Rental

---

## `category_id`

Examples:

Housing
Utilities
Fitness
Subscriptions

---

## `total_amount`

Full recurring payment.

---

## `my_share`

Amount actually attributable to the user.

This allows recurring expenses to also be split.

Example:

WiFi:

₹1,500 total
3 people

My share:

₹500

---

## `is_split`

Boolean.

---

## `participant_count`

Optional.

---

## `frequency`

Values initially:

* monthly
* weekly
* yearly

Monthly should receive priority.

---

## `start_date`

Date recurrence begins.

---

## `end_date`

Optional.

Example:

Furniture rental ending after six months.

---

## `next_due_date`

Next expected occurrence.

---

## `is_active`

Boolean.

Allows recurring expenses to be paused without deleting history.

---

## `notes`

Optional.

---

## `created_at`

## `updated_at`

---

# 14. Important Recurring Expense Rule

Editing a recurring expense must NOT rewrite historical transactions automatically.

Example:

Rent:

August = ₹14,000
September = ₹14,000
October onward = ₹15,000

Changing the recurring rule to ₹15,000 should not turn August and September into ₹15,000 expenses.

Historical transactions must remain historical records.

---

# 15. Categories

Initial default categories:

### Food & Dining

Restaurant
Cafe
Delivery

### Groceries

### Transport

Cab
Fuel
Public Transport

### Housing

Rent
Furniture
Appliances

### Utilities

Electricity
WiFi
Mobile

### Household / Essentials

### Health

### Fitness

### Shopping

### Entertainment

### Subscriptions

### Travel

### Education

### Gifts

### Personal Care

### Other

Categories should eventually be user-editable.

Do not tightly hardcode business logic to category names.

Use Category IDs.

---

# 16. VERSION 1 - Personal Expense Ledger

## Objective

Build a reliable foundation.

V1 should answer:

> How much am I spending?

and allow the user to reliably record expenses.

NO AI required.

NO bank integrations.

NO advanced analytics.

---

# 17. V1 Main Navigation

Suggested primary sections:

### Dashboard

### Transactions

### Recurring

### Add Expense

Settings can remain minimal.

---

# 18. V1 Add Variable Expense

Primary action:

# + Add Expense

Required fields:

Amount

Description

Category

Optional:

Date
Time
Split
Notes

Default:

Date = Today

Time = Current local time

Timezone must come from the application/user environment rather than assuming UTC.

---

# 19. V1 Split Expense Flow

When:

`Split = No`

set:

`my_share = total_amount`

`recoverable_amount = 0`

When:

`Split = Yes`

ask:

Number of participants.

Initially support:

**Equal split**

Example:

Amount = ₹1,000

Participants = 3

My share:

₹333.33

Recoverable:

₹666.67

Currency rounding must be handled carefully.

Do NOT use floating-point arithmetic for money.

---

# 20. V1 Past Expense Entry

The user should be able to modify:

Date

Time

Example:

Today is September 8.

User enters:

> ₹750 dinner on September 5

V1 manual form allows September 5 to be selected.

The expense must appear in September 5 analytics.

---

# 21. V1 Transaction History

Show transactions newest first.

Display:

Date

Time

Description

Category

Total Paid

My Share

Split indicator

Recurring indicator where applicable

---

# 22. V1 Editing

Every transaction should be editable.

Possible edits:

Amount
Description
Category
Date
Time
Split
Participants
Notes

All calculated values must update correctly.

---

# 23. V1 Delete

Transactions can be deleted.

Require confirmation.

Deleting must update dashboard calculations immediately.

Prefer soft-delete architecture only if it remains simple.

Do not overengineer deletion.

---

# 24. V1 Recurring Expenses

Primary action:

# + Add Recurring Expense

Fields:

Name

Amount

Category

Frequency

Start date

Optional:

End date

Split

Participant count

Notes

---

# 25. V1 Recurring Transaction Generation

Recurring rules should produce actual transaction records.

Example:

Recurring Rule:

Rent
₹14,000
Monthly
Starting September 1

Generated Transaction:

September 1
Rent
₹14,000
Housing
Recurring

This ensures dashboard calculations operate on transactions rather than maintaining two incompatible accounting systems.

Generation must be idempotent.

Running recurring-expense generation twice must NOT create duplicate transactions.

---

# 26. V1 Dashboard

Dashboard should focus on the current month.

Example:

# September 2026

### Variable Spending

₹18,420

### Fixed / Recurring

₹24,760

### Total Effective Spending

₹43,180

Formula:

`Variable my_share + Recurring my_share`

---

# 27. Cash Outflow

Also show:

### Total Amount Paid

This uses:

`SUM(total_amount)`

This can differ from personal spending because of splits.

Example:

Total amount paid:

₹48,000

Personal spending:

₹43,180

Recoverable:

₹4,820

---

# 28. Daily Variable Average

Show:

### Average Daily Variable Spending

Example:

₹614/day

Do NOT include fixed/recurring expenses.

Purpose:

Understand everyday spending behaviour without rent and other fixed costs distorting the metric.

For the current month, initially calculate this using elapsed calendar days unless product testing suggests another definition is more useful.

---

# 29. Category Breakdown

Show current month variable spending:

Food & Dining ₹6,820

Transport ₹2,910

Groceries ₹3,480

Household ₹2,110

Shopping ₹1,300

Other ₹1,800

Use:

`my_share`

rather than:

`total_amount`

for personal-spending analytics.

---

# 30. Month Navigation

Allow:

Previous Month

Current Month

Next Month where relevant

This recreates the useful monthly perspective of the original spreadsheet.

---

# 31. V1 Acceptance Tests

## Test A - Simple Expense

Input:

₹500
Dinner
Food

Expected:

Total paid = ₹500
My share = ₹500
Recoverable = ₹0

---

## Test B - Split Expense

Input:

₹1,200
Dinner
4 participants

Expected:

Total paid = ₹1,200
My share = ₹300
Recoverable = ₹900

---

## Test C - Past Expense

Today:

September 8

Enter:

₹600
September 5

Expected:

Transaction belongs to September 5.

---

## Test D - Recurring Expense

Create:

Rent
₹14,000
Monthly
Starting September 1

Expected:

September recurring cost includes ₹14,000.

---

## Test E - Split Recurring Expense

WiFi:

₹1,500
3 participants

Expected:

Cash outflow = ₹1,500

Personal recurring expense = ₹500

Recoverable = ₹1,000

---

## Test F - Edit

Change:

₹500 → ₹600

Expected:

All dashboard values update correctly.

---

## Test G - Delete

Delete expense.

Expected:

Transaction disappears.

Dashboard totals update.

---

## Test H - Recurring Idempotency

Run recurring transaction generation twice.

Expected:

Only ONE transaction exists for the period.

---

# 32. STOP AFTER V1

Codex must stop after V1.

Do NOT continue automatically.

After V1:

1. Run application.
2. Explain setup.
3. Explain architecture.
4. Show database schema.
5. Run automated tests.
6. Provide manual acceptance-testing checklist.
7. Fix discovered bugs.
8. Wait for approval.

Only after real-world usage should V2 begin.

---

# VERSION 2 - Natural Language Expense Entry

## Goal

Make expense entry conversational.

Primary interface:

# What did you spend?

Examples:

> 350 lunch

> 800 groceries

> 420 Uber airport

> 1200 dinner split between 4

> yesterday 650 dinner

> 3500 Nike shoes

The parser should attempt to extract:

Amount
Description
Merchant
Category
Date
Time
Split information

---

# 33. Confirmation Layer

Natural language interpretation should NOT silently create uncertain transactions.

Example:

User enters:

> 1200 dinner split 4

Show:

₹1,200

Food & Dining

Dinner

Today, 9:42 PM

Paid: ₹1,200

Your share: ₹300

Recoverable: ₹900

Buttons:

**Save**

**Edit**

If confidence is high enough after product testing, an optional instant-save workflow can later be considered.

---

# 34. Smart Defaults

The system should learn or infer simple patterns.

Example:

"Uber"

Likely category:

Transport

"Zepto"

Likely:

Groceries

"Meghana"

Likely:

Food & Dining

However, the user must always be able to correct classification.

Corrections should eventually improve future suggestions.

---

# VERSION 3 - Better Analytics

Introduce:

## Category Analysis

## Daily Spending

## Weekly Spending

## Monthly Spending

## Yearly Spending

## Custom Date Range

---

# 35. Trends

Examples:

> Food spending increased 23% this month.

> You spent ₹4,200 on Uber.

> Weekend spending is 38% higher than weekdays.

> Your average variable spending increased from ₹540/day to ₹670/day.

> Shopping is your fastest-growing category.

---

# 36. Visualisations

Potential charts:

Category breakdown

Daily spending trend

Monthly spending comparison

Fixed vs variable spending

Cash outflow vs personal spending

Avoid unnecessary dashboard clutter.

---

# VERSION 4 - Advanced Split Expenses

Introduce:

`Person`

Fields:

id
name
optional contact information

Allow exact allocation.

Example:

₹3,000 dinner.

Akii: ₹1,200

Rahul: ₹900

Aryan: ₹900

---

# 37. Other Person Paid

Support:

> Rahul paid ₹2,000 and my share was ₹700.

This means:

Cash outflow from me:

₹0

Personal expense:

₹700

Amount I owe Rahul:

₹700

This requires separating:

payer

from:

beneficiary/share allocation.

---

# 38. Settlement Ledger

Dashboard:

Rahul owes you ₹2,300

Aryan owes you ₹1,450

You owe Rohan ₹800

Net receivable:

₹2,950

Support settlements:

> Rahul paid me ₹2,300.

Settlement must NOT count as income.

---

# VERSION 5 - Excel / CSV Import and Export

This version should support migration from the existing spreadsheet workflow.

## Export

Allow transactions to export to Excel/CSV.

Suggested columns:

Transaction ID

Date

Time

Description

Merchant

Category

Subcategory

Expense Nature

Total Amount

My Share

Recoverable

Payment Method

Split

Participants

Recurring

Notes

Created At

---

# 39. Import

Allow CSV/Excel upload.

Because legacy sheets may use different structures, provide a mapping step.

Example:

Existing column:

`Food`

App interpretation:

Category = Food

Before importing:

Preview transactions.

Detect errors.

Detect possible duplicates.

Show rows that cannot be interpreted.

Require confirmation.

Never blindly insert imported financial data.

---

# VERSION 6 - Accounts & Payment Methods

Create:

`FinancialAccount`

Examples:

HDFC Bank

ICICI Bank

HDFC Credit Card

Cash

Wallet

Fields:

id

name

type

optional opening balance

currency

active status

---

# 40. Account-Based Transactions

Every transaction can reference:

`payment_account_id`

This enables:

> How much did I spend using my HDFC card?

> How much cash did I spend?

> How much left my ICICI account?

---

# VERSION 7 - Income, Refunds & Transfers

Expand transaction types.

## Income

Examples:

Salary

Freelancing

Interest

Bonus

---

## Refund

Refund should preferably reference the original transaction where possible.

Example:

₹3,000 shoes

₹3,000 returned

Net shopping expense:

₹0

---

## Transfer

Example:

HDFC → ICICI

A transfer is NOT:

income

or:

expense.

It only moves money between accounts owned by the user.

This distinction is essential for accurate analytics.

---

# VERSION 8 - Budgeting

Allow:

Monthly overall budget

Category budgets

Example:

Food:

₹10,000/month

Transport:

₹5,000/month

Shopping:

₹8,000/month

Display:

Food

₹7,850 / ₹10,000

78.5% used

Potential warnings:

> You've used 80% of your Food budget with 12 days remaining.

---

# VERSION 9 - Recurring Intelligence

Improve recurring expenses.

Support:

Weekly

Monthly

Quarterly

Yearly

Custom intervals

---

# 41. Upcoming Expenses

Dashboard:

### Upcoming

Rent
₹14,000
Due Sep 10

Netflix
₹649
Due Sep 13

Gym
₹2,000
Due Sep 15

---

# 42. Recurring Cost Analysis

Show:

Monthly fixed burn:

₹24,760

Annualized fixed burn:

₹2,97,120

Largest recurring expenses.

Subscriptions.

Upcoming renewals.

---

# VERSION 10 - Installments / Amortized Costs

This is intentionally NOT V1.

Support purchases whose economic cost is distributed over time.

Examples:

Furniture

Appliances

Long-term rentals

Large purchases

Potential fields:

Total purchase value

Upfront amount

Installment amount

Number of installments

Start date

End date

Payment frequency

This must remain distinct from simple recurring expenses.

---

# VERSION 11 - Smart Financial Assistant

Allow natural-language questions over the user's own data.

Examples:

> How much did I spend this month?

> How much did I spend on food in August?

> How much have I spent on Uber this year?

> Compare August and September.

> What are my five largest purchases?

> How much does Rahul owe me?

> What percentage of my spending is fixed?

> What's my average daily variable spending?

> Where has my spending increased?

The assistant should generate safe analytical queries.

It must never modify financial data merely because a conversational query was interpreted incorrectly.

Writes require explicit intent.

---

# VERSION 12 - Automated Expense Capture

Only consider this after manual expense tracking works extremely well.

Potential sources:

Bank SMS

UPI notifications

Email receipts

Credit-card statements

Bank statements

Payment applications

---

# 43. Transaction Draft System

Automated detection should create:

**Transaction Draft**

rather than automatically recording everything.

Example:

Detected:

₹820 paid to Swiggy

Suggested:

Food & Dining
₹820
Today 8:34 PM

User:

Confirm / Edit / Ignore

---

# 44. Duplicate Detection

Critical once automatic ingestion exists.

If the user manually entered:

> 820 Swiggy

and later SMS ingestion detects:

₹820 Swiggy

the application should recognize a probable duplicate.

Never blindly create both.

---

# VERSION 13 - Broader Personal Finance

Only after the expense product proves useful.

Potential modules:

Credit cards

Bills

Loans

Investments

Savings

Net worth

Financial goals

Cash-flow forecasting

Subscription optimization

Financial health metrics

This is the potential transition from:

**KharCha Expense Tracker**

to:

**Personal Financial Operating System**

---

# 45. Potential Future Home Dashboard

Eventually:

## September

Income
₹X

Fixed Expenses
₹X

Variable Expenses
₹X

Total Personal Spending
₹X

Cash Outflow
₹X

Recoverable
₹X

Savings
₹X

Investments
₹X

Net Cash Flow
₹X

Daily Variable Average
₹X/day

But DO NOT build this full dashboard in V1.

---

# 46. UX Philosophy

The product should have two layers.

## Layer 1 - Extremely Simple

Most interactions:

> 250 lunch

> 80 coffee

> 700 Uber

Done.

---

## Layer 2 - Advanced

Available when needed:

Merchant

Account

Split

Notes

Custom category

Past date

Recurring rules

People

Attachments

etc.

Complexity should be available without being forced onto every transaction.

---

# 47. Mobile-First Design

Although the initial implementation may be a responsive web application, expense entry is fundamentally a mobile activity.

Therefore:

Design mobile-first.

Important actions must be reachable comfortably.

Primary `+ Add Expense` action should be obvious.

Expense entry should require minimal scrolling.

Desktop should remain excellent for analytics and historical review.

---

# 48. Search

Eventually support searching:

"Uber"

"Meghana"

"August"

"₹500"

"Food"

"Rahul"

Search should operate across:

description

merchant

category

notes

people

---

# 49. Data Integrity Rules

Financial data requires stricter handling than a normal CRUD demo.

## Money

Never use JavaScript floating-point arithmetic directly for currency calculations.

Preferred approaches:

Store minor units as integers.

Example:

₹333.33 → `33333 paise`

OR use a precise database decimal representation with careful application handling.

Choose one strategy and document it.

---

## Server Authority

Frontend calculations are for display only.

Backend must validate:

total amount

my share

split calculation

recoverable amount

---

## Validation

Reject:

negative expense amounts unless explicitly supported by transaction type

zero-value expenses unless intentionally allowed

invalid participant counts

my_share > total_amount for a transaction paid entirely by the user

invalid dates

invalid recurring frequencies

---

# 50. Timezone Handling

Store timestamps consistently.

The application should understand the user's local timezone.

If user records:

> dinner now

the transaction should use the user's current local date/time.

Do not accidentally classify late-night Indian transactions into the previous/next day because the server uses UTC.

---

# 51. Recurring Job Reliability

Recurring generation must be:

**Idempotent**

Each recurring rule + occurrence should have a uniqueness mechanism.

Example:

`recurring_expense_id + occurrence_date`

must not produce duplicates.

---

# 52. Auditability

At minimum preserve:

created_at

updated_at

For later versions consider:

change history

import source

automated detection source

AI-generated classification

This becomes important when debugging incorrect financial data.

---

# 53. Suggested Technical Stack

This is a recommendation, not an absolute requirement.

## Frontend

Next.js

TypeScript

Tailwind CSS

---

## Backend

Node.js

TypeScript

REST API

A Next.js full-stack architecture is also acceptable for the initial product if it significantly reduces complexity.

Do not split frontend/backend merely for architectural aesthetics.

---

## Database

PostgreSQL

---

## ORM

Prisma

or

Drizzle

Codex should justify its choice.

---

## Validation

Zod

---

## Testing

Unit tests

Integration tests

Critical financial calculations must have automated tests.

---

# 54. Architecture Philosophy

Start with a:

# Modular Monolith

Do NOT introduce:

Microservices

Kafka

Kubernetes

Distributed systems

Multiple databases

Complex event architecture

unless a future requirement genuinely demands them.

This product does not initially need that complexity.

---

# 55. Suggested Domain Modules

Potential structure:

`transactions`

`recurring-expenses`

`categories`

`analytics`

Later:

`people`

`settlements`

`accounts`

`budgets`

`imports`

`assistant`

Keep domain logic separate from UI logic.

---

# 56. Important Business Logic Layer

Financial calculations should NOT be scattered across React components.

Examples:

calculateMyShare()

calculateRecoverable()

calculateMonthlySpending()

generateRecurringTransaction()

calculateDailyVariableAverage()

should live in dedicated domain/service logic.

This makes them independently testable.

---

# 57. Security

Even though V1 is personal:

Do not expose database credentials.

Use environment variables.

Validate requests.

Sanitize inputs where appropriate.

Do not expose stack traces in production.

Do not commit secrets.

When authentication is introduced, financial data must be scoped strictly to the authenticated user.

---

# 58. Privacy

Financial information is sensitive.

Long-term architecture should assume:

Users expect their financial records to remain private.

Do not use personal financial data for unrelated purposes.

Do not expose one user's financial data to another user.

If AI providers are introduced later, document what financial data is transmitted externally.

---

# 59. Performance

Do not prematurely optimize.

However:

Dashboard queries should not load every transaction into the frontend and calculate everything client-side.

Use database aggregation/backend calculations where appropriate.

Indexes should eventually cover commonly queried fields such as:

user_id

transaction_date

category_id

recurring_expense_id

---

# 60. Observability

V1 only needs basic:

structured logs

error logging

development debugging

Later versions may add:

metrics

tracing

error monitoring

Do not overbuild observability initially.

---

# 61. Product Metrics

Once used regularly, measure:

Expenses recorded per day

Average time to record expense

Percentage of days with at least one recorded expense

Percentage of transactions edited

Percentage of AI classifications corrected

Recurring vs variable spending

Number of missed days

These metrics can tell us whether tracking is actually frictionless.

---

# 62. Most Important Product Metric

Initially:

# Expense Capture Rate

If the user spends money 10 times but records only 6 transactions, the analytics become unreliable.

Therefore the product's biggest enemy is:

**friction**

not lack of features.

---

# 63. Development Philosophy

Build vertically.

Do not spend weeks creating infrastructure before anything works.

Each milestone should produce something testable.

---

# 64. V1 Development Milestones

## Milestone 1 - Foundation

Create project.

Configure:

TypeScript

database

ORM

environment variables

basic application structure

health check

No fancy UI.

STOP.

Verify application starts correctly.

---

## Milestone 2 - Database

Implement:

Category

Transaction

RecurringExpense

Database migrations.

Seed default categories.

Add database-level constraints where appropriate.

STOP.

Inspect schema manually.

---

## Milestone 3 - Transaction API

Implement:

Create transaction

Read transactions

Update transaction

Delete transaction

Implement:

split calculation

recoverable calculation

date/time handling

validation

Add automated tests.

STOP.

Test APIs.

---

## Milestone 4 - Basic Expense UI

Build:

Add Expense

Transaction History

Edit Expense

Delete Expense

Mobile-first.

STOP.

Use application manually.

---

## Milestone 5 - Recurring Expenses

Build:

Create recurring expense

List recurring expenses

Edit recurring expense

Deactivate recurring expense

Generate recurring transaction

Prevent duplicate generation

Add tests.

STOP.

Test manually.

---

## Milestone 6 - Dashboard

Build:

Current month variable spending

Fixed/recurring spending

Total effective spending

Total amount paid

Recoverable amount

Daily variable average

Category breakdown

Month navigation

STOP.

Verify calculations manually against known sample data.

---

## Milestone 7 - Polish

Improve:

loading states

empty states

validation messages

mobile layout

error handling

confirmation dialogs

basic accessibility

Do NOT add V2 functionality.

STOP.

---

# 65. Codex Operating Rules

Codex must follow these rules throughout development.

### Rule 1

Read this PRD before implementing features.

### Rule 2

Implement only the currently authorized version/milestone.

### Rule 3

Do not jump ahead because a future feature seems easy.

### Rule 4

Before substantial implementation, explain:

Architecture

Schema

Endpoints

Folder structure

Technical decisions

### Rule 5

Do not overengineer.

### Rule 6

Financial calculations require tests.

### Rule 7

Never trust frontend financial calculations.

### Rule 8

Use migrations for database changes.

### Rule 9

Never silently change the schema without explaining why.

### Rule 10

When something in this PRD is ambiguous:

Ask or present the trade-off.

Do not invent major product requirements.

### Rule 11

After each milestone:

Explain what changed.

List important files.

Run tests.

Give manual testing instructions.

Report known limitations.

STOP.

Wait for approval.

### Rule 12

Do not automatically begin the next milestone.

---

# 66. FIRST TASK FOR CODEX

We are building:

# VERSION 1

But do NOT begin writing the complete application yet.

Your first task is ONLY to produce the technical design.

Please:

1. Read the complete PRD.

2. Restate your understanding of V1.

3. Propose the architecture.

4. he architecture must use a separate Node.js + TypeScript backend and frontend. Propose the appropriate Node.js backend framework and explain your choice.

5. Propose the repository/folder structure.

6. Design the database schema for:

   * Transaction
   * Category
   * RecurringExpense

7. Explain how monetary values will be represented safely.

8. Explain how split calculations will work.

9. Explain how recurring transaction generation will remain idempotent.

10. Explain timezone handling.

11. Define V1 API endpoints/server actions.

12. Identify important edge cases.

13. Define the automated testing strategy.

14. Break implementation into the milestones defined in this PRD, modifying them only if there is a strong technical reason.

15. Identify any architectural decision in V1 that could make future versions unnecessarily difficult.

16. Do NOT write implementation code yet.

17. STOP and wait for my approval of the technical design.

The objective is to agree on the foundation before implementation begins.

Backend Requirement: The backend must be implemented as a separate Node.js + TypeScript application. Do not use Next.js API routes or Server Actions as the primary backend. The frontend and backend should communicate through a REST API. Use PostgreSQL as the database. Codex may recommend an appropriate Node.js framework such as Express, Fastify, or NestJS, but must explain the choice before implementation.