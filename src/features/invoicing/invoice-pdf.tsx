'use client';

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  PDFDownloadLink,
} from '@react-pdf/renderer';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import type { Invoice, InvoiceLine, Tenant, Contact } from '@/lib/supabase/types';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10b981',
  },
  invoiceTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#374151',
  },
  invoiceNumber: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#6b7280',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  billTo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  billToColumn: {
    width: '45%',
  },
  companyName: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  text: {
    fontSize: 10,
    color: '#4b5563',
    marginBottom: 2,
  },
  table: {
    marginTop: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  colDescription: {
    flex: 2,
  },
  colQty: {
    width: 60,
    textAlign: 'center',
  },
  colPrice: {
    width: 80,
    textAlign: 'right',
  },
  colTotal: {
    width: 80,
    textAlign: 'right',
  },
  headerText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#374151',
    textTransform: 'uppercase',
  },
  totalsSection: {
    marginTop: 20,
    alignItems: 'flex-end',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: 200,
    marginBottom: 4,
  },
  totalLabel: {
    flex: 1,
    textAlign: 'right',
    paddingRight: 10,
    color: '#6b7280',
  },
  totalValue: {
    width: 80,
    textAlign: 'right',
  },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: 200,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: '#10b981',
  },
  grandTotalLabel: {
    flex: 1,
    textAlign: 'right',
    paddingRight: 10,
    fontWeight: 'bold',
    fontSize: 12,
  },
  grandTotalValue: {
    width: 80,
    textAlign: 'right',
    fontWeight: 'bold',
    fontSize: 12,
    color: '#10b981',
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
  },
  footerText: {
    fontSize: 9,
    color: '#9ca3af',
    textAlign: 'center',
  },
  notes: {
    marginTop: 30,
    padding: 15,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
  },
  notesTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 4,
  },
});

interface InvoicePDFProps {
  invoice: Invoice;
  lines: InvoiceLine[];
  tenant: Tenant;
  customer: Contact | null;
}

function formatCurrency(amount: number, currency: string = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

function InvoiceDocument({ invoice, lines, tenant, customer }: InvoicePDFProps) {
  const isService = invoice.layout_type === 'service';
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  const taxTotal = lines.reduce(
    (sum, line) => sum + (line.total * line.tax_rate) / 100,
    0
  );
  const total = subtotal + taxTotal;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>{tenant.name}</Text>
            {tenant.address_details?.address && (
              <Text style={styles.text}>{tenant.address_details.address}</Text>
            )}
            {tenant.address_details?.tax_id && (
              <Text style={styles.text}>Tax ID: {tenant.address_details.tax_id}</Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>
              #{invoice.invoice_number || invoice.id.slice(0, 8)}
            </Text>
          </View>
        </View>

        {/* Bill To / Invoice Details */}
        <View style={styles.billTo}>
          <View style={styles.billToColumn}>
            <Text style={styles.sectionTitle}>Bill To</Text>
            {customer ? (
              <>
                <Text style={styles.companyName}>{customer.name}</Text>
                {customer.email && <Text style={styles.text}>{customer.email}</Text>}
                {customer.phone && <Text style={styles.text}>{customer.phone}</Text>}
                {customer.address && <Text style={styles.text}>{customer.address}</Text>}
                {customer.tax_id && (
                  <Text style={styles.text}>Tax ID: {customer.tax_id}</Text>
                )}
              </>
            ) : (
              <Text style={styles.text}>-</Text>
            )}
          </View>
          <View style={styles.billToColumn}>
            <Text style={styles.sectionTitle}>Invoice Details</Text>
            <Text style={styles.text}>Issue Date: {invoice.issue_date}</Text>
            {invoice.due_date && (
              <Text style={styles.text}>Due Date: {invoice.due_date}</Text>
            )}
            <Text style={styles.text}>
              Status:{' '}
              {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
            </Text>
          </View>
        </View>

        {/* Line Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerText, styles.colDescription]}>
              Description
            </Text>
            {!isService && (
              <Text style={[styles.headerText, styles.colQty]}>Qty</Text>
            )}
            <Text style={[styles.headerText, styles.colPrice]}>Price</Text>
            <Text style={[styles.headerText, styles.colTotal]}>Total</Text>
          </View>
          {lines.map((line, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colDescription}>{line.description}</Text>
              {!isService && (
                <Text style={styles.colQty}>{line.quantity}</Text>
              )}
              <Text style={styles.colPrice}>
                {formatCurrency(line.unit_price, tenant.currency)}
              </Text>
              <Text style={styles.colTotal}>
                {formatCurrency(line.total, tenant.currency)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(subtotal, tenant.currency)}
            </Text>
          </View>
          {taxTotal > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(taxTotal, tenant.currency)}
              </Text>
            </View>
          )}
          <View style={styles.grandTotal}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>
              {formatCurrency(total, tenant.currency)}
            </Text>
          </View>
        </View>

        {/* Notes */}
        {invoice.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text style={styles.text}>{invoice.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {tenant.address_details?.footer_note ||
              `Thank you for your business!`}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export function InvoicePDFDownloadButton(props: InvoicePDFProps) {
  const fileName = `invoice-${props.invoice.invoice_number || props.invoice.id.slice(0, 8)}.pdf`;

  return (
    <PDFDownloadLink
      document={<InvoiceDocument {...props} />}
      fileName={fileName}
    >
      {({ loading }) => (
        <Button
          disabled={loading}
          className="bg-emerald-500 hover:bg-emerald-600 text-white"
        >
          <Download className="mr-2 h-4 w-4" />
          {loading ? 'Generating...' : 'Download PDF'}
        </Button>
      )}
    </PDFDownloadLink>
  );
}

