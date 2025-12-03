'use client';

import { useState, useEffect } from 'react';
import { Receipt, CreditCard, Pencil, Clock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/hooks/use-tenant';
import { useRole } from '@/hooks/use-role';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { EditContactDialog } from './edit-contact-dialog';
import { AddTimesheetDrawer } from './add-timesheet-drawer';
import type { Contact, Bill, Transaction, Timesheet } from '@/lib/supabase/types';

interface LedgerEntry {
  id: string;
  date: string;
  type: 'bill' | 'payment' | 'timesheet';
  description: string;
  reference: string | null;
  amount: number;
  balance_after: number;
  hours?: number;
  minutes?: number;
  categoryName?: string;
}

interface ContactDetailsDrawerProps {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContactUpdate?: () => void;
}

export function ContactDetailsDrawer({ contact, open, onOpenChange, onContactUpdate }: ContactDetailsDrawerProps) {
  const { tenant } = useTenant();
  const { canWrite } = useRole();
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [timesheetDrawerOpen, setTimesheetDrawerOpen] = useState(false);

  const loadLedger = async () => {
    if (!contact || !tenant) return;
    
    setLoading(true);
    const supabase = createClient();

    const isEmployee = contact.type === 'employee';
    const entries: LedgerEntry[] = [];

    if (isEmployee) {
      // Get timesheets for employee with category
      const { data: timesheetsData } = await supabase
        .from('timesheets')
        .select('*, category:timesheet_categories(name)')
        .eq('employee_id', contact.id)
        .order('date', { ascending: true });

      const timesheets = (timesheetsData || []) as (Timesheet & { category?: { name: string } | null })[];

      // Get payments linked to timesheets
      const timesheetIds = timesheets.map((t) => t.id);
      let payments: Transaction[] = [];

      if (timesheetIds.length > 0) {
        const { data: paymentsData } = await supabase
          .from('transactions')
          .select('id, date, amount, description, timesheet_id, created_at')
          .in('timesheet_id', timesheetIds)
          .order('date', { ascending: true });

        payments = (paymentsData || []) as Transaction[];
      }

      // Add timesheets
      timesheets.forEach((ts) => {
        const timeStr = ts.hours > 0 || ts.minutes > 0 
          ? `${ts.hours}h ${ts.minutes || 0}m` 
          : '';
        entries.push({
          id: `timesheet-${ts.id}`,
          date: ts.date,
          type: 'timesheet',
          description: ts.description || '',
          reference: null,
          amount: ts.total_amount,
          balance_after: 0,
          hours: ts.hours,
          minutes: ts.minutes,
          categoryName: ts.category?.name,
        });
      });

      // Add payments
      payments.forEach((payment) => {
        entries.push({
          id: `payment-${payment.id}`,
          date: payment.date,
          type: 'payment',
          description: payment.description || 'Payment',
          reference: null,
          amount: Math.abs(payment.amount),
          balance_after: 0,
        });
      });
    } else {
      // Get bills for vendor/customer
      const { data: billsData } = await supabase
        .from('bills')
        .select('id, bill_number, issue_date, total_amount, description, created_at')
        .eq('vendor_id', contact.id)
        .order('issue_date', { ascending: true });

      const bills = (billsData || []) as Bill[];

      // Get payments linked to bills
      const billIds = bills.map((b) => b.id);
      let payments: Transaction[] = [];

      if (billIds.length > 0) {
        const { data: paymentsData } = await supabase
          .from('transactions')
          .select('id, date, amount, description, bill_id, created_at')
          .in('bill_id', billIds)
          .order('date', { ascending: true });

        payments = (paymentsData || []) as Transaction[];
      }

      // Add bills
      bills.forEach((bill) => {
        entries.push({
          id: `bill-${bill.id}`,
          date: bill.issue_date,
          type: 'bill',
          description: bill.description || 'Bill recorded',
          reference: bill.bill_number,
          amount: bill.total_amount,
          balance_after: 0,
        });
      });

      // Add payments
      payments.forEach((payment) => {
        entries.push({
          id: `payment-${payment.id}`,
          date: payment.date,
          type: 'payment',
          description: payment.description || 'Payment',
          reference: null,
          amount: Math.abs(payment.amount),
          balance_after: 0,
        });
      });
    }

    // Sort by date
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance
    let runningBalance = 0;
    entries.forEach((entry) => {
      if (entry.type === 'bill' || entry.type === 'timesheet') {
        runningBalance += entry.amount;
      } else {
        runningBalance -= entry.amount;
      }
      entry.balance_after = runningBalance;
    });

    // Reverse to show newest first
    setLedger(entries.reverse());
    setLoading(false);
  };

  useEffect(() => {
    if (!contact || !tenant || !open) return;
    loadLedger();
  }, [contact, tenant, open]);

  if (!contact) return null;

  const isEmployee = contact.type === 'employee';
  const typeLabel = contact.type === 'vendor' ? 'Vendor' : contact.type === 'customer' ? 'Customer' : 'Employee';
  const balanceLabel = contact.balance > 0 
    ? (isEmployee ? 'Owed' : 'Balance') 
    : 'Credit';

  return (
    <>
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-slate-800 border-slate-700 max-h-[90vh]">
        <div className="overflow-y-auto">
          <DrawerHeader>
            <div className="flex items-center justify-between">
              <div>
                <DrawerTitle className="text-white">{contact.name}</DrawerTitle>
                <DrawerDescription className="text-slate-400">
                  {typeLabel} Account
                </DrawerDescription>
              </div>
              <div className="flex gap-2">
                {canWrite && isEmployee && (
                  <Button
                    size="sm"
                    onClick={() => setTimesheetDrawerOpen(true)}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Hours
                  </Button>
                )}
                {canWrite && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditDialogOpen(true)}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
            </div>
          </DrawerHeader>

          <div className="px-4 pb-6 space-y-6">
            {/* Balance Card */}
            <div className="p-4 bg-slate-700/30 rounded-lg">
              <div className="text-sm text-slate-400 mb-1">{balanceLabel}</div>
              <div
                className={`text-3xl font-bold ${
                  contact.balance > 0 ? 'text-red-400' : contact.balance < 0 ? 'text-green-400' : 'text-white'
                }`}
              >
                {formatCurrency(Math.abs(contact.balance), tenant?.currency || 'USD')}
              </div>
              {contact.balance === 0 && (
                <div className="text-sm text-slate-400 mt-1">Account is settled</div>
              )}
            </div>

            {/* Contact Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              {isEmployee && contact.hourly_rate > 0 && (
                <div>
                  <div className="text-slate-400">Hourly Rate</div>
                  <div className="text-white">{formatCurrency(contact.hourly_rate, tenant?.currency || 'USD')}/hr</div>
                </div>
              )}
              {contact.email && (
                <div>
                  <div className="text-slate-400">Email</div>
                  <div className="text-white">{contact.email}</div>
                </div>
              )}
              {contact.phone && (
                <div>
                  <div className="text-slate-400">Phone</div>
                  <div className="text-white">{contact.phone}</div>
                </div>
              )}
              {contact.tax_id && (
                <div>
                  <div className="text-slate-400">Tax ID</div>
                  <div className="text-white">{contact.tax_id}</div>
                </div>
              )}
              {contact.address && (
                <div className="col-span-2">
                  <div className="text-slate-400">Address</div>
                  <div className="text-white">{contact.address}</div>
                </div>
              )}
            </div>

            {/* Transaction History */}
            <div>
              <h3 className="text-lg font-medium text-white mb-3">
                {isEmployee ? 'Work & Payment History' : 'Transaction History'}
              </h3>
              {loading ? (
                <div className="text-center text-slate-400 py-8">Loading...</div>
              ) : ledger.length === 0 ? (
                <div className="text-center text-slate-400 py-8">
                  {isEmployee ? (
                    <>
                      <Clock className="h-12 w-12 mx-auto mb-4 text-slate-600" />
                      <p>No work hours recorded yet</p>
                    </>
                  ) : (
                    <>
                      <Receipt className="h-12 w-12 mx-auto mb-4 text-slate-600" />
                      <p>No transactions yet</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {ledger.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3 bg-slate-700/30 rounded-lg flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-full ${
                            entry.type === 'bill' || entry.type === 'timesheet'
                              ? 'bg-red-500/10 text-red-400'
                              : 'bg-green-500/10 text-green-400'
                          }`}
                        >
                          {entry.type === 'bill' ? (
                            <Receipt className="h-4 w-4" />
                          ) : entry.type === 'timesheet' ? (
                            <Clock className="h-4 w-4" />
                          ) : (
                            <CreditCard className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">
                              {entry.type === 'bill' ? 'Bill' : entry.type === 'timesheet' ? (entry.categoryName || 'Work') : 'Payment'}
                            </span>
                            {entry.reference && (
                              <Badge variant="secondary" className="bg-slate-700 text-slate-300 text-xs">
                                #{entry.reference}
                              </Badge>
                            )}
                            {(entry.hours !== undefined && entry.hours > 0) || (entry.minutes !== undefined && entry.minutes > 0) ? (
                              <Badge variant="secondary" className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">
                                {entry.hours || 0}h {entry.minutes || 0}m
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-sm text-slate-400">
                            {formatDate(entry.date)}
                            {entry.description && ` • ${entry.description}`}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-medium ${
                            entry.type === 'bill' || entry.type === 'timesheet' ? 'text-red-400' : 'text-green-400'
                          }`}
                        >
                          {entry.type === 'bill' || entry.type === 'timesheet' ? '+' : '-'}
                          {formatCurrency(entry.amount, tenant?.currency || 'USD')}
                        </div>
                        <div className="text-xs text-slate-400">
                          Balance: {formatCurrency(entry.balance_after, tenant?.currency || 'USD')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>

    <EditContactDialog
      contact={contact}
      open={editDialogOpen}
      onOpenChange={setEditDialogOpen}
      onSuccess={() => {
        onContactUpdate?.();
        onOpenChange(false);
      }}
    />

    <AddTimesheetDrawer
      open={timesheetDrawerOpen}
      onOpenChange={setTimesheetDrawerOpen}
      defaultEmployeeId={contact.id}
      onSuccess={() => {
        loadLedger();
        onContactUpdate?.();
      }}
    />
    </>
  );
}

