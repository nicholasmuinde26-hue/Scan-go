import React from 'react';
import { SuperAdminDashboard } from './SuperAdminDashboard.js';
import { User, Store } from '../../types.js';

interface SuperAdminPortalProps {
  currentUser?: User | null;
  currentStore?: Store | null;
  onRefreshStores?: () => void;
  onLogout?: () => void;
}

export const SuperAdminPortal: React.FC<SuperAdminPortalProps> = ({
  currentUser = null,
  currentStore = null,
  onRefreshStores,
  onLogout,
}) => {
  return (
    <SuperAdminDashboard
      currentUser={currentUser}
      currentStore={currentStore}
      onRefreshStores={onRefreshStores}
      onLogout={onLogout}
    />
  );
};

export default SuperAdminPortal;
