import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Tenant } from '@/lib/supabase/types';

interface TenantState {
  currentTenant: Tenant | null;
  tenants: Tenant[];
  hasHydrated: boolean;
  setCurrentTenant: (tenant: Tenant | null) => void;
  setTenants: (tenants: Tenant[]) => void;
  clearTenant: () => void;
  setHasHydrated: (state: boolean) => void;
}

export const useTenantStore = create<TenantState>()(
  persist(
    (set) => ({
      currentTenant: null,
      tenants: [],
      hasHydrated: false,
      setCurrentTenant: (tenant) => set({ currentTenant: tenant }),
      setTenants: (tenants) => set({ tenants }),
      clearTenant: () => set({ currentTenant: null, tenants: [] }),
      setHasHydrated: (state) => set({ hasHydrated: state }),
    }),
    {
      name: 'sayman-tenant',
      partialize: (state) => ({ 
        currentTenant: state.currentTenant,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
