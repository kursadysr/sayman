'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Wallet, Receipt, CreditCard, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { Bill, Transaction, Account, Contact } from '@/lib/supabase/types';

interface DashboardStats {
  cashBalance: number;
  accountsPayable: number;
  expensesThisMonth: number;
  paymentsThisMonth: number;
  unpaidBillsCount: number;
}

interface RecentActivity {
  id: string;
  type: 'bill' | 'payment';
  date: string;
  description: string;
  amount: number;
  vendorName?: string;
}

export default function DashboardPage() {
  const { tenant } = useTenant();
  const [stats, setStats] = useState<DashboardStats>({
    cashBalance: 0,
    accountsPayable: 0,
    expensesThisMonth: 0,
    paymentsThisMonth: 0,
    unpaidBillsCount: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenant) return;

    const loadDashboardData = async () => {
      setLoading(true);
      const supabase = createClient();

      // Get accounts for cash balance
      const { data: accounts } = await supabase
        .from('accounts')
        .select('*')
        .eq('tenant_id', tenant.id);

      const cashBalance = (accounts as Account[] || []).reduce(
        (sum, acc) => sum + Number(acc.balance),
        0
      );

      // Get vendors for accounts payable total
      const { data: vendors } = await supabase
        .from('contacts')
        .select('balance')
        .eq('tenant_id', tenant.id)
        .eq('type', 'vendor');

      const accountsPayable = (vendors as { balance: number }[] || []).reduce(
        (sum, v) => sum + Math.max(0, Number(v.balance)),
        0
      );

      // Get bills this month (expenses - accrual basis)
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: billsThisMonth } = await supabase
        .from('bills')
        .select('total_amount')
        .eq('tenant_id', tenant.id)
        .gte('issue_date', startOfMonth.toISOString().split('T')[0]);

      const expensesThisMonth = (billsThisMonth || []).reduce(
        (sum, b) => sum + Number(b.total_amount),
        0
      );

      // Get payments this month (cash outflow)
      const { data: paymentsThisMonth } = await supabase
        .from('transactions')
        .select('amount')
        .eq('tenant_id', tenant.id)
        .eq('status', 'cleared')
        .lt('amount', 0)
        .gte('date', startOfMonth.toISOString().split('T')[0]);

      const paymentsTotal = (paymentsThisMonth || []).reduce(
        (sum, t) => sum + Math.abs(Number(t.amount)),
        0
      );

      // Get unpaid bills count
      const { count: unpaidCount } = await supabase
        .from('bills')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .neq('status', 'paid');

      setStats({
        cashBalance,
        accountsPayable,
        expensesThisMonth,
        paymentsThisMonth: paymentsTotal,
        unpaidBillsCount: unpaidCount || 0,
      });

      // Get recent activity (bills and payments)
      const { data: recentBills } = await supabase
        .from('bills')
        .select('id, issue_date, description, bill_number, total_amount, vendor:contacts(name)')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(5);

      const { data: recentPayments } = await supabase
        .from('transactions')
        .select('id, date, description, amount, bill:bills(vendor:contacts(name))')
        .eq('tenant_id', tenant.id)
        .not('bill_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5);

      const activity: RecentActivity[] = [];

      (recentBills || []).forEach((bill: any) => {
        activity.push({
          id: `bill-${bill.id}`,
          type: 'bill',
          date: bill.issue_date,
          description: bill.description || bill.bill_number || 'Bill',
          amount: bill.total_amount,
          vendorName: bill.vendor?.name,
        });
      });

      (recentPayments || []).forEach((payment: any) => {
        activity.push({
          id: `payment-${payment.id}`,
          type: 'payment',
          date: payment.date,
          description: payment.description || 'Payment',
          amount: Math.abs(payment.amount),
          vendorName: payment.bill?.vendor?.name,
        });
      });

      // Sort by date descending
      activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecentActivity(activity.slice(0, 8));

      setLoading(false);
    };

    loadDashboardData();
  }, [tenant]);

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-slate-400">Select a workspace to continue</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 pb-24 lg:pb-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400">{tenant.name} overview</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Cash Balance
            </CardTitle>
            <Wallet className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {loading ? '...' : formatCurrency(stats.cashBalance, tenant.currency)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Available funds</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Accounts Payable
            </CardTitle>
            <Users className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">
              {loading ? '...' : formatCurrency(stats.accountsPayable, tenant.currency)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {stats.unpaidBillsCount} unpaid bill{stats.unpaidBillsCount !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Expenses (This Month)
            </CardTitle>
            <Receipt className="h-4 w-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-400">
              {loading ? '...' : formatCurrency(stats.expensesThisMonth, tenant.currency)}
            </div>
            <p className="text-xs text-slate-500 mt-1">From bills (accrual)</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Payments (This Month)
            </CardTitle>
            <CreditCard className="h-4 w-4 text-cyan-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-400">
              {loading ? '...' : formatCurrency(stats.paymentsThisMonth, tenant.currency)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Cash paid out</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-slate-400">Loading...</div>
          ) : recentActivity.length === 0 ? (
            <div className="text-slate-400 text-center py-8">
              No activity yet. Record your first bill!
            </div>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-700/30"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-full ${
                        item.type === 'bill'
                          ? 'bg-orange-500/10 text-orange-400'
                          : 'bg-cyan-500/10 text-cyan-400'
                      }`}
                    >
                      {item.type === 'bill' ? (
                        <Receipt className="h-4 w-4" />
                      ) : (
                        <CreditCard className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {item.type === 'bill' ? 'Bill' : 'Payment'}
                        {item.vendorName && ` - ${item.vendorName}`}
                      </p>
                      <p className="text-sm text-slate-400">
                        {formatDate(item.date)} • {item.description}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`font-bold ${
                      item.type === 'bill' ? 'text-orange-400' : 'text-cyan-400'
                    }`}
                  >
                    {item.type === 'bill' ? '+' : '-'}
                    {formatCurrency(item.amount, tenant.currency)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
