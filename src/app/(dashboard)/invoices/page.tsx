'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Plus, FileText, Send, Clock, CheckCircle, FileEdit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/hooks/use-tenant';
import { useRole } from '@/hooks/use-role';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { CreateInvoiceDialog } from '@/features/invoicing/create-invoice-dialog';
import type { Invoice, InvoiceLine, Contact } from '@/lib/supabase/types';

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
  const [invoices, setInvoices] = useState<InvoiceWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'draft' | 'sent' | 'partial' | 'paid'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);

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
    </div>
  );
}

