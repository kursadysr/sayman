This is the **Final Master Product Requirements Document (PRD)**.

**How to use this with Cursor AI:**
1.  Create a file named `PLAN.md` in the root of your project.
2.  Paste the content below into that file.
3.  In your Cursor Chat, always reference this file (e.g., *"Read @PLAN.md and help me implement the Database Schema"*).

***

# Project Blueprint: Multi-Tenant Finance & Bookkeeping App

## 1. Executive Summary
**Project Name:** Sayman
**Type:** Mobile-First Web Application (SaaS Architecture).
**Core Goal:** A unified finance platform for a "Super User" who manages distinct entities (Personal Finances, Retail Business, Freelance Agency) via a single login, while supporting "Staff" users with restricted access.
**Key Differentiator:** Seamlessly blends simple "Expense Tracking" (for personal use) with complex "Accounts Payable/Receivable" (for business use) using a hidden double-entry system.

## 2. Technical Stack
*   **Frontend:** React (Next.js) + TypeScript (Strict Mode).
*   **Styling:** Tailwind CSS + **Shadcn/UI** (Mobile-first components).
*   **Backend:** **Supabase** (PostgreSQL, Auth, Storage, Edge Functions).
*   **State Management:**
    *   **Zustand:** Global UI State (specifically for `activeTenantId`).
    *   **TanStack Query:** Server state and caching.
*   **Forms:** React Hook Form + Zod.
*   **PDF Generation:** `@react-pdf/renderer` (Client-side).
*   **Dates:** `date-fns`.

---

## 3. Architecture: The Tenant System (SaaS Ready)
**Critically Important:** The application is built on a "Multi-Tenant" architecture. Data isolation is enforced by Row Level Security (RLS).

### A. The "Active Tenant" Logic
*   **Global Context:** The app must always know which "Context" the user is in (e.g., "Personal" vs "Pizzeria").
*   **State:** A Zustand store (`useTenantStore`) holds the `currentTenant` object. This persists to `localStorage`.
*   **UI:** A "Tenant Switcher" component in the top navigation allows switching. It lists only tenants present in the `tenant_users` table for the current user.

### B. Security Rules (RLS)
Every table (except `profiles`) has a `tenant_id` column.
**The SQL Policy:**
```sql
CREATE POLICY "Tenant Isolation" ON [table_name]
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
  )
);
```

### C. Onboarding & Creation
*   **Sign Up:** Triggers a database function to create a default "Personal Workspace" tenant.
*   **Add Organization:** A "Create Tenant" modal allows the user to spin up a new entity.
    *   **Input:** Name, Type (Personal/Retail/Service), Currency.
    *   **Action:** Creates `tenant`, links user as `owner`, seeds default `categories` based on Type.

---

## 4. Database Schema
*Use this exact structure for Supabase.*

### Identity & Access
1.  **`profiles`**: `id` (uuid, PK), `email`, `full_name`, `avatar_url`.
2.  **`tenants`**:
    *   `id` (uuid, PK)
    *   `name` (text)
    *   `type` (enum: 'personal', 'retail', 'service')
    *   `currency` (text)
    *   `logo_url` (text)
    *   `address_details` (jsonb: { address, tax_id, footer_note })
3.  **`tenant_users`**:
    *   `tenant_id` (fk), `user_id` (fk)
    *   `role` (enum: 'owner', 'manager', 'viewer')

### The Ledger (Mini-ERP)
4.  **`accounts`**:
    *   `id`, `tenant_id`
    *   `name` (e.g., "Chase Checking")
    *   `type` (enum: 'bank', 'cash', 'credit')
    *   `balance` (numeric, default 0)
5.  **`categories`**:
    *   `id`, `tenant_id`
    *   `name` (e.g., "Flour", "Servers")
    *   `type` (enum: 'income', 'expense', 'transfer', 'cogs')
6.  **`contacts`** (Vendors & Customers):
    *   `id`, `tenant_id`
    *   `type` (enum: 'vendor', 'customer')
    *   `name` (Company Name)
    *   `email`, `phone`, `tax_id`, `address`

### Documents & Transactions
7.  **`bills`** (Accounts Payable - Expenses):
    *   `id`, `tenant_id`
    *   `vendor_id` (fk -> contacts)
    *   `bill_number` (text)
    *   `status` (enum: 'unpaid', 'partial', 'paid')
    *   `due_date`, `issue_date`
    *   `total_amount`
    *   `attachment_url` (Supabase Storage)
8.  **`invoices`** (Accounts Receivable - Income):
    *   `id`, `tenant_id`
    *   `customer_id` (fk -> contacts)
    *   `invoice_number` (text)
    *   `status` (enum: 'draft', 'sent', 'partial', 'paid')
    *   `due_date`, `issue_date`
    *   `total_amount`
    *   `layout_type` (enum: 'service', 'product')
9.  **`invoice_lines`**:
    *   `id`, `invoice_id`
    *   `description`, `quantity`, `unit_price`, `tax_rate`, `total`
10. **`transactions`** (Actual Cash Flow):
    *   `id`, `tenant_id`, `account_id`, `category_id`
    *   `date`, `amount` (Signed: - for expense, + for income)
    *   `description`
    *   `status` (enum: 'cleared', 'pending')
    *   `bill_id` (fk, nullable) -> Links payment to a Bill
    *   `invoice_id` (fk, nullable) -> Links payment to an Invoice

---

## 5. Key Feature Workflows

### A. The "Add" Experience (Mobile)
**Goal:** A single "Add" button handles immediate expenses AND future bills.
1.  User opens **Add Drawer**.
2.  Fills: Amount ($500), Payee (Roma Foods), Category (Inventory).
3.  **The Toggle: "Paid Now?"**
    *   **Case 1: YES (Direct Expense)**
        *   User selects `Account` (Cash).
        *   *Result:* Insert 1 row into `transactions`.
    *   **Case 2: NO (Bill/Payable)**
        *   User selects `Due Date`.
        *   *Result:* Insert 1 row into `bills` (Status: Unpaid). No money moves yet.

### B. Accounts Payable (Partial Payments)
1.  User views **Bills List** (Filtered by Due Date).
2.  Taps a $1,000 Bill -> Selects **"Record Payment"**.
3.  Enters $500 (Partial) via "Check".
4.  **System:**
    *   Creates a `transaction` (-$500).
    *   Links it to `bill_id`.
    *   Updates `bill.status` to 'partial'.
    *   *Calculation:* App displays "Remaining Due: $500".

### C. Invoicing & PDF (Freelance)
1.  User creates Invoice. Selects **Layout: Service** (hides Qty).
2.  Adds Line Item: "API Development", Price: $5000.
3.  **Action:** "Download PDF".
    *   Frontend fetches `tenant.logo_url`.
    *   `@react-pdf` renders the document client-side.
    *   Includes Footer: "Please pay to [Tenant Address Details]".

### D. Transfers (Owner's Draw)
1.  Source: **Pizza Checking** (Tenant A).
2.  Dest: **Personal Checking** (Tenant B).
3.  **System:** Detects different `tenant_id`.
    *   Transaction 1 (Tenant A): Expense "Owner Draw".
    *   Transaction 2 (Tenant B): Income "Owner Equity".

---

## 6. Directory Structure (Cursor Context)

```text
/src
  /components
    /ui                 # Shadcn primitives (Button, Drawer, Form, etc.)
    /layout             # AppShell, MobileNav, Sidebar
    /shared             # TenantSwitcher.tsx (Critical Component)
  /features
    /auth               # Login, SignUp
    /dashboard          # StatCards, Charts (Recharts)
    /transactions       # TransactionList, AddTransactionDrawer
    /bills              # BillList, BillPaymentDialog
    /invoicing          # InvoiceBuilder, InvoicePDF
    /contacts           # ContactManagement
  /lib
    /store              # useTenantStore (Zustand)
    /supabase           # Client & Types
    /utils              # Formatters
  /hooks
    useTenant.ts        # Helper to get current tenant ID
```

---

## 7. Implementation Plan (Prompts for Cursor)

**Phase 1: Foundation (DB & Auth)**
> "Initialize a React/Vite app with Tailwind and Shadcn. Setup Supabase Client. Generate the SQL migrations for the `tenants`, `users`, and `tenant_users` tables. Create a 'Trigger' that creates a 'Personal' tenant for every new user signup."

**Phase 2: Tenant System (The Core)**
> "Implement the `useTenantStore` using Zustand. Build the `TenantSwitcher` component that queries `tenant_users` to list available workspaces. Apply RLS policies to ensure I can't see tenants I don't own."

**Phase 3: Transactions & Bills (Data Entry)**
> "Build the 'Add Transaction' Drawer. It needs a 'Paid Now' toggle. If Paid=True, save to `transactions`. If Paid=False, save to `bills`. Implement the Supabase hooks for this."

**Phase 4: Invoicing (PDFs)**
> "Create the Invoice Form using `useFieldArray` for line items. Then, implement `InvoicePDF.tsx` using `@react-pdf/renderer` to generate a professional PDF based on the current Tenant's logo and address."