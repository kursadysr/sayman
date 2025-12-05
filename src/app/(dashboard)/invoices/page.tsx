'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Plus, FileText, Send, Clock, CheckCircle, FileEdit, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';
import { useTenant } from '@/hooks/use-tenant';
import { useRole } from '@/hooks/use-role';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { CreateInvoiceDialog } from '@/features/invoicing/create-invoice-dialog';
import { toast } from 'sonner';
import type { Invoice, InvoiceLine, Contact, Account } from '@/lib/supabase/types';

// Dynamically import PDF component to avoid SSR issues
const InvoicePDFDownloadButton = dynamic(
  () =>
    import('@/features/invoicing/invoice-pdf').then(
      (mod) => mod.InvoicePDFDownloadButton
    ),
  { ssr: false, loading: () => <Button disabled>Loading...</Button> }
);

const statusConfig = {
  draft: { label: 'Draft', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: FileEdit },
  sent: { label: 'Sent', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Send },
  partial: { label: 'Partial', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: Clock },
  paid: { label: 'Paid', color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: CheckCircle },
};

interface InvoiceWithDetails extends Invoice {
  customer?: Contact;
  lines?: InvoiceLine[];
}

export default function InvoicesPage() {
  const { tenant } = useTenant();
  const { canWrite } = useRole();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'draft' | 'sent' | 'partial' | 'paid'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Payment dialog state
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithDetails | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [savingPayment, setSavingPayment] = useState(false);

  // Handle URL query param to open specific invoice
  const invoiceIdFromUrl = searchParams.get('id');

  const loadInvoices = useCallback(async () => {
    if (!tenant) return;

    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from('invoices')
      .select('*, customer:contacts(*)')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });

    const invoicesData = (data || []) as InvoiceWithDetails[];

    // Load lines for each invoice
    const invoiceIds = invoicesData.map((i) => i.id);
    if (invoiceIds.length > 0) {
      const { data: linesData } = await supabase
        .from('invoice_lines')
        .select('*')
        .in('invoice_id', invoiceIds)
        .order('sort_order', { ascending: true });

      const linesMap: Record<string, InvoiceLine[]> = {};
      (linesData || []).forEach((line: InvoiceLine) => {
        if (!linesMap[line.invoice_id]) {
          linesMap[line.invoice_id] = [];
        }
        linesMap[line.invoice_id].push(line);
      });

      invoicesData.forEach((invoice) => {
        invoice.lines = linesMap[invoice.id] || [];
      });
    }

    setInvoices(invoicesData);
    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  // Load accounts for payment dialog
  useEffect(() => {
    if (!tenant) return;
    const loadAccounts = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('accounts')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('name');
      setAccounts((data || []) as Account[]);
    };
    loadAccounts();
  }, [tenant]);

  // Open invoice from URL param
  useEffect(() => {
    if (invoiceIdFromUrl && invoices.length > 0 && !loading) {
      const invoice = invoices.find(i => i.id === invoiceIdFromUrl);
      if (invoice) {
        setSelectedInvoice(invoice);
        setPaymentDialogOpen(true);
        setPaymentAmount(invoice.total_amount);
        // Clear the URL param
        router.replace('/invoices', { scroll: false });
      }
    }
  }, [invoiceIdFromUrl, invoices, loading, router]);

  const handleRecordPayment = (invoice: InvoiceWithDetails) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(invoice.total_amount);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentAccountId('');
    setPaymentDialogOpen(true);
  };

  const handleSavePayment = async () => {
    if (!selectedInvoice || !tenant || !paymentAccountId) {
      toast.error('Please select an account');
      return;
    }

    setSavingPayment(true);
    const supabase = createClient();

    try {
      // Create transaction (positive amount = income)
      const { error: txError } = await supabase.from('transactions').insert({
        tenant_id: tenant.id,
        account_id: paymentAccountId,
        invoice_id: selectedInvoice.id,
        date: paymentDate,
        amount: paymentAmount, // Positive for income
        description: `Payment for Invoice ${selectedInvoice.invoice_number || selectedInvoice.id.slice(0, 8)}`,
        status: 'cleared',
      });

      if (txError) throw txError;

      // Update invoice status
      const newStatus = paymentAmount >= selectedInvoice.total_amount ? 'paid' : 'partial';
      await supabase
        .from('invoices')
        .update({ status: newStatus })
        .eq('id', selectedInvoice.id);

      toast.success('Payment recorded');
      setPaymentDialogOpen(false);
      loadInvoices();
    } catch (error) {
      console.error('Error recording payment:', error);
      toast.error('Failed to record payment');
    } finally {
      setSavingPayment(false);
    }
  };

  const filteredInvoices = invoices.filter((invoice) => {
    if (filter === 'all') return true;
    return invoice.status === filter;
  });

  const handleMarkAsSent = async (invoiceId: string) => {
    const supabase = createClient();
    await supabase
      .from('invoices')
      .update({ status: 'sent' })
      .eq('id', invoiceId);
    loadInvoices();
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
          <h1 className="text-2xl font-bold text-white">Invoices</h1>
          <p className="text-slate-400">Manage your accounts receivable</p>
        </div>
        {canWrite && (
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Create Invoice</span>
            <span className="sm:hidden">New</span>
          </Button>
        )}
      </div>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="mb-6">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="all" className="data-[state=active]:bg-slate-700">
            All
          </TabsTrigger>
          <TabsTrigger value="draft" className="data-[state=active]:bg-slate-700">
            Draft
          </TabsTrigger>
          <TabsTrigger value="sent" className="data-[state=active]:bg-slate-700">
            Sent
          </TabsTrigger>
          <TabsTrigger value="paid" className="data-[state=active]:bg-slate-700">
            Paid
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Invoices List */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading...</div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <FileText className="h-12 w-12 mx-auto mb-4 text-slate-600" />
              <p>No invoices found.</p>
              {canWrite && (
                <Button
                  onClick={() => setDialogOpen(true)}
                  className="mt-4 bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Invoice
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {filteredInvoices.map((invoice) => {
                const status = statusConfig[invoice.status];
                const StatusIcon = status.icon;

                return (
                  <div
                    key={invoice.id}
                    className="p-4 hover:bg-slate-700/30 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-white">
                            {invoice.invoice_number || `#${invoice.id.slice(0, 8)}`}
                          </p>
                          <Badge className={`${status.color} border`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {status.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          {invoice.customer && (
                            <span>{invoice.customer.name}</span>
                          )}
                          {invoice.issue_date && (
                            <>
                              <span>•</span>
                              <span>Issued: {formatDate(invoice.issue_date)}</span>
                            </>
                          )}
                          {invoice.due_date && (
                            <>
                              <span>•</span>
                              <span>Due: {formatDate(invoice.due_date)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-white">
                          {formatCurrency(invoice.total_amount, tenant.currency)}
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      {invoice.status === 'draft' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMarkAsSent(invoice.id)}
                          className="border-slate-600 text-slate-300"
                        >
                          <Send className="mr-1 h-3 w-3" />
                          Mark as Sent
                        </Button>
                      )}
                      {(invoice.status === 'sent' || invoice.status === 'partial') && canWrite && (
                        <Button
                          size="sm"
                          onClick={() => handleRecordPayment(invoice)}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white"
                        >
                          <DollarSign className="mr-1 h-3 w-3" />
                          Record Payment
                        </Button>
                      )}
                      {invoice.lines && invoice.lines.length > 0 && (
                        <InvoicePDFDownloadButton
                          invoice={invoice}
                          lines={invoice.lines}
                          tenant={tenant}
                          customer={invoice.customer || null}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Invoice Dialog */}
      <CreateInvoiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={loadInvoices}
      />

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-400" />
              Record Payment
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {selectedInvoice && (
                <>Record payment for Invoice {selectedInvoice.invoice_number || `#${selectedInvoice.id.slice(0, 8)}`}</>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-700/30 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Invoice Total</span>
                  <span className="text-white font-bold">
                    {formatCurrency(selectedInvoice.total_amount, tenant.currency)}
                  </span>
                </div>
              </div>

              <div>
                <Label className="text-slate-300">Payment Date</Label>
                <DateInput
                  value={paymentDate}
                  onChange={setPaymentDate}
                  className="mt-1 bg-slate-700/50 border-slate-600 text-white"
                />
              </div>

              <div>
                <Label className="text-slate-300">Amount Received</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="mt-1 bg-slate-700/50 border-slate-600 text-white"
                />
              </div>

              <div>
                <Label className="text-slate-300">Deposit To Account</Label>
                <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                  <SelectTrigger className="mt-1 bg-slate-700/50 border-slate-600 text-white">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id} className="text-white">
                        {acc.name} ({formatCurrency(acc.balance, tenant.currency)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPaymentDialogOpen(false)}
              className="border-slate-600 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSavePayment}
              disabled={savingPayment || paymentAmount <= 0 || !paymentAccountId}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {savingPayment ? 'Recording...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

