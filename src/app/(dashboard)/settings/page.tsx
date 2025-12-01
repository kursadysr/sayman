'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Separator } from '@/components/ui/separator';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import type { Account, AccountType } from '@/lib/supabase/types';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils/format';

const tenantFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  currency: z.string(),
  address: z.string().optional(),
  tax_id: z.string().optional(),
  footer_note: z.string().optional(),
});

const accountFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['bank', 'cash', 'credit']),
  balance: z.number(),
});

type TenantFormValues = z.infer<typeof tenantFormSchema>;
type AccountFormValues = z.infer<typeof accountFormSchema>;

export default function SettingsPage() {
  const { tenant, setCurrentTenant } = useTenant();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);

  const tenantForm = useForm<TenantFormValues>({
    resolver: zodResolver(tenantFormSchema),
    defaultValues: {
      name: '',
      currency: 'USD',
      address: '',
      tax_id: '',
      footer_note: '',
    },
  });

  const accountForm = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      name: '',
      type: 'bank',
      balance: 0,
    },
  });

  useEffect(() => {
    if (!tenant) return;

    tenantForm.reset({
      name: tenant.name,
      currency: tenant.currency,
      address: tenant.address_details?.address || '',
      tax_id: tenant.address_details?.tax_id || '',
      footer_note: tenant.address_details?.footer_note || '',
    });

    loadAccounts();
  }, [tenant, tenantForm]);

  const loadAccounts = async () => {
    if (!tenant) return;

    const supabase = createClient();
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('name');

    setAccounts((data || []) as Account[]);
  };

  const onSaveTenant = async (values: TenantFormValues) => {
    if (!tenant) return;

    setLoading(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from('tenants')
        .update({
          name: values.name,
          currency: values.currency,
          address_details: {
            address: values.address,
            tax_id: values.tax_id,
            footer_note: values.footer_note,
          },
        })
        .eq('id', tenant.id)
        .select()
        .single();

      if (error) throw error;

      setCurrentTenant(data);
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const onAddAccount = async (values: AccountFormValues) => {
    if (!tenant) return;

    setLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase.from('accounts').insert({
        tenant_id: tenant.id,
        name: values.name,
        type: values.type,
        balance: values.balance,
      });

      if (error) throw error;

      toast.success('Account added successfully');
      accountForm.reset();
      setShowAddAccount(false);
      loadAccounts();
    } catch (error) {
      console.error('Error adding account:', error);
      toast.error('Failed to add account');
    } finally {
      setLoading(false);
    }
  };

  const onDeleteAccount = async (accountId: string) => {
    if (!confirm('Are you sure you want to delete this account?')) return;

    const supabase = createClient();
    const { error } = await supabase.from('accounts').delete().eq('id', accountId);

    if (error) {
      toast.error('Failed to delete account');
      return;
    }

    toast.success('Account deleted');
    loadAccounts();
  };

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-slate-400">Select a workspace to continue</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 pb-24 lg:pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400">Manage your workspace settings</p>
      </div>

      {/* Workspace Settings */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Workspace Settings</CardTitle>
          <CardDescription className="text-slate-400">
            Update your organization details for invoices and reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...tenantForm}>
            <form onSubmit={tenantForm.handleSubmit(onSaveTenant)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={tenantForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          className="bg-slate-700/50 border-slate-600 text-white"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={tenantForm.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Currency</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="USD" className="text-white">USD ($)</SelectItem>
                          <SelectItem value="EUR" className="text-white">EUR (€)</SelectItem>
                          <SelectItem value="GBP" className="text-white">GBP (£)</SelectItem>
                          <SelectItem value="TRY" className="text-white">TRY (₺)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={tenantForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Address</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Your business address"
                        {...field}
                        className="bg-slate-700/50 border-slate-600 text-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={tenantForm.control}
                name="tax_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Tax ID</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Tax ID / VAT Number"
                        {...field}
                        className="bg-slate-700/50 border-slate-600 text-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={tenantForm.control}
                name="footer_note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Invoice Footer Note</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Thank you for your business!"
                        {...field}
                        className="bg-slate-700/50 border-slate-600 text-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={loading}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                <Save className="mr-2 h-4 w-4" />
                {loading ? 'Saving...' : 'Save Settings'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Accounts */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white">Accounts</CardTitle>
              <CardDescription className="text-slate-400">
                Manage your bank accounts, cash, and credit cards.
              </CardDescription>
            </div>
            <Button
              onClick={() => setShowAddAccount(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Account
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showAddAccount && (
            <div className="mb-6 p-4 rounded-lg bg-slate-700/30">
              <Form {...accountForm}>
                <form onSubmit={accountForm.handleSubmit(onAddAccount)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={accountForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-300">Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Account name"
                              {...field}
                              className="bg-slate-700/50 border-slate-600 text-white"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={accountForm.control}
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
                              <SelectItem value="bank" className="text-white">Bank</SelectItem>
                              <SelectItem value="cash" className="text-white">Cash</SelectItem>
                              <SelectItem value="credit" className="text-white">Credit Card</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={accountForm.control}
                      name="balance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-300">Initial Balance</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              className="bg-slate-700/50 border-slate-600 text-white"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      disabled={loading}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white"
                    >
                      Add Account
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowAddAccount(false)}
                      className="border-slate-600 text-slate-300"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          )}

          <div className="space-y-2">
            {accounts.length === 0 ? (
              <p className="text-slate-400 text-center py-4">No accounts yet.</p>
            ) : (
              accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-slate-700/30"
                >
                  <div>
                    <p className="font-medium text-white">{account.name}</p>
                    <p className="text-sm text-slate-400 capitalize">{account.type}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="font-bold text-white">
                      {formatCurrency(account.balance, tenant.currency)}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteAccount(account.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

