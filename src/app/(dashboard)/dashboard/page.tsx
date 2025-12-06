'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Wallet, Receipt, CreditCard, Users, Clock, Building2, Settings2, GripVertical, Eye, EyeOff, Landmark, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { Account } from '@/lib/supabase/types';

// Widget definitions
const WIDGETS: Record<string, { id: string; label: string; icon: any; color: string; fullWidth?: boolean }> = {
  cashBalance: { id: 'cashBalance', label: 'Cash Balance', icon: Wallet, color: 'emerald' },
  totalPayables: { id: 'totalPayables', label: 'Total Payables', icon: Users, color: 'red' },
  accountsPayable: { id: 'accountsPayable', label: 'Accounts Payable', icon: Building2, color: 'orange' },
  wagesPayable: { id: 'wagesPayable', label: 'Wages Payable', icon: Clock, color: 'amber' },
  loansPayable: { id: 'loansPayable', label: 'Loans Payable', icon: TrendingDown, color: 'red' },
  loansReceivable: { id: 'loansReceivable', label: 'Loans Receivable', icon: TrendingUp, color: 'emerald' },
  expensesThisMonth: { id: 'expensesThisMonth', label: 'Expenses (Month)', icon: Receipt, color: 'orange' },
  wagesThisMonth: { id: 'wagesThisMonth', label: 'Wages (Month)', icon: Clock, color: 'amber' },
  paymentsThisMonth: { id: 'paymentsThisMonth', label: 'Payments (Month)', icon: CreditCard, color: 'cyan' },
  recentActivity: { id: 'recentActivity', label: 'Recent Activity', icon: Receipt, color: 'slate', fullWidth: true },
};

type WidgetId = 'cashBalance' | 'totalPayables' | 'accountsPayable' | 'wagesPayable' | 'loansPayable' | 'loansReceivable' | 'expensesThisMonth' | 'wagesThisMonth' | 'paymentsThisMonth' | 'recentActivity';

const DEFAULT_LAYOUT: WidgetId[] = [
  'cashBalance',
  'totalPayables', 
  'accountsPayable',
  'wagesPayable',
  'loansPayable',
  'loansReceivable',
  'expensesThisMonth',
  'wagesThisMonth',
  'paymentsThisMonth',
  'recentActivity',
];

const DEFAULT_VISIBLE: Record<WidgetId, boolean> = {
  cashBalance: true,
  totalPayables: true,
  accountsPayable: true,
  wagesPayable: true,
  loansPayable: true,
  loansReceivable: true,
  expensesThisMonth: true,
  wagesThisMonth: true,
  paymentsThisMonth: true,
  recentActivity: true,
};

interface DashboardStats {
  cashBalance: number;
  vendorPayables: number;
  wagesPayable: number;
  loansPayable: number;
  loansReceivable: number;
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

// Sortable Widget Component
function SortableWidget({ 
  id, 
  children, 
  isEditing 
}: { 
  id: string; 
  children: React.ReactNode; 
  isEditing: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {isEditing && (
        <div
          {...attributes}
          {...listeners}
          className="absolute -top-2 -left-2 z-10 p-1 bg-slate-700 rounded cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4 text-slate-400" />
        </div>
      )}
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const { tenant } = useTenant();
  const [stats, setStats] = useState<DashboardStats>({
    cashBalance: 0,
    vendorPayables: 0,
    wagesPayable: 0,
    loansPayable: 0,
    loansReceivable: 0,
    totalPayables: 0,
    expensesThisMonth: 0,
    wagesThisMonth: 0,
    paymentsThisMonth: 0,
    unpaidBillsCount: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [layout, setLayout] = useState<WidgetId[]>(DEFAULT_LAYOUT);
  const [visible, setVisible] = useState<Record<WidgetId, boolean>>(DEFAULT_VISIBLE);

  // Load saved preferences
  useEffect(() => {
    if (tenant) {
      const savedLayout = localStorage.getItem(`dashboard-layout-${tenant.id}`);
      const savedVisible = localStorage.getItem(`dashboard-visible-${tenant.id}`);
      
      if (savedLayout) {
        try {
          setLayout(JSON.parse(savedLayout));
        } catch (e) {
          console.error('Failed to parse saved layout');
        }
      }
      
      if (savedVisible) {
        try {
          setVisible(JSON.parse(savedVisible));
        } catch (e) {
          console.error('Failed to parse saved visibility');
        }
      }
    }
  }, [tenant]);

  // Save preferences
  const savePreferences = () => {
    if (tenant) {
      localStorage.setItem(`dashboard-layout-${tenant.id}`, JSON.stringify(layout));
      localStorage.setItem(`dashboard-visible-${tenant.id}`, JSON.stringify(visible));
    }
    setIsEditing(false);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLayout((items) => {
        const oldIndex = items.indexOf(active.id as WidgetId);
        const newIndex = items.indexOf(over.id as WidgetId);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const toggleVisibility = (widgetId: WidgetId) => {
    setVisible((prev) => ({ ...prev, [widgetId]: !prev[widgetId] }));
  };

  // Filter visible widgets
  const visibleLayout = useMemo(() => 
    layout.filter(id => visible[id]), 
    [layout, visible]
  );

  // Split into rows (small cards and full-width cards)
  const smallCards = visibleLayout.filter(id => !WIDGETS[id].fullWidth);
  const fullWidthCards = visibleLayout.filter(id => WIDGETS[id].fullWidth);

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

      // Get accounts payable from unpaid bills (more accurate than stored balance)
      const { data: unpaidBills } = await supabase
        .from('bills')
        .select(`
          id,
          total_amount,
          vendor_id
        `)
        .eq('tenant_id', tenant.id)
        .neq('status', 'paid');

      // Get payments made against bills
      const { data: billPayments } = await supabase
        .from('transactions')
        .select('bill_id, amount')
        .eq('tenant_id', tenant.id)
        .not('bill_id', 'is', null);

      const billPaymentsMap = (billPayments || []).reduce((acc: Record<string, number>, p: any) => {
        acc[p.bill_id] = (acc[p.bill_id] || 0) + Math.abs(Number(p.amount));
        return acc;
      }, {});

      const vendorPayables = (unpaidBills || []).reduce((sum, bill: any) => {
        const paid = billPaymentsMap[bill.id] || 0;
        return sum + Math.max(0, Number(bill.total_amount) - paid);
      }, 0);

      // Get wages payable from unpaid timesheets
      const { data: unpaidTimesheets } = await supabase
        .from('timesheets')
        .select('id, total_amount')
        .eq('tenant_id', tenant.id)
        .eq('status', 'unpaid');

      // Get payments made against timesheets
      const { data: timesheetPayments } = await supabase
        .from('transactions')
        .select('timesheet_id, amount')
        .eq('tenant_id', tenant.id)
        .not('timesheet_id', 'is', null);

      const timesheetPaymentsMap = (timesheetPayments || []).reduce((acc: Record<string, number>, p: any) => {
        acc[p.timesheet_id] = (acc[p.timesheet_id] || 0) + Math.abs(Number(p.amount));
        return acc;
      }, {});

      const wagesPayable = (unpaidTimesheets || []).reduce((sum, ts: any) => {
        const paid = timesheetPaymentsMap[ts.id] || 0;
        return sum + Math.max(0, Number(ts.total_amount) - paid);
      }, 0);

      // Get loans with calculated remaining balance
      const { data: loansData } = await supabase
        .from('loans')
        .select('id, type, principal_amount, status')
        .eq('tenant_id', tenant.id)
        .eq('status', 'active');

      // Get all loan payments
      const { data: loanPaymentsData } = await supabase
        .from('loan_payments')
        .select('loan_id, principal_amount')
        .eq('tenant_id', tenant.id);

      const loanPaymentsMap = (loanPaymentsData || []).reduce((acc: Record<string, number>, p: any) => {
        acc[p.loan_id] = (acc[p.loan_id] || 0) + Number(p.principal_amount);
        return acc;
      }, {});

      const loansPayable = (loansData || [])
        .filter((l: any) => l.type === 'payable')
        .reduce((sum: number, l: any) => {
          const paid = loanPaymentsMap[l.id] || 0;
          return sum + Math.max(0, Number(l.principal_amount) - paid);
        }, 0);

      const loansReceivable = (loansData || [])
        .filter((l: any) => l.type === 'receivable')
        .reduce((sum: number, l: any) => {
          const paid = loanPaymentsMap[l.id] || 0;
          return sum + Math.max(0, Number(l.principal_amount) - paid);
        }, 0);

      const totalPayables = vendorPayables + wagesPayable + loansPayable;

      // Get bills this month
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

      // Get timesheets this month
      const { data: timesheetsThisMonth } = await supabase
        .from('timesheets')
        .select('total_amount')
        .eq('tenant_id', tenant.id)
        .gte('date', startOfMonth.toISOString().split('T')[0]);

      const wagesThisMonth = (timesheetsThisMonth || []).reduce(
        (sum, t) => sum + Number(t.total_amount),
        0
      );

      // Get payments this month
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
        loansPayable,
        loansReceivable,
        totalPayables,
        expensesThisMonth,
        wagesThisMonth,
        paymentsThisMonth: paymentsTotal,
        unpaidBillsCount: unpaidCount || 0,
      });

      // Get recent activity
      const activity: RecentActivity[] = [];

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

      activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecentActivity(activity.slice(0, 10));

      setLoading(false);
    };

    loadDashboardData();
  }, [tenant]);

  // Render widget content
  const renderWidgetContent = (widgetId: WidgetId) => {
    const colorMap: Record<string, string> = {
      emerald: 'text-emerald-400',
      red: 'text-red-400',
      orange: 'text-orange-400',
      amber: 'text-amber-400',
      cyan: 'text-cyan-400',
      slate: 'text-slate-400',
    };

    const widget = WIDGETS[widgetId];
    const Icon = widget.icon;
    const textColor = colorMap[widget.color] || 'text-white';

    switch (widgetId) {
      case 'cashBalance':
        return (
          <Card className="bg-slate-800/50 border-slate-700 h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Cash Balance</CardTitle>
              <Wallet className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {loading ? '...' : formatCurrency(stats.cashBalance, tenant?.currency || 'USD')}
              </div>
              <p className="text-xs text-slate-500 mt-1">Available funds</p>
            </CardContent>
          </Card>
        );

      case 'totalPayables':
        return (
          <Card className="bg-slate-800/50 border-slate-700 h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Total Payables</CardTitle>
              <Users className="h-4 w-4 text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-400">
                {loading ? '...' : formatCurrency(stats.totalPayables, tenant?.currency || 'USD')}
              </div>
              <p className="text-xs text-slate-500 mt-1">Owed to vendors & employees</p>
            </CardContent>
          </Card>
        );

      case 'accountsPayable':
        return (
          <Card className="bg-slate-800/50 border-slate-700 h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Accounts Payable</CardTitle>
              <Building2 className="h-4 w-4 text-orange-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-400">
                {loading ? '...' : formatCurrency(stats.vendorPayables, tenant?.currency || 'USD')}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {stats.unpaidBillsCount} unpaid bill{stats.unpaidBillsCount !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>
        );

      case 'wagesPayable':
        return (
          <Card className="bg-slate-800/50 border-slate-700 h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Wages Payable</CardTitle>
              <Clock className="h-4 w-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-400">
                {loading ? '...' : formatCurrency(stats.wagesPayable, tenant?.currency || 'USD')}
              </div>
              <p className="text-xs text-slate-500 mt-1">Owed to employees</p>
            </CardContent>
          </Card>
        );

      case 'loansPayable':
        return (
          <Card className="bg-slate-800/50 border-slate-700 h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Loans Payable</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-400">
                {loading ? '...' : formatCurrency(stats.loansPayable, tenant?.currency || 'USD')}
              </div>
              <p className="text-xs text-slate-500 mt-1">Outstanding loan debt</p>
            </CardContent>
          </Card>
        );

      case 'loansReceivable':
        return (
          <Card className="bg-slate-800/50 border-slate-700 h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Loans Receivable</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-400">
                {loading ? '...' : formatCurrency(stats.loansReceivable, tenant?.currency || 'USD')}
              </div>
              <p className="text-xs text-slate-500 mt-1">Money owed to you</p>
            </CardContent>
          </Card>
        );

      case 'expensesThisMonth':
        return (
          <Card className="bg-slate-800/50 border-slate-700 h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Expenses (Month)</CardTitle>
              <Receipt className="h-4 w-4 text-orange-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-400">
                {loading ? '...' : formatCurrency(stats.expensesThisMonth, tenant?.currency || 'USD')}
              </div>
              <p className="text-xs text-slate-500 mt-1">From bills (accrual)</p>
            </CardContent>
          </Card>
        );

      case 'wagesThisMonth':
        return (
          <Card className="bg-slate-800/50 border-slate-700 h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Wages (Month)</CardTitle>
              <Clock className="h-4 w-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-400">
                {loading ? '...' : formatCurrency(stats.wagesThisMonth, tenant?.currency || 'USD')}
              </div>
              <p className="text-xs text-slate-500 mt-1">Employee work recorded</p>
            </CardContent>
          </Card>
        );

      case 'paymentsThisMonth':
        return (
          <Card className="bg-slate-800/50 border-slate-700 h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Payments (Month)</CardTitle>
              <CreditCard className="h-4 w-4 text-cyan-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-cyan-400">
                {loading ? '...' : formatCurrency(stats.paymentsThisMonth, tenant?.currency || 'USD')}
              </div>
              <p className="text-xs text-slate-500 mt-1">Cash paid out</p>
            </CardContent>
          </Card>
        );

      case 'recentActivity':
        return (
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
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-700/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${
                            item.type === 'bill' ? 'bg-orange-500/10 text-orange-400' :
                            item.type === 'timesheet' ? 'bg-amber-500/10 text-amber-400' :
                            'bg-cyan-500/10 text-cyan-400'
                          }`}>
                            {item.type === 'bill' ? <Receipt className="h-4 w-4" /> :
                             item.type === 'timesheet' ? <Clock className="h-4 w-4" /> :
                             <CreditCard className="h-4 w-4" />}
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
                        <div className={`font-bold ${
                          isBillOrTimesheet
                            ? item.type === 'bill' ? 'text-orange-400' : 'text-amber-400'
                            : 'text-cyan-400'
                        }`}>
                          {isBillOrTimesheet ? '+' : '-'}
                          {formatCurrency(item.amount, tenant?.currency || 'USD')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400">{tenant.name} overview</p>
        </div>
        
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                className="border-slate-600 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                onClick={savePreferences}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                Save Layout
              </Button>
            </>
          ) : (
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  <Settings2 className="h-4 w-4 mr-2" />
                  Customize
                </Button>
              </SheetTrigger>
              <SheetContent className="bg-slate-800 border-slate-700">
                <SheetHeader>
                  <SheetTitle className="text-white">Customize Dashboard</SheetTitle>
                  <SheetDescription className="text-slate-400">
                    Choose which widgets to display and rearrange them.
                  </SheetDescription>
                </SheetHeader>
                
                <div className="mt-6 space-y-4">
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-slate-300">Show/Hide Widgets</h4>
                    {Object.values(WIDGETS).map((widget) => {
                      const Icon = widget.icon;
                      return (
                        <div
                          key={widget.id}
                          className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="h-4 w-4 text-slate-400" />
                            <span className="text-white">{widget.label}</span>
                          </div>
                          <Switch
                            checked={visible[widget.id as WidgetId]}
                            onCheckedChange={() => toggleVisibility(widget.id as WidgetId)}
                          />
                        </div>
                      );
                    })}
                  </div>
                  
                  <Button
                    onClick={() => setIsEditing(true)}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-white mt-4"
                  >
                    <GripVertical className="h-4 w-4 mr-2" />
                    Rearrange Widgets
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-sm flex items-center gap-2">
          <GripVertical className="h-4 w-4" />
          Drag widgets to rearrange. Click "Save Layout" when done.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={smallCards} strategy={rectSortingStrategy}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
            {smallCards.map((widgetId) => (
              <SortableWidget key={widgetId} id={widgetId} isEditing={isEditing}>
                {renderWidgetContent(widgetId)}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>

        <SortableContext items={fullWidthCards} strategy={rectSortingStrategy}>
          <div className="space-y-4">
            {fullWidthCards.map((widgetId) => (
              <SortableWidget key={widgetId} id={widgetId} isEditing={isEditing}>
                {renderWidgetContent(widgetId)}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
