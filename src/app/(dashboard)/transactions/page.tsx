'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Filter, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { AddTransactionDrawer } from '@/features/transactions/add-transaction-drawer';
import type { Transaction } from '@/lib/supabase/types';

export default function TransactionsPage() {
  const { tenant } = useTenant();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerType, setDrawerType] = useState<'expense' | 'income'>('expense');
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');

  const loadTransactions = useCallback(async () => {
    if (!tenant) return;

    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from('transactions')
      .select('*, account:accounts(*), category:categories(*)')
      .eq('tenant_id', tenant.id)
      .order('date', { ascending: false });

    setTransactions((data || []) as Transaction[]);
    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const filteredTransactions = transactions.filter((tx) => {
    if (filter === 'all') return true;
    if (filter === 'income') return tx.amount > 0;
    if (filter === 'expense') return tx.amount < 0;
    return true;
  });

  const handleAddExpense = () => {
    setDrawerType('expense');
    setDrawerOpen(true);
  };

  const handleAddIncome = () => {
    setDrawerType('income');
    setDrawerOpen(true);
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Transactions</h1>
          <p className="text-slate-400">Track your income and expenses</p>
        </div>
        <div className="hidden lg:flex gap-2">
          <Button
            onClick={handleAddIncome}
            variant="outline"
            className="border-green-500 text-green-400 hover:bg-green-500/10"
          >
            <ArrowUpCircle className="mr-2 h-4 w-4" />
            Add Income
          </Button>
          <Button
            onClick={handleAddExpense}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            <ArrowDownCircle className="mr-2 h-4 w-4" />
            Add Expense
          </Button>
        </div>
      </div>

      {/* Mobile Add Buttons */}
      <div className="flex gap-2 mb-6 lg:hidden">
        <Button
          onClick={handleAddIncome}
          variant="outline"
          className="flex-1 border-green-500 text-green-400"
        >
          <ArrowUpCircle className="mr-2 h-4 w-4" />
          Income
        </Button>
        <Button
          onClick={handleAddExpense}
          className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
        >
          <ArrowDownCircle className="mr-2 h-4 w-4" />
          Expense
        </Button>
      </div>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'income' | 'expense')} className="mb-6">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="all" className="data-[state=active]:bg-slate-700">
            All
          </TabsTrigger>
          <TabsTrigger value="income" className="data-[state=active]:bg-slate-700">
            Income
          </TabsTrigger>
          <TabsTrigger value="expense" className="data-[state=active]:bg-slate-700">
            Expenses
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Transactions List */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading...</div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <p>No transactions found.</p>
              <Button
                onClick={handleAddExpense}
                className="mt-4 bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Transaction
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {filteredTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2 rounded-full ${
                        tx.amount >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
                      }`}
                    >
                      {tx.amount >= 0 ? (
                        <ArrowUpCircle className="h-5 w-5 text-green-400" />
                      ) : (
                        <ArrowDownCircle className="h-5 w-5 text-red-400" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {tx.description || tx.category?.name || 'Transaction'}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <span>{formatDate(tx.date)}</span>
                        <span>•</span>
                        <span>{tx.account?.name}</span>
                        {tx.category && (
                          <>
                            <span>•</span>
                            <Badge variant="secondary" className="bg-slate-700 text-slate-300">
                              {tx.category.name}
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`text-lg font-bold ${
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

      {/* Add Transaction Drawer */}
      <AddTransactionDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onSuccess={loadTransactions}
        type={drawerType}
      />
    </div>
  );
}

