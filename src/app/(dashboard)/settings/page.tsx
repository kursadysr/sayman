'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, Plus, Trash2, UserPlus, Crown, Shield, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

const tenantFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  currency: z.string(),
  address: z.string().optional(),
  tax_id: z.string().optional(),
  footer_note: z.string().optional(),
});

const memberFormSchema = z.object({
  email: z.string().email('Valid email required'),
  role: z.enum(['manager', 'viewer']),
});

type TenantFormValues = z.infer<typeof tenantFormSchema>;
type MemberFormValues = z.infer<typeof memberFormSchema>;

interface Member {
  id: string;
  user_id: string;
  role: 'owner' | 'manager' | 'viewer';
  profile: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
}

const roleIcons = {
  owner: Crown,
  manager: Shield,
  viewer: Eye,
};

const roleColors = {
  owner: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  manager: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  viewer: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export default function SettingsPage() {
  const { tenant, setCurrentTenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addingMember, setAddingMember] = useState(false);

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

  const memberForm = useForm<MemberFormValues>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: {
      email: '',
      role: 'viewer',
    },
  });

  const loadMembers = useCallback(async () => {
    if (!tenant) return;

    const supabase = createClient();
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);

    // Get tenant users first
    const { data: tenantUsers } = await supabase
      .from('tenant_users')
      .select('id, user_id, role')
      .eq('tenant_id', tenant.id);

    if (!tenantUsers || tenantUsers.length === 0) {
      setMembers([]);
      return;
    }

    // Get profiles for these users
    const userIds = tenantUsers.map(tu => tu.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', userIds);

    // Combine the data
    const membersData: Member[] = tenantUsers.map(tu => ({
      id: tu.id,
      user_id: tu.user_id,
      role: tu.role as 'owner' | 'manager' | 'viewer',
      profile: profiles?.find(p => p.id === tu.user_id) || null,
    }));

    setMembers(membersData);
  }, [tenant]);

  useEffect(() => {
    if (!tenant) return;

    tenantForm.reset({
      name: tenant.name,
      currency: tenant.currency,
      address: tenant.address_details?.address || '',
      tax_id: tenant.address_details?.tax_id || '',
      footer_note: tenant.address_details?.footer_note || '',
    });

    loadMembers();
  }, [tenant, tenantForm, loadMembers]);

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
      toast.success('Settings saved');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const onAddMember = async (values: MemberFormValues) => {
    if (!tenant) return;

    setAddingMember(true);
    const supabase = createClient();

    try {
      // Find user by email
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', values.email)
        .single();

      if (profileError || !profile) {
        toast.error('User not found. They must sign up first.');
        setAddingMember(false);
        return;
      }

      // Check if already a member
      const existing = members.find(m => m.user_id === profile.id);
      if (existing) {
        toast.error('User is already a member');
        setAddingMember(false);
        return;
      }

      // Add to tenant
      const { error } = await supabase.from('tenant_users').insert({
        tenant_id: tenant.id,
        user_id: profile.id,
        role: values.role,
      });

      if (error) throw error;

      toast.success('Member added');
      memberForm.reset();
      setDialogOpen(false);
      loadMembers();
    } catch (error) {
      console.error('Error adding member:', error);
      toast.error('Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  const onRemoveMember = async (memberId: string, memberRole: string) => {
    if (memberRole === 'owner') {
      toast.error('Cannot remove the owner');
      return;
    }

    if (!confirm('Remove this member from the workspace?')) return;

    const supabase = createClient();
    const { error } = await supabase
      .from('tenant_users')
      .delete()
      .eq('id', memberId);

    if (error) {
      toast.error('Failed to remove member');
      return;
    }

    toast.success('Member removed');
    loadMembers();
  };

  const onChangeRole = async (memberId: string, newRole: 'owner' | 'manager' | 'viewer') => {
    const supabase = createClient();
    
    // If transferring ownership
    if (newRole === 'owner') {
      if (!confirm('Transfer ownership? You will become a manager.')) return;
      
      // Find current owner's membership id
      const currentOwner = members.find(m => m.role === 'owner');
      if (!currentOwner) return;
      
      // Update new owner
      const { error: newOwnerError } = await supabase
        .from('tenant_users')
        .update({ role: 'owner' })
        .eq('id', memberId);
      
      if (newOwnerError) {
        toast.error('Failed to transfer ownership');
        return;
      }
      
      // Demote current owner to manager
      const { error: demoteError } = await supabase
        .from('tenant_users')
        .update({ role: 'manager' })
        .eq('id', currentOwner.id);
      
      if (demoteError) {
        toast.error('Ownership transferred but failed to update your role');
        loadMembers();
        return;
      }
      
      toast.success('Ownership transferred');
      loadMembers();
      return;
    }
    
    const { error } = await supabase
      .from('tenant_users')
      .update({ role: newRole })
      .eq('id', memberId);

    if (error) {
      toast.error('Failed to update role');
      return;
    }

    toast.success('Role updated');
    loadMembers();
  };

  // Check if current user is owner
  const isOwner = members.find(m => m.user_id === currentUserId)?.role === 'owner';

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
          <CardTitle className="text-white">Workspace Details</CardTitle>
          <CardDescription className="text-slate-400">
            Organization details for invoices and reports.
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

      {/* Members */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white">Members</CardTitle>
              <CardDescription className="text-slate-400">
                People who have access to this workspace.
              </CardDescription>
            </div>
            {isOwner && (
              <Button
                onClick={() => setDialogOpen(true)}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Add Member
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {members.length === 0 ? (
              <p className="text-slate-400 text-center py-4">Loading...</p>
            ) : (
              members.map((member) => {
                const RoleIcon = roleIcons[member.role];
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-slate-700/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-white font-medium">
                        {(member.profile?.full_name || member.profile?.email || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-white">
                          {member.profile?.full_name || member.profile?.email}
                        </p>
                        <p className="text-sm text-slate-400">{member.profile?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isOwner && member.role !== 'owner' ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => onChangeRole(member.id, value as 'owner' | 'manager' | 'viewer')}
                        >
                          <SelectTrigger className="w-32 bg-slate-700/50 border-slate-600 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="owner" className="text-white">
                              <div className="flex items-center gap-2">
                                <Crown className="h-3 w-3" />
                                Owner
                              </div>
                            </SelectItem>
                            <SelectItem value="manager" className="text-white">
                              <div className="flex items-center gap-2">
                                <Shield className="h-3 w-3" />
                                Manager
                              </div>
                            </SelectItem>
                            <SelectItem value="viewer" className="text-white">
                              <div className="flex items-center gap-2">
                                <Eye className="h-3 w-3" />
                                Viewer
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={`${roleColors[member.role]} border`}>
                          <RoleIcon className="h-3 w-3 mr-1" />
                          {member.role}
                        </Badge>
                      )}
                      {isOwner && member.role !== 'owner' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRemoveMember(member.id, member.role)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add Member Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
            <DialogDescription className="text-slate-400">
              Invite someone to this workspace by their email.
            </DialogDescription>
          </DialogHeader>

          <Form {...memberForm}>
            <form onSubmit={memberForm.handleSubmit(onAddMember)} className="space-y-4">
              <FormField
                control={memberForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="user@example.com"
                        {...field}
                        className="bg-slate-700/50 border-slate-600 text-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={memberForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="manager" className="text-white">
                          Manager - Can edit everything
                        </SelectItem>
                        <SelectItem value="viewer" className="text-white">
                          Viewer - Read-only access
                        </SelectItem>
                      </SelectContent>
                    </Select>
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
                  disabled={addingMember}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  {addingMember ? 'Adding...' : 'Add Member'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
