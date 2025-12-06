'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
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
import type { Loan, Contact, LoanPayment } from '@/lib/supabase/types';

// Loan with calculated remaining balance
interface LoanWithBalance extends Loan {
  contact?: Contact;
  calculatedRemainingBalance: number;
}

export default function LoansPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><p className="text-slate-400">Loading...</p></div>}>
      <LoansPageContent />
    </Suspense>
  );
}

function LoansPageContent() {
  const { tenant } = useTenant();
  const { canWrite } = useRole();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loans, setLoans] = useState<(Loan & { contact?: Contact })[]>([]);
  const [payments, setPayments] = useState<LoanPayment[]>([]);
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

    // Fetch loans and all payments in parallel
    const [loansRes, paymentsRes] = await Promise.all([
      supabase
        .from('loans')
        .select('*, contact:contacts(*)')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('loan_payments')
        .select('loan_id, principal_amount')
        .eq('tenant_id', tenant.id)
    ]);

    if (loansRes.error) {
      console.error('Error loading loans:', loansRes.error);
    } else {
      setLoans(loansRes.data || []);
    }
    
    setPayments((paymentsRes.data || []) as LoanPayment[]);
    setLoading(false);
  };

  // Calculate remaining balance dynamically for each loan
  const loansWithBalance: LoanWithBalance[] = useMemo(() => {
    return loans.map(loan => {
      // Sum all principal payments for this loan
      const totalPaidPrincipal = payments
        .filter(p => p.loan_id === loan.id)
        .reduce((sum, p) => sum + Number(p.principal_amount), 0);
      
      return {
        ...loan,
        calculatedRemainingBalance: Math.max(0, Number(loan.principal_amount) - totalPaidPrincipal)
      };
    });
  }, [loans, payments]);

  useEffect(() => {
    loadLoans();
  }, [tenant]);

  // Open loan from URL param
  useEffect(() => {
    if (loanIdFromUrl && loansWithBalance.length > 0 && !loading) {
      const loan = loansWithBalance.find(l => l.id === loanIdFromUrl);
      if (loan) {
        setSelectedLoan(loan);
        setDetailsDrawerOpen(true);
        // Clear the URL param
        router.replace('/loans', { scroll: false });
      }
    }
  }, [loanIdFromUrl, loansWithBalance, loading, router]);

  const filteredLoans = loansWithBalance.filter(loan => {
    if (filter === 'all') return true;
    return loan.type === filter;
  });

  // Use calculated balance to determine active/paid off status
  const activeLoans = filteredLoans.filter(l => l.calculatedRemainingBalance > 0);
  const paidOffLoans = filteredLoans.filter(l => l.calculatedRemainingBalance <= 0);

  const totalPayable = loansWithBalance
    .filter(l => l.type === 'payable' && l.calculatedRemainingBalance > 0)
    .reduce((sum, l) => sum + l.calculatedRemainingBalance, 0);

  const totalReceivable = loansWithBalance
    .filter(l => l.type === 'receivable' && l.calculatedRemainingBalance > 0)
    .reduce((sum, l) => sum + l.calculatedRemainingBalance, 0);

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
              {loansWithBalance.filter(l => l.type === 'payable' && l.calculatedRemainingBalance > 0).length} active loan(s)
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
              {loansWithBalance.filter(l => l.type === 'receivable' && l.calculatedRemainingBalance > 0).length} active loan(s)
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
                        <div className="text-lg font-bold text-white">
                          {formatCurrency(loan.calculatedRemainingBalance, tenant.currency)}
                        </div>
                        <div className="text-xs text-slate-500">
                          of {formatCurrency(Number(loan.principal_amount), tenant.currency)}
                        </div>
                        {/* Progress bar - green for positive progress */}
                        <div className="w-24 h-1.5 bg-slate-700 rounded-full mt-2 ml-auto">
                          <div 
                            className="h-full rounded-full bg-emerald-400"
                            style={{ 
                              width: `${Math.min(100, ((Number(loan.principal_amount) - loan.calculatedRemainingBalance) / Number(loan.principal_amount)) * 100)}%` 
                            }}
                          />
                        </div>
                        <div className="text-xs text-emerald-400 mt-1">
                          {((Number(loan.principal_amount) - loan.calculatedRemainingBalance) / Number(loan.principal_amount) * 100).toFixed(0)}% paid
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

