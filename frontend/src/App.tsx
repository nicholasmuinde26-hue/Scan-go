import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage.js';
import { CustomerLoginPage } from './pages/CustomerLoginPage.js';
import { CustomerRegisterPage } from './pages/CustomerRegisterPage.js';
import { StaffLoginPage } from './pages/StaffLoginPage.js';
import { PlatformAdminLoginPage } from './pages/PlatformAdminLoginPage.js';
import { AcceptInvitePage } from './pages/AcceptInvitePage.js';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.js';
import { PortalSwitcher, PortalType } from './components/PortalSwitcher.js';
import { CustomerPortal } from './portals/CustomerPortal/CustomerPortal.js';
import { StaffPickerPortal } from './portals/StaffPickerPortal/StaffPickerPortal.js';
import { ExitOfficerPortal } from './portals/ExitOfficerPortal/ExitOfficerPortal.js';
import { SupervisorPortal } from './portals/SupervisorPortal/SupervisorPortal.js';
import { AdminPortal } from './portals/AdminPortal/AdminPortal.js';
import { User, Store, Product } from './types.js';
import { apiRequest, setToken, clearToken, getToken } from './api.js';
import { CardPaymentReturnPage } from './pages/CardPaymentReturnPage.js';
import { EnterStorePage } from './pages/EnterStorePage.js';

const KNOWN_PORTALS: PortalType[] = ['CUSTOMER', 'STAFF_PICKER', 'EXIT_OFFICER', 'SUPERVISOR', 'ADMIN'];

// Keep only portals this frontend can render, and make sure the default is one of them.
function normalizePortals(allowed: unknown, preferred?: unknown): { list: PortalType[]; current: PortalType } {
  const list = (Array.isArray(allowed) ? allowed : []).filter((p): p is PortalType =>
    KNOWN_PORTALS.includes(p as PortalType)
  );
  const current = list.includes(preferred as PortalType) ? (preferred as PortalType) : list[0];
  return { list, current };
}

function MainAppShell({
  currentUser,
  currentStore,
  stores,
  products,
  currentPortal,
  allowedPortals,
  onSelectPortal,
  onSelectStore,
  onLogout,
  onRefreshStores,
}: {
  currentUser: User | null;
  currentStore: Store | null;
  stores: Store[];
  products: Product[];
  currentPortal: PortalType;
  allowedPortals: PortalType[];
  onSelectPortal: (portal: PortalType) => void;
  onSelectStore: (store: Store) => void;
  onLogout: () => void;
  onRefreshStores: () => void;
}) {
  const [customerCartCount, setCustomerCartCount] = useState(0);

  useEffect(() => {
    if (currentPortal !== 'CUSTOMER') return;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [currentPortal]);

  const handleStoreChange = (store: Store) => {
    if (store._id === currentStore?._id) return true;
    if (currentPortal === 'CUSTOMER' && customerCartCount > 0 && !window.confirm('Switching branches will clear the items in your current basket. Continue?')) return false;
    setCustomerCartCount(0);
    onSelectStore(store);
    return true;
  };

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (allowedPortals.length === 0) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-sm text-center space-y-3">
          <p className="text-sm font-bold text-navy-800">No portal available for your role</p>
          <p className="text-xs text-slate-500">Your account ({currentUser.role}) has no dashboard assigned yet.</p>
          <button onClick={onLogout} className="text-xs font-bold text-rose-600 hover:underline">Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-slate-100 flex flex-col font-sans ${currentPortal === 'CUSTOMER' ? 'customer-app-shell overflow-hidden' : 'min-h-screen'}`}>
      <PortalSwitcher
        currentPortal={currentPortal}
        onSelectPortal={onSelectPortal}
        currentUser={currentUser}
        currentStore={currentStore}
        stores={stores}
        onSelectStore={handleStoreChange}
        allowedPortals={allowedPortals}
        onLogout={onLogout}
      />

      <main className={`flex-1 ${currentPortal === 'CUSTOMER' ? 'min-h-0 overflow-hidden flex flex-col' : 'pb-12'}`}>
        {currentPortal === 'CUSTOMER' && allowedPortals.includes('CUSTOMER') && currentStore && (
          <CustomerPortal
            currentUser={currentUser}
            currentStore={currentStore}
            products={products}
            stores={stores}
            onSelectStore={handleStoreChange}
            onCartCountChange={setCustomerCartCount}
            onLogout={onLogout}
          />
        )}

        {currentPortal === 'STAFF_PICKER' && allowedPortals.includes('STAFF_PICKER') && currentStore && (
          <StaffPickerPortal currentStore={currentStore} currentUser={currentUser} products={products} />
        )}

        {currentPortal === 'EXIT_OFFICER' && allowedPortals.includes('EXIT_OFFICER') && currentStore && (
          <ExitOfficerPortal currentStore={currentStore} currentUser={currentUser} products={products} />
        )}

        {currentPortal === 'SUPERVISOR' && allowedPortals.includes('SUPERVISOR') && currentStore && (
          <SupervisorPortal currentStore={currentStore} currentUser={currentUser} products={products} />
        )}

        {currentPortal === 'ADMIN' && allowedPortals.includes('ADMIN') && currentStore && (
          <AdminPortal
            currentStore={currentStore}
            products={products}
            currentUser={currentUser}
            stores={stores}
            onRefreshStores={onRefreshStores}
          />
        )}
      </main>
    </div>
  );
}

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allowedPortals, setAllowedPortals] = useState<PortalType[]>([]);
  const [currentPortal, setCurrentPortal] = useState<PortalType>('CUSTOMER');
  const [stores, setStores] = useState<Store[]>([]);
  const [currentStore, setCurrentStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);


  // Branch staff only ever see their own branch; org staff only their organization's branches.
  // Shoppers and platform staff keep the free choice. (The server enforces this too.)
  const applyStoreScope = (user: User, storeList: Store[], preferred: Store | null): Store | null => {
    const isBranchStaff = ['BRANCH_MANAGER', 'STORE_MANAGER', 'STOCK_CONTROLLER', 'STOCK_MANAGER', 'SUPERVISOR', 'PICKER',
      'PACKER_VERIFIER', 'EXIT_OFFICER', 'EXIT_STAFF', 'CASHIER_CUSTOMER_SERVICE', 'DELIVERY_COLLECTION_HANDOVER'].includes(user.role);
    const isOrgStaff = ['ORG_OWNER', 'ORG_ADMIN', 'FINANCE_OFFICER', 'CATALOGUE_INVENTORY_MANAGER', 'MARKETING_MANAGER',
      'LOSS_PREVENTION_MANAGER', 'ORG_AUDITOR'].includes(user.role);
    if (isBranchStaff) {
      const own = storeList.filter((st) => st._id === user.storeId);
      setStores(own);
      return own[0] || null;
    }
    if (isOrgStaff) {
      const mine = storeList.filter((st: any) => (st.organizationId?._id || st.organizationId) === user.organizationId);
      setStores(mine);
      return mine.find((st) => st._id === preferred?._id) || mine[0] || null;
    }
    return preferred;
  };

  const initialize = async () => {
    try {
      setLoading(true);

      // 1. Fetch Stores
      const storesRes = await apiRequest('/stores');
      const storeList = storesRes.stores || [];
      setStores(storeList);
      const savedStoreId = localStorage.getItem('customerStoreId');
      const activeStore = storeList.find((st: Store) => st._id === savedStoreId) || storeList[0] || null;
      setCurrentStore(activeStore);

      // 2. Fetch Products
      if (activeStore) {
        const prodRes = await apiRequest(`/products?storeId=${activeStore._id}`);
        setProducts(prodRes.products || []);
      }

      // 3. Verify session
      const token = getToken();
      if (token) {
        const meRes = await apiRequest('/auth/me');
        if (meRes?.user) {
          setCurrentUser(meRes.user);
          const scoped = applyStoreScope(meRes.user, storeList, activeStore);
          if (scoped && scoped._id !== activeStore?._id) {
            setCurrentStore(scoped);
            const scopedProducts = await apiRequest(`/products?storeId=${scoped._id}`);
            setProducts(scopedProducts.products || []);
          }
          const { list, current } = normalizePortals(meRes.allowedPortals, meRes.defaultPortal);
          setAllowedPortals(list);
          if (current) setCurrentPortal(current);
        }
      }
    } catch {
      clearToken();
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initialize();
  }, []);

  const handleLoginSuccess = (
    user: User,
    token: string,
    allowed: string[],
    defaultPortal: string
  ) => {
    setToken(token);
    setCurrentUser(user);
    const scoped = applyStoreScope(user, stores, currentStore);
    if (scoped && scoped._id !== currentStore?._id) {
      void handleSelectStore(scoped);
    }
    const { list, current } = normalizePortals(allowed, defaultPortal);
    setAllowedPortals(list);
    if (current) setCurrentPortal(current);
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    clearToken();
    setCurrentUser(null);
    setAllowedPortals([]);
    setCurrentPortal('CUSTOMER');
    // Restore the full public store list that a staff scope may have narrowed.
    apiRequest('/stores').then((r) => setStores(r.stores || [])).catch(() => {});
  };

  const handleSelectStore = async (store: Store) => {
    if (currentUser && !stores.some((st) => st._id === store._id)) return;
    setCurrentStore(store);
    localStorage.setItem('customerStoreId', store._id);
    try {
      const prodRes = await apiRequest(`/products?storeId=${store._id}`);
      setProducts(prodRes.products || []);
    } catch {
      setProducts([]);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-800 flex items-center justify-center p-4">
        <div className="text-xs font-bold text-slate-400 tracking-wider uppercase animate-pulse">
          Initializing Secure Session...
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Landing Page */}
        <Route path="/" element={<LandingPage />} />

        {/* Customer Only Auth */}
        <Route path="/login" element={<CustomerLoginPage onLoginSuccess={handleLoginSuccess} />} />
        <Route path="/register" element={<CustomerRegisterPage onLoginSuccess={handleLoginSuccess} />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ForgotPasswordPage />} />
        <Route path="/payment/return" element={<CardPaymentReturnPage />} />

        {/* In-store QR poster landing: checks the shopper in, then opens Scan & Go */}
        <Route path="/enter" element={<EnterStorePage currentUser={currentUser} stores={stores} onSelectStore={handleSelectStore} />} />

        {/* Staff Only Auth */}
        <Route path="/staff" element={<StaffLoginPage onLoginSuccess={handleLoginSuccess} />} />

        {/* Platform Root Admin Only Auth */}
        <Route path="/admin" element={<PlatformAdminLoginPage onLoginSuccess={handleLoginSuccess} />} />

        {/* Single-Use Invitation Acceptance */}
        <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />

        {/* Authenticated Application Shell */}
        <Route
          path="/app/*"
          element={
            <MainAppShell
              currentUser={currentUser}
              currentStore={currentStore}
              stores={stores}
              products={products}
              currentPortal={currentPortal}
              allowedPortals={allowedPortals}
              onSelectPortal={(p) => {
                if (allowedPortals.includes(p)) setCurrentPortal(p);
              }}
              onSelectStore={handleSelectStore}
              onLogout={handleLogout}
              onRefreshStores={initialize}
            />
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
/ /   w e b h o o k   t e s t  
 