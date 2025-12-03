'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Receipt, Clock, CheckCircle, AlertCircle, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/hooks/use-tenant';
import { useRole } from '@/hooks/use-role';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { RecordPaymentDialog } from '@/features/bills/record-payment-dialog';
import { AddBillDrawer } from '@/features/bills/add-bill-drawer';
import { EditBillDrawer } from '@/features/bills/edit-bill-drawer';
import type { Bill } from '@/lib/supabase/types';

const statusConfig = {
  unpaid: { label: 'Unpaid', color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: AlertCircle },
  partial: { label: 'Partial', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: Clock },
  paid: { label: 'Paid', color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: CheckCircle },
};

export default function BillsPage() {
  const { tenant } = useTenant();
  const { canWrite } = useRole();
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all');
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [addBillDrawerOpen, setAddBillDrawerOpen] = useState(false);
  const [editBillDrawerOpen, setEditBillDrawerOpen] = useState(false);

  const loadBills = useCallback(async () => {
    if (!tenant) return;

    setLoading(true);
    const supabase = createClient();

    // Get bills with vendor info
    const { data: billsData } = await supabase
      .from('bills')
      .select('*, vendor:contacts(*)')
      .eq('tenant_id', tenant.id)
      .order('due_date', { ascending: true });

    const loadedBills = (billsData || []) as Bill[];
    setBills(loadedBills);

    // Get payments for each bill
    const billIds = loadedBills.map((b) => b.id);
    if (billIds.length > 0) {
      const { data: txData } = await supabase
        .from('transactions')
        .select('bill_id, amount')
        .in('bill_id', billIds);

      const paymentMap: Record<string, number> = {};
      (txData || []).forEach((tx: { bill_id: string | null; amount: number }) => {
        if (tx.bill_id) {
          paymentMap[tx.bill_id] = (paymentMap[tx.bill_id] || 0) + Math.abs(tx.amount);
        }
      });
      setPayments(paymentMap);
    }

    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const filteredBills = bills.filter((bill) => {
    if (filter === 'all') return true;
    return bill.status === filter;
  });

  const handleRecordPayment = (bill: Bill) => {
    setSelectedBill(bill);
    setPaymentDialogOpen(true);
  };

  const handleEditBill = (bill: Bill) => {
    setSelectedBill(bill);
    setEditBillDrawerOpen(true);
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
          <h1 className="text-2xl font-bold text-white">Bills</h1>
          <p className="text-slate-400">Manage your accounts payable</p>
        </div>
        {canWrite && (
          <Button
            onClick={() => setAddBillDrawerOpen(true)}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Bill
          </Button>
        )}
      </div>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="mb-6">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="all" className="data-[state=active]:bg-slate-700">
            All
          </TabsTrigger>
          <TabsTrigger value="unpaid" className="data-[state=active]:bg-slate-700">
            Unpaid
          </TabsTrigger>
          <TabsTrigger value="partial" className="data-[state=active]:bg-slate-700">
            Partial
          </TabsTrigger>
          <TabsTrigger value="paid" className="data-[state=active]:bg-slate-700">
            Paid
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Bills List */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading...</div>
          ) : filteredBills.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Receipt className="h-12 w-12 mx-auto mb-4 text-slate-600" />
              <p>No bills found.</p>
              <p className="text-sm mt-2">
                Click &quot;Add Bill&quot; to record your first expense.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {filteredBills.map((bill) => {
                const status = statusConfig[bill.status];
                const StatusIcon = status.icon;
                const paidAmount = payments[bill.id] || 0;
                const remainingAmount = bill.total_amount - paidAmount;

                return (
                  <div
                    key={bill.id}
                    className="p-4 hover:bg-slate-700/30 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-white">
                            {bill.vendor?.name || bill.description || 'Quick Expense'}
                          </p>
                          {!bill.vendor && (
                            <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20 border text-xs">
                              No Vendor
                            </Badge>
                          )}
                          <Badge className={`${status.color} border`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {status.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          {bill.bill_number && <span>#{bill.bill_number}</span>}
                          {bill.due_date && (
                            <>
                              <span>•</span>
                              <span>Due: {formatDate(bill.due_date)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-white">
                          {formatCurrency(bill.total_amount, tenant.currency)}
                        </p>
                        {paidAmount > 0 && remainingAmount > 0 && (
                          <p className="text-sm text-slate-400">
                            Remaining: {formatCurrency(remainingAmount, tenant.currency)}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {canWrite && (
                      <div className="flex justify-end gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditBill(bill)}
                          className="border-slate-600 text-slate-300 hover:bg-slate-700"
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        {bill.status !== 'paid' && (
                          <Button
                            size="sm"
                            onClick={() => handleRecordPayment(bill)}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white"
                          >
                            Record Payment
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record Payment Dialog */}
      <RecordPaymentDialog
        bill={selectedBill}
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        onSuccess={loadBills}
        paidAmount={selectedBill ? payments[selectedBill.id] || 0 : 0}
      />

      {/* Add Bill Drawer */}
      <AddBillDrawer
        open={addBillDrawerOpen}
        onOpenChange={setAddBillDrawerOpen}
        onSuccess={loadBills}
      />

      {/* Edit Bill Drawer */}
      <EditBillDrawer
        bill={selectedBill}
        open={editBillDrawerOpen}
        onOpenChange={setEditBillDrawerOpen}
        onSuccess={loadBills}
      />
    </div>
  );
}

