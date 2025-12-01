'use client';

import { useTenantStore } from '@/lib/store/tenant-store';

export function useTenant() {
  const { currentTenant, tenants, setCurrentTenant, setTenants, clearTenant } = useTenantStore();

  return {
    tenant: currentTenant,
    tenantId: currentTenant?.id ?? null,
    tenants,
    setCurrentTenant,
    setTenants,
    clearTenant,
  };
}

