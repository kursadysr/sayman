'use client';

import { useEffect, useState } from 'react';
import { Wallet, Receipt, CreditCard, Users, Clock, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { Account } from '@/lib/supabase/types';

interface DashboardStats {
  cashBalance: number;
  vendorPayables: number;
  wagesPayable: number;
  totalPayables: number;
  expensesThisMonth: number;
  wagesThisMonth: number;
  paymentsThisMonth: number;
  unpaidBillsCount: number;
}

interface RecentActivity {
  id: string;
  type: 'bill' | 'payment' | 'timesheet' | 'wage_payment';
  date: string;
  description: string;
  amount: number;
  contactName?: string;
}

export default function DashboardPage() {
  const { tenant } = useTenant();
  const [stats, setStats] = useState<DashboardStats>({
    cashBalance: 0,
    vendorPayables: 0,
    wagesPayable: 0,
    totalPayables: 0,
    expensesThisMonth: 0,
    wagesThisMonth: 0,
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

      // Get vendors for accounts payable
      const { data: vendors } = await supabase
        .from('contacts')
        .select('balance')
        .eq('tenant_id', tenant.id)
        .eq('type', 'vendor');

      const vendorPayables = (vendors as { balance: number }[] || []).reduce(
        (sum, v) => sum + Math.max(0, Number(v.balance)),
        0
      );

      // Get employees for wages payable
      const { data: employees } = await supabase
        .from('contacts')
        .select('balance')
        .eq('tenant_id', tenant.id)
        .eq('type', 'employee');

      const wagesPayable = (employees as { balance: number }[] || []).reduce(
        (sum, e) => sum + Math.max(0, Number(e.balance)),
        0
      );

      const totalPayables = vendorPayables + wagesPayable;

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

      // Get timesheets this month (wages expense)
      const { data: timesheetsThisMonth } = await supabase
        .from('timesheets')
        .select('total_amount')
        .eq('tenant_id', tenant.id)
        .gte('date', startOfMonth.toISOString().split('T')[0]);

      const wagesThisMonth = (timesheetsThisMonth || []).reduce(
        (sum, t) => sum + Number(t.total_amount),
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
        vendorPayables,
        wagesPayable,
        totalPayables,
        expensesThisMonth,
        wagesThisMonth,
        paymentsThisMonth: paymentsTotal,
        unpaidBillsCount: unpaidCount || 0,
      });

      // Get recent activity
      const activity: RecentActivity[] = [];

      // Recent bills
      const { data: recentBills } = await supabase
        .from('bills')
        .select('id, issue_date, description, bill_number, total_amount, vendor:contacts(name)')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(5);

      (recentBills || []).forEach((bill: any) => {
        activity.push({
          id: `bill-${bill.id}`,
          type: 'bill',
          date: bill.issue_date,
          description: bill.description || bill.bill_number || 'Bill',
          amount: bill.total_amount,
          contactName: bill.vendor?.name,
        });
      });

      // Recent timesheets
      const { data: recentTimesheets } = await supabase
        .from('timesheets')
        .select('id, date, description, total_amount, employee:contacts(name), category:timesheet_categories(name)')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(5);

      (recentTimesheets || []).forEach((ts: any) => {
        activity.push({
          id: `timesheet-${ts.id}`,
          type: 'timesheet',
          date: ts.date,
          description: ts.category?.name || ts.description || 'Work hours',
          amount: ts.total_amount,
          contactName: ts.employee?.name,
        });
      });

      // Recent payments (bill payments)
      const { data: recentBillPayments } = await supabase
        .from('transactions')
        .select('id, date, description, amount, bill:bills(vendor:contacts(name))')
        .eq('tenant_id', tenant.id)
        .not('bill_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(3);

      (recentBillPayments || []).forEach((payment: any) => {
        activity.push({
          id: `payment-${payment.id}`,
          type: 'payment',
          date: payment.date,
          description: payment.description || 'Bill Payment',
          amount: Math.abs(payment.amount),
          contactName: payment.bill?.vendor?.name,
        });
      });

      // Recent wage payments
      const { data: recentWagePayments } = await supabase
        .from('transactions')
        .select('id, date, description, amount, timesheet:timesheets(employee:contacts(name))')
        .eq('tenant_id', tenant.id)
        .not('timesheet_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(3);

      (recentWagePayments || []).forEach((payment: any) => {
        activity.push({
          id: `wage-payment-${payment.id}`,
          type: 'wage_payment',
          date: payment.date,
          description: payment.description || 'Wage Payment',
          amount: Math.abs(payment.amount),
          contactName: payment.timesheet?.employee?.name,
        });
      });

      // Sort by date descending
      activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecentActivity(activity.slice(0, 10));

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

      {/* Stats Cards - Row 1 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
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
              Total Payables
            </CardTitle>
            <Users className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">
              {loading ? '...' : formatCurrency(stats.totalPayables, tenant.currency)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Total owed to vendors & employees
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Accounts Payable
            </CardTitle>
            <Building2 className="h-4 w-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-400">
              {loading ? '...' : formatCurrency(stats.vendorPayables, tenant.currency)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {stats.unpaidBillsCount} unpaid bill{stats.unpaidBillsCount !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Wages Payable
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">
              {loading ? '...' : formatCurrency(stats.wagesPayable, tenant.currency)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Owed to employees</p>
          </CardContent>
        </Card>
      </div>

      {/* Stats Cards - Row 2 */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
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
              Wages (This Month)
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">
              {loading ? '...' : formatCurrency(stats.wagesThisMonth, tenant.currency)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Employee work recorded</p>
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
              No activity yet. Record your first bill or timesheet!
            </div>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((item) => {
                const isBillOrTimesheet = item.type === 'bill' || item.type === 'timesheet';
                const icon = item.type === 'bill' ? (
                  <Receipt className="h-4 w-4" />
                ) : item.type === 'timesheet' ? (
                  <Clock className="h-4 w-4" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                );
                const color = item.type === 'bill'
                  ? 'orange'
                  : item.type === 'timesheet'
                  ? 'amber'
                  : 'cyan';

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-700/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full bg-${color}-500/10 text-${color}-400`}>
                        {icon}
                      </div>
                      <div>
                        <p className="font-medium text-white">
                          {item.type === 'bill' ? 'Bill' : 
                           item.type === 'timesheet' ? 'Work' :
                           item.type === 'wage_payment' ? 'Wage Payment' : 'Payment'}
                          {item.contactName && ` - ${item.contactName}`}
                        </p>
                        <p className="text-sm text-slate-400">
                          {formatDate(item.date)} • {item.description}
                        </p>
                      </div>
                    </div>
                    <div
                      className={`font-bold ${
                        isBillOrTimesheet
                          ? item.type === 'bill' ? 'text-orange-400' : 'text-amber-400'
                          : 'text-cyan-400'
                      }`}
                    >
                      {isBillOrTimesheet ? '+' : '-'}
                      {formatCurrency(item.amount, tenant.currency)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
