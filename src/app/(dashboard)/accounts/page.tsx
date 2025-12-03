'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Wallet, Building, CreditCard, Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTenant } from '@/hooks/use-tenant';
import { useRole } from '@/hooks/use-role';
import { createClient } from '@/lib/supabase/client';
import type { Account } from '@/lib/supabase/types';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils/format';

const accountFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['bank', 'cash', 'credit']),
  balance: z.number(),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

const typeIcons = {
  bank: Building,
  cash: Banknote,
  credit: CreditCard,
};

export default function AccountsPage() {
  const { tenant } = useTenant();
  const { canWrite } = useRole();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      name: '',
      type: 'bank',
      balance: 0,
    },
  });

  const loadAccounts = useCallback(async () => {
    if (!tenant) return;

    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('name');

    setAccounts((data || []) as Account[]);
    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const onAddAccount = async (values: AccountFormValues) => {
    if (!tenant) return;

    setSaving(true);
    const supabase = createClient();

    try {
      const { error } = await supabase.from('accounts').insert({
        tenant_id: tenant.id,
        name: values.name,
        type: values.type,
        balance: values.balance,
      });

      if (error) throw error;

      toast.success('Account added');
      form.reset();
      setDialogOpen(false);
      loadAccounts();
    } catch (error) {
      console.error('Error adding account:', error);
      toast.error('Failed to add account');
    } finally {
      setSaving(false);
    }
  };

  const onDeleteAccount = async (accountId: string) => {
    if (!confirm('Delete this account?')) return;

    const supabase = createClient();
    const { error } = await supabase.from('accounts').delete().eq('id', accountId);

    if (error) {
      toast.error('Failed to delete account');
      return;
    }

    toast.success('Account deleted');
    loadAccounts();
  };

  const totalBalance = accounts.reduce((sum, acc) => sum + Number(acc.balance), 0);

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
          <h1 className="text-2xl font-bold text-white">Accounts</h1>
          <p className="text-slate-400">Manage your bank accounts, cash & credit cards</p>
        </div>
        {canWrite && (
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Account
          </Button>
        )}
      </div>

      {/* Total Balance Card */}
      <Card className="bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border-emerald-500/30 mb-6">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-emerald-500/20">
              <Wallet className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Total Balance</p>
              <p className="text-3xl font-bold text-white">
                {formatCurrency(totalBalance, tenant.currency)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Accounts List */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading...</div>
          ) : accounts.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No accounts yet.</p>
              <p className="text-sm mt-2">Add your first account to start tracking.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {accounts.map((account) => {
                const Icon = typeIcons[account.type];
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-full bg-slate-700/50">
                        <Icon className="h-5 w-5 text-slate-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">{account.name}</p>
                        <p className="text-sm text-slate-400 capitalize">{account.type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className={`text-lg font-bold ${account.balance >= 0 ? 'text-white' : 'text-red-400'}`}>
                        {formatCurrency(account.balance, tenant.currency)}
                      </p>
                      {canWrite && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDeleteAccount(account.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Account Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Add Account</DialogTitle>
            <DialogDescription className="text-slate-400">
              Add a new bank account, cash, or credit card.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onAddAccount)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Chase Checking"
                        {...field}
                        className="bg-slate-700/50 border-slate-600 text-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="bank" className="text-white">Bank Account</SelectItem>
                        <SelectItem value="cash" className="text-white">Cash</SelectItem>
                        <SelectItem value="credit" className="text-white">Credit Card</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="balance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Current Balance</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        className="bg-slate-700/50 border-slate-600 text-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  className="border-slate-600 text-slate-300"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  {saving ? 'Adding...' : 'Add Account'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

