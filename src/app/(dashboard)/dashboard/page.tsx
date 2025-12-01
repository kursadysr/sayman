'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Wallet, ArrowRightLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { Transaction, Account } from '@/lib/supabase/types';

interface DashboardStats {
  totalBalance: number;
  income: number;
  expenses: number;
  transactionCount: number;
}

export default function DashboardPage() {
  const { tenant } = useTenant();
  const [stats, setStats] = useState<DashboardStats>({
    totalBalance: 0,
    income: 0,
    expenses: 0,
    transactionCount: 0,
  });
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenant) return;

    const loadDashboardData = async () => {
      setLoading(true);
      const supabase = createClient();

      // Get accounts for total balance
      const { data: accounts } = await supabase
        .from('accounts')
        .select('*')
        .eq('tenant_id', tenant.id);

      const totalBalance = (accounts as Account[] || []).reduce(
        (sum, acc) => sum + Number(acc.balance),
        0
      );

      // Get transactions for this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: transactions } = await supabase
        .from('transactions')
        .select('*, account:accounts(*), category:categories(*)')
        .eq('tenant_id', tenant.id)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .order('date', { ascending: false });

      const txs = (transactions || []) as Transaction[];
      
      const income = txs
        .filter((t) => t.amount > 0)
        .reduce((sum, t) => sum + Number(t.amount), 0);
      
      const expenses = txs
        .filter((t) => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

      setStats({
        totalBalance,
        income,
        expenses,
        transactionCount: txs.length,
      });

      // Get recent transactions
      const { data: recent } = await supabase
        .from('transactions')
        .select('*, account:accounts(*), category:categories(*)')
        .eq('tenant_id', tenant.id)
        .order('date', { ascending: false })
        .limit(5);

      setRecentTransactions((recent || []) as Transaction[]);
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
              Total Balance
            </CardTitle>
            <Wallet className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {loading ? '...' : formatCurrency(stats.totalBalance, tenant.currency)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Income (This Month)
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">
              {loading ? '...' : formatCurrency(stats.income, tenant.currency)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Expenses (This Month)
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">
              {loading ? '...' : formatCurrency(stats.expenses, tenant.currency)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Transactions
            </CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-cyan-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {loading ? '...' : stats.transactionCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-slate-400">Loading...</div>
          ) : recentTransactions.length === 0 ? (
            <div className="text-slate-400 text-center py-8">
              No transactions yet. Add your first transaction!
            </div>
          ) : (
            <div className="space-y-4">
              {recentTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-700/30"
                >
                  <div className="flex-1">
                    <p className="font-medium text-white">
                      {tx.description || tx.category?.name || 'Transaction'}
                    </p>
                    <p className="text-sm text-slate-400">
                      {formatDate(tx.date)} • {tx.account?.name}
                    </p>
                  </div>
                  <div
                    className={`font-bold ${
                      tx.amount >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {tx.amount >= 0 ? '+' : ''}
                    {formatCurrency(tx.amount, tenant.currency)}
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

