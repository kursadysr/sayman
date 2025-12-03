'use client';

import { useEffect, useState, useCallback } from 'react';
import { ArrowUpCircle, ArrowDownCircle, Receipt } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';

interface LedgerEntry {
  id: string;
  date: string;
  type: 'bill_payment' | 'invoice_payment' | 'adjustment';
  description: string;
  amount: number;
  accountName?: string;
  contactName?: string;
  reference?: string;
}

export default function TransactionsPage() {
  const { tenant } = useTenant();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');

  const loadLedger = useCallback(async () => {
    if (!tenant) return;

    setLoading(true);
    const supabase = createClient();

    const { data: transactions } = await supabase
      .from('transactions')
      .select(`
        *,
        account:accounts(name),
        bill:bills(bill_number, vendor:contacts(name))
      `)
      .eq('tenant_id', tenant.id)
      .order('date', { ascending: false });

    const ledgerEntries: LedgerEntry[] = (transactions || []).map((tx: any) => ({
      id: tx.id,
      date: tx.date,
      type: tx.bill_id ? 'bill_payment' : tx.amount > 0 ? 'invoice_payment' : 'adjustment',
      description: tx.description || (tx.bill?.vendor?.name ? `Payment to ${tx.bill.vendor.name}` : 'Transaction'),
      amount: tx.amount,
      accountName: tx.account?.name,
      contactName: tx.bill?.vendor?.name,
      reference: tx.bill?.bill_number,
    }));

    setEntries(ledgerEntries);
    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const filteredEntries = entries.filter((entry) => {
    if (filter === 'all') return true;
    if (filter === 'income') return entry.amount > 0;
    if (filter === 'expense') return entry.amount < 0;
    return true;
  });

  const totals = {
    income: entries.filter(e => e.amount > 0).reduce((sum, e) => sum + e.amount, 0),
    expense: entries.filter(e => e.amount < 0).reduce((sum, e) => sum + Math.abs(e.amount), 0),
  };

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-slate-400">Select a workspace to continue</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 pb-24 lg:pb-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Cash Ledger</h1>
        <p className="text-slate-400">All cash movements from bill payments and income</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <ArrowUpCircle className="h-4 w-4 text-green-400" />
              Total Received
            </div>
            <div className="text-xl font-bold text-green-400">
              {formatCurrency(totals.income, tenant.currency)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <ArrowDownCircle className="h-4 w-4 text-red-400" />
              Total Paid
            </div>
            <div className="text-xl font-bold text-red-400">
              {formatCurrency(totals.expense, tenant.currency)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'income' | 'expense')} className="mb-6">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="all" className="data-[state=active]:bg-slate-700">
            All
          </TabsTrigger>
          <TabsTrigger value="income" className="data-[state=active]:bg-slate-700">
            Received
          </TabsTrigger>
          <TabsTrigger value="expense" className="data-[state=active]:bg-slate-700">
            Paid
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No transactions yet.</p>
              <p className="text-sm mt-2">
                Transactions appear here when you record bill payments.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2 rounded-full ${
                        entry.amount >= 0 ? 'bg-green-500/10' : 'bg-cyan-500/10'
                      }`}
                    >
                      {entry.amount >= 0 ? (
                        <ArrowUpCircle className="h-5 w-5 text-green-400" />
                      ) : (
                        <Receipt className="h-5 w-5 text-cyan-400" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {entry.description}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <span>{formatDate(entry.date)}</span>
                        {entry.accountName && (
                          <>
                            <span>•</span>
                            <span>{entry.accountName}</span>
                          </>
                        )}
                        {entry.reference && (
                          <>
                            <span>•</span>
                            <Badge variant="secondary" className="bg-slate-700 text-slate-300 text-xs">
                              {entry.reference}
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`text-lg font-bold ${
                      entry.amount >= 0 ? 'text-green-400' : 'text-cyan-400'
                    }`}
                  >
                    {entry.amount >= 0 ? '+' : ''}
                    {formatCurrency(entry.amount, tenant.currency)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-slate-500 text-sm mt-4">
        To add expenses, go to Bills. To add income, go to Invoices.
      </p>
    </div>
  );
}
