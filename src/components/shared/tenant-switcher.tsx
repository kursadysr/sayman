'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, Plus, Building2, User, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import type { TenantType } from '@/lib/supabase/types';

const tenantTypeIcons = {
  personal: User,
  retail: Building2,
  service: Briefcase,
};

export function TenantSwitcher() {
  const { tenant, tenants, setCurrentTenant, setTenants } = useTenant();
  const [showNewTenantDialog, setShowNewTenantDialog] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantType, setNewTenantType] = useState<TenantType>('personal');
  const [newTenantCurrency, setNewTenantCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);

  const handleCreateTenant = async () => {
    if (!newTenantName.trim()) return;
    
    setLoading(true);
    const supabase = createClient();
    
    // Debug: Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    console.log('Current user:', user?.id);
    
    if (!user) {
      console.error('No authenticated user found');
      setLoading(false);
      return;
    }
    
    // Create tenant with owner (uses DB function to bypass RLS race condition)
    const { data: newTenant, error: tenantError } = await supabase
      .rpc('create_tenant_with_owner', {
        p_name: newTenantName,
        p_type: newTenantType,
        p_currency: newTenantCurrency,
      });

    if (tenantError || !newTenant) {
      console.error('Error creating tenant:', JSON.stringify(tenantError));
      setLoading(false);
      return;
    }

    // Create default cash account
    await supabase.from('accounts').insert({
      tenant_id: newTenant.id,
      name: 'Cash',
      type: 'cash',
    });

    // Update state
    setTenants([...tenants, newTenant]);
    setCurrentTenant(newTenant);
    
    // Reset form
    setNewTenantName('');
    setNewTenantType('personal');
    setNewTenantCurrency('USD');
    setShowNewTenantDialog(false);
    setLoading(false);
  };

  const Icon = tenant ? tenantTypeIcons[tenant.type] : User;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className="w-[200px] justify-between bg-slate-800/50 border-slate-700 text-white hover:bg-slate-700 hover:text-white"
          >
            <div className="flex items-center gap-2 truncate">
              <Icon className="h-4 w-4 text-emerald-400" />
              <span className="truncate">{tenant?.name || 'Select workspace'}</span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[200px] bg-slate-800 border-slate-700">
          {tenants.map((t) => {
            const TIcon = tenantTypeIcons[t.type];
            return (
              <DropdownMenuItem
                key={t.id}
                onClick={() => setCurrentTenant(t)}
                className="text-white hover:bg-slate-700 focus:bg-slate-700"
              >
                <TIcon className="mr-2 h-4 w-4 text-slate-400" />
                <span className="truncate">{t.name}</span>
                {tenant?.id === t.id && (
                  <Check className="ml-auto h-4 w-4 text-emerald-400" />
                )}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator className="bg-slate-700" />
          <DropdownMenuItem
            onClick={() => setShowNewTenantDialog(true)}
            className="text-emerald-400 hover:bg-slate-700 focus:bg-slate-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showNewTenantDialog} onOpenChange={setShowNewTenantDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Create New Workspace</DialogTitle>
            <DialogDescription className="text-slate-400">
              Add a new organization or personal workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-300">Name</Label>
              <Input
                id="name"
                placeholder="My Business"
                value={newTenantName}
                onChange={(e) => setNewTenantName(e.target.value)}
                className="bg-slate-700/50 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type" className="text-slate-300">Type</Label>
              <Select value={newTenantType} onValueChange={(v) => setNewTenantType(v as TenantType)}>
                <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="personal" className="text-white">Personal</SelectItem>
                  <SelectItem value="retail" className="text-white">Retail Business</SelectItem>
                  <SelectItem value="service" className="text-white">Service/Agency</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency" className="text-slate-300">Currency</Label>
              <Select value={newTenantCurrency} onValueChange={setNewTenantCurrency}>
                <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="USD" className="text-white">USD ($)</SelectItem>
                  <SelectItem value="EUR" className="text-white">EUR (€)</SelectItem>
                  <SelectItem value="GBP" className="text-white">GBP (£)</SelectItem>
                  <SelectItem value="TRY" className="text-white">TRY (₺)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewTenantDialog(false)}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTenant}
              disabled={loading || !newTenantName.trim()}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {loading ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

