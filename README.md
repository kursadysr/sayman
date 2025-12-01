# Sayman - Multi-Tenant Finance & Bookkeeping App

A mobile-first SaaS application for managing personal finances and business bookkeeping with multi-tenant support.

## Features

- **Multi-Tenant Architecture** - Manage multiple organizations (Personal, Retail, Service) with a single login
- **Tenant Switching** - Seamlessly switch between workspaces
- **Transactions** - Track income and expenses with category support
- **Bills (Accounts Payable)** - Create bills and record partial payments
- **Invoicing** - Create professional invoices with PDF generation
- **Contacts** - Manage vendors and customers
- **Dashboard** - Overview of finances with summary cards

## Tech Stack

- **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind CSS, Shadcn/UI
- **Backend:** Supabase (PostgreSQL, Auth, Storage)
- **State Management:** Zustand (global UI state), TanStack Query (server state)
- **Forms:** React Hook Form + Zod
- **PDF Generation:** @react-pdf/renderer

## Getting Started

### 1. Setup Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the schema from `supabase/schema.sql`
3. Copy your project URL and anon key from Settings → API

### 2. Configure Environment

Create a `.env.local` file in the project root:

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
    /(auth)              # Login, Signup pages
    /(dashboard)         # Protected dashboard pages
  /components
    /ui                  # Shadcn UI components
    /layout              # App shell, navigation
    /shared              # TenantSwitcher
  /features
    /auth                # Auth actions
    /transactions        # Add transaction drawer
    /bills               # Bill payment dialog
    /contacts            # Contact management
    /invoicing           # Invoice builder, PDF
  /lib
    /supabase            # Client, server, types
    /store               # Zustand stores
    /utils               # Formatters
  /hooks                 # Custom hooks
```

## Database Schema

The app uses a multi-tenant database with Row Level Security (RLS):

- **profiles** - User profiles
- **tenants** - Organizations/workspaces
- **tenant_users** - User-tenant relationships with roles
- **accounts** - Bank/cash/credit accounts
- **categories** - Income/expense categories
- **contacts** - Vendors and customers
- **bills** - Accounts payable
- **invoices** - Accounts receivable
- **invoice_lines** - Invoice line items
- **transactions** - Cash flow records

## License

MIT
