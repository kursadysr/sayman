'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Plus, Landmark, TrendingDown, TrendingUp, Calendar, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTenant } from '@/hooks/use-tenant';
import { useRole } from '@/hooks/use-role';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { AddLoanDrawer } from '@/features/loans/add-loan-drawer';
import { LoanDetailsDrawer } from '@/features/loans/loan-details-drawer';
import type { Loan, Contact } from '@/lib/supabase/types';

export default function LoansPage() {
  const { tenant } = useTenant();
  const { canWrite } = useRole();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loans, setLoans] = useState<(Loan & { contact?: Contact })[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDrawerOpen, setAddDrawerOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'payable' | 'receivable'>('all');

  // Handle URL query param to open specific loan
  const loanIdFromUrl = searchParams.get('id');

  const loadLoans = async () => {
    if (!tenant) return;
    
    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('loans')
      .select('*, contact:contacts(*)')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading loans:', error);
    } else {
      setLoans(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadLoans();
  }, [tenant]);

  // Open loan from URL param
  useEffect(() => {
    if (loanIdFromUrl && loans.length > 0 && !loading) {
      const loan = loans.find(l => l.id === loanIdFromUrl);
      if (loan) {
        setSelectedLoan(loan);
        setDetailsDrawerOpen(true);
        // Clear the URL param
        router.replace('/loans', { scroll: false });
      }
    }
  }, [loanIdFromUrl, loans, loading, router]);

  const filteredLoans = loans.filter(loan => {
    if (filter === 'all') return true;
    return loan.type === filter;
  });

  const activeLoans = filteredLoans.filter(l => l.status === 'active');
  const paidOffLoans = filteredLoans.filter(l => l.status === 'paid_off');

  const totalPayable = loans
    .filter(l => l.type === 'payable' && l.status === 'active')
    .reduce((sum, l) => sum + l.remaining_balance, 0);

  const totalReceivable = loans
    .filter(l => l.type === 'receivable' && l.status === 'active')
    .reduce((sum, l) => sum + l.remaining_balance, 0);

  const handleLoanClick = (loan: Loan) => {
    setSelectedLoan(loan);
    setDetailsDrawerOpen(true);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Loans</h1>
          <p className="text-slate-400">Manage loans payable and receivable</p>
        </div>
        {canWrite && (
          <Button
            onClick={() => setAddDrawerOpen(true)}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Loan
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Loans Payable
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">
              {formatCurrency(totalPayable, tenant.currency)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {loans.filter(l => l.type === 'payable' && l.status === 'active').length} active loan(s)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Loans Receivable
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {formatCurrency(totalReceivable, tenant.currency)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {loans.filter(l => l.type === 'receivable' && l.status === 'active').length} active loan(s)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="mb-6">
        <TabsList className="bg-slate-800 border-slate-700">
          <TabsTrigger value="all" className="data-[state=active]:bg-slate-700">
            All
          </TabsTrigger>
          <TabsTrigger value="payable" className="data-[state=active]:bg-slate-700">
            Payable
          </TabsTrigger>
          <TabsTrigger value="receivable" className="data-[state=active]:bg-slate-700">
            Receivable
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Loans List */}
      {loading ? (
        <div className="text-center text-slate-400 py-12">Loading...</div>
      ) : filteredLoans.length === 0 ? (
        <div className="text-center py-12">
          <Landmark className="h-12 w-12 mx-auto mb-4 text-slate-600" />
          <h3 className="text-lg font-medium text-white mb-2">No loans yet</h3>
          <p className="text-slate-400 mb-4">
            Track loans you've borrowed or lent out
          </p>
          {canWrite && (
            <Button
              onClick={() => setAddDrawerOpen(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Loan
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Loans */}
          {activeLoans.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-3">Active Loans</h3>
              <div className="space-y-3">
                {activeLoans.map((loan) => (
                  <div
                    key={loan.id}
                    onClick={() => handleLoanClick(loan)}
                    className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-full ${
                          loan.type === 'payable' 
                            ? 'bg-red-500/10 text-red-400' 
                            : 'bg-emerald-500/10 text-emerald-400'
                        }`}>
                          {loan.type === 'payable' ? (
                            <TrendingDown className="h-5 w-5" />
                          ) : (
                            <TrendingUp className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-white">{loan.name}</h4>
                            <Badge 
                              variant="secondary" 
                              className={loan.type === 'payable' 
                                ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              }
                            >
                              {loan.type === 'payable' ? 'Payable' : 'Receivable'}
                            </Badge>
                          </div>
                          {loan.contact && (
                            <p className="text-sm text-slate-400">{loan.contact.name}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Percent className="h-3 w-3" />
                              {(loan.interest_rate * 100).toFixed(2)}% APR
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {loan.term_months} months
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${
                          loan.type === 'payable' ? 'text-red-400' : 'text-emerald-400'
                        }`}>
                          {formatCurrency(loan.remaining_balance, tenant.currency)}
                        </div>
                        <div className="text-xs text-slate-500">
                          of {formatCurrency(loan.principal_amount, tenant.currency)}
                        </div>
                        {/* Progress bar */}
                        <div className="w-24 h-1.5 bg-slate-700 rounded-full mt-2 ml-auto">
                          <div 
                            className={`h-full rounded-full ${
                              loan.type === 'payable' ? 'bg-red-400' : 'bg-emerald-400'
                            }`}
                            style={{ 
                              width: `${((loan.principal_amount - loan.remaining_balance) / loan.principal_amount) * 100}%` 
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Paid Off Loans */}
          {paidOffLoans.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-3">Paid Off</h3>
              <div className="space-y-3">
                {paidOffLoans.map((loan) => (
                  <div
                    key={loan.id}
                    onClick={() => handleLoanClick(loan)}
                    className="p-4 bg-slate-800/30 border border-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700/30 transition-colors opacity-60"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-slate-700/50 text-slate-400">
                          <Landmark className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-medium text-white">{loan.name}</h4>
                          {loan.contact && (
                            <p className="text-sm text-slate-500">{loan.contact.name}</p>
                          )}
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-slate-700 text-slate-300">
                        Paid Off
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Loan Drawer */}
      <AddLoanDrawer
        open={addDrawerOpen}
        onOpenChange={setAddDrawerOpen}
        onSuccess={loadLoans}
      />

      {/* Loan Details Drawer */}
      <LoanDetailsDrawer
        loan={selectedLoan}
        open={detailsDrawerOpen}
        onOpenChange={setDetailsDrawerOpen}
        onUpdate={loadLoans}
      />
    </div>
  );
}

