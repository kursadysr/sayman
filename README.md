# Sayman - Multi-Tenant Finance & Bookkeeping App

A mobile-first SaaS application for managing personal finances and business bookkeeping with proper accrual-basis accounting.

## Features

### Core
- **Multi-Tenant Architecture** - Manage multiple workspaces (Personal, Retail, Service)
- **Tenant Switching** - Seamlessly switch between organizations

### Expenses (Bills)
- **Itemized Entry** - Always enter items with qty, price, tax
- **Vendor Optional** - Quick expenses without vendor, or track by vendor
- **Pay Now or Later** - Toggle to pay immediately or create accounts payable
- **Item Price Tracking** - Auto-suggest items with last known prices per vendor

### Income (Invoices)
- **Customer Invoicing** - Create professional invoices
- **PDF Generation** - Download branded PDF invoices
- **Pay Now or Later** - Toggle to receive payment immediately or track AR

### Contacts
- **Vendors & Customers** - Manage all business contacts
- **Balance Tracking** - See what you owe each vendor
- **Transaction History** - View all bills and payments per contact

### Items
- **Price History** - Track item prices over time per vendor
- **Auto-Complete** - Suggestions when entering bills
- **Edit & Manage** - Rename items, view purchase history

### General Ledger
- **Read-Only View** - All cash movements from bill/invoice payments
- **Totals** - See total received vs paid

### Dashboard
- **Cash Balance** - Total in all accounts
- **Accounts Payable** - What you owe vendors
- **Monthly Expenses** - Bills this month (accrual)
- **Monthly Payments** - Cash paid out

## Tech Stack

- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Shadcn/UI
- **Backend:** Supabase (PostgreSQL, Auth, Row Level Security)
- **State:** Zustand (tenant context)
- **Forms:** React Hook Form + Zod
- **PDF:** @react-pdf/renderer

## Getting Started

### 1. Setup Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in SQL Editor
3. Copy project URL and anon key from Settings → API

### 2. Configure Environment

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
/src
  /app
    /(auth)              # Login, Signup
    /(dashboard)         # Protected pages
      /dashboard         # Overview
      /transactions      # General Ledger
      /bills             # Expenses/AP
      /invoices          # Income/AR
      /contacts          # Vendors & Customers
      /items             # Item management
      /accounts          # Bank accounts
  /components
    /ui                  # Shadcn components
    /layout              # App shell, navigation
    /shared              # TenantSwitcher
  /features
    /bills               # Bill drawers & dialogs
    /invoicing           # Invoice dialog & PDF
    /contacts            # Contact management
  /lib
    /supabase            # Client, types
    /store               # Zustand stores
```

## Database Tables

| Table | Purpose |
|-------|---------|
| profiles | User profiles |
| tenants | Workspaces |
| tenant_users | User-tenant roles |
| accounts | Bank/cash/credit |
| contacts | Vendors & customers (with balance) |
| items | Products/services per vendor |
| bills | Expenses/AP |
| bill_lines | Bill line items |
| invoices | Income/AR |
| invoice_lines | Invoice line items |
| transactions | Cash flow (payments) |

## Accounting Flow

```
Bill Created (unpaid)     → Expense recorded, AP increases
Bill Paid                 → AP decreases, Cash decreases

Invoice Created (unpaid)  → Revenue recorded, AR increases  
Invoice Paid              → AR decreases, Cash increases
```

## License

MIT
