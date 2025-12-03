'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowLeftRight,
  FileText,
  Receipt,
  Users,
  Settings,
  LogOut,
  Menu,
  Plus,
  Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { TenantSwitcher } from '@/components/shared/tenant-switcher';
import { useTenant } from '@/hooks/use-tenant';
import { useTenantStore } from '@/lib/store/tenant-store';
import { createClient } from '@/lib/supabase/client';
import type { Tenant } from '@/lib/supabase/types';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Transactions', href: '/transactions', icon: ArrowLeftRight },
  { name: 'Bills', href: '/bills', icon: Receipt },
  { name: 'Items', href: '/items', icon: Package },
  { name: 'Invoices', href: '/invoices', icon: FileText },
  { name: 'Contacts', href: '/contacts', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
];

interface AppShellProps {
  children: React.ReactNode;
  onAddClick?: () => void;
}

export function AppShell({ children, onAddClick }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { tenant, tenants, setTenants, setCurrentTenant } = useTenant();
  const hasHydrated = useTenantStore((state) => state.hasHydrated);

  // Load tenants after store hydration
  useEffect(() => {
    if (!hasHydrated) return;

    const loadTenants = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: tenantUsers } = await supabase
        .from('tenant_users')
        .select('tenant:tenants(*)')
        .eq('user_id', user.id);

      if (tenantUsers && tenantUsers.length > 0) {
        const loadedTenants = tenantUsers
          .map((tu) => tu.tenant as unknown as Tenant)
          .filter(Boolean);
        
        setTenants(loadedTenants);
        
        // Check if current tenant (from localStorage) is still valid
        const currentIsValid = tenant && loadedTenants.some(t => t.id === tenant.id);
        if (!currentIsValid && loadedTenants.length > 0) {
          setCurrentTenant(loadedTenants[0]);
        }
      } else {
        // Clear any stale tenant data for users with no tenants
        setTenants([]);
        setCurrentTenant(null);
      }
    };

    loadTenants();
  }, [hasHydrated, router, setTenants, setCurrentTenant, tenant]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 border-r border-slate-700/50 bg-slate-900/50 backdrop-blur-xl lg:block">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-2 border-b border-slate-700/50 px-6">
            <span className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Sayman
            </span>
          </div>

          {/* Tenant Switcher */}
          <div className="p-4">
            <TenantSwitcher />
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Sign Out */}
          <div className="border-t border-slate-700/50 p-4">
            <Button
              variant="ghost"
              onClick={handleSignOut}
              className="w-full justify-start text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="fixed top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-xl px-4 lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 bg-slate-900 border-slate-700 p-0">
            <div className="flex h-full flex-col">
              <div className="flex h-16 items-center gap-2 border-b border-slate-700/50 px-6">
                <span className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  Sayman
                </span>
              </div>
              <div className="p-4">
                <TenantSwitcher />
              </div>
              <nav className="flex-1 space-y-1 px-3 py-2">
                {navigation.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
              <div className="border-t border-slate-700/50 p-4">
                <Button
                  variant="ghost"
                  onClick={handleSignOut}
                  className="w-full justify-start text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  <LogOut className="mr-3 h-5 w-5" />
                  Sign Out
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          Sayman
        </span>

        {onAddClick && (
          <Button
            size="icon"
            onClick={onAddClick}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            <Plus className="h-5 w-5" />
          </Button>
        )}
      </header>

      {/* Main Content */}
      <main className="lg:pl-64">
        <div className="min-h-screen pt-16 lg:pt-0">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-slate-700/50 bg-slate-900/80 backdrop-blur-xl lg:hidden">
        {navigation.slice(0, 5).map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2',
                isActive ? 'text-emerald-400' : 'text-slate-400'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-xs">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

