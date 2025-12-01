import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Tenant } from '@/lib/supabase/types';

interface TenantState {
  currentTenant: Tenant | null;
  tenants: Tenant[];
  setCurrentTenant: (tenant: Tenant | null) => void;
  setTenants: (tenants: Tenant[]) => void;
  clearTenant: () => void;
}

export const useTenantStore = create<TenantState>()(
  persist(
    (set) => ({
      currentTenant: null,
      tenants: [],
      setCurrentTenant: (tenant) => set({ currentTenant: tenant }),
      setTenants: (tenants) => set({ tenants }),
      clearTenant: () => set({ currentTenant: null, tenants: [] }),
    }),
    {
      name: 'sayman-tenant',
      partialize: (state) => ({ 
        currentTenant: state.currentTenant,
      }),
    }
  )
);

