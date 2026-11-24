import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Product, Store, User } from '../../types.js';
import { apiRequest, formatKes } from '../../api.js';
import { useLiveOrderEvents } from '../../hooks/useLiveOrderEvents.js';
import { CustomerTopBar } from './CustomerTopBar.js';
import { ShopSection } from './ShopSection.js';
import { OrdersSection } from './OrdersSection.js';
import { StoresSection } from './StoresSection.js';
import { SupportSection } from './SupportSection.js';
import { AccountSection } from './AccountSection.js';
import { CheckoutModal } from './CheckoutModal.js';
import { useCart } from './useCart.js';
import { AWAITING_PAYMENT, CustomerOrder, CustomerSection, PendingSubstitution, balanceDueMinor } from './customerTypes.js';

interface CustomerPortalProps {
  currentUser: User | null;
  currentStore: Store;
  products: Product[];
  stores?: Store[];
  onSelectStore?: (store: Store) => void | boolean;
  onCartCountChange?: (count: number) => void;
  onLogout?: () => void;
}

export const CustomerPortal: React.FC<CustomerPortalProps> = ({
  currentUser,
  currentStore,
  products,
  stores = [],
  onSelectStore,
  onCartCountChange,
  onLogout,
}) => {
  const [section, setSection] = useState<CustomerSection>('SHOP');
  const cart = useCart(currentStore._id);

  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [pendingSubs, setPendingSubs] = useState<PendingSubstitution[]>([]);
  const [paidOrder, setPaidOrder] = useState<CustomerOrder | null>(null);
  const [payingOrder, setPayingOrder] = useState<CustomerOrder | null>(null);
  const [supportPrefill, setSupportPrefill] = useState<{ subject: string; description: string } | null>(null);

  const subKey = (s: { orderId: string; productId: string }) => `${s.orderId}:${s.productId}`;

  const loadOrders = useCallback(async () => {
    if (!currentUser) {
      setOrders([]);
      setOrdersLoading(false);
      return;
    }
    try {
      const res = await apiRequest('/orders');
      const list: CustomerOrder[] = res.orders || [];
      setOrders(list);
      setOrdersError(null);

      // Substitutions waiting for this customer (also survives a page refresh)
      const waiting = list.filter((o) => o.status === 'AWAITING_CUSTOMER_APPROVAL');
      const results = await Promise.all(
        waiting.map((o) =>
          apiRequest(`/orders/${o._id}/substitutions/pending`)
            .then((r) => (r.substitutions || []) as PendingSubstitution[])
            .catch(() => [] as PendingSubstitution[])
        )
      );
      const fresh = results.flat();
      setPendingSubs((prev) => {
        const waitingIds = new Set(waiting.map((o) => o._id));
        // keep live-event items for orders we have not re-fetched; replace the ones we have
        const kept = prev.filter((p) => !waitingIds.has(p.orderId) && list.some((o) => o._id === p.orderId && o.status === 'AWAITING_CUSTOMER_APPROVAL'));
        return [...kept, ...fresh];
      });
    } catch (e: any) {
      setOrdersError(e.message || 'Could not load your orders.');
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders, currentStore._id]);

  // Light polling while the tab is visible, as a fallback if the live stream drops.
  useEffect(() => {
    if (!currentUser) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadOrders();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [loadOrders, currentUser]);

  useLiveOrderEvents((event) => {
    if (event.type === 'substitution.requested' && event.payload?.orderId) {
      const p = event.payload;
      const sub: PendingSubstitution = {
        orderId: String(p.orderId),
        orderNumber: p.orderNumber,
        productId: String(p.originalProductId),
        originalName: p.originalName,
        replacementName: p.replacementName,
        replacementPriceMinor: p.replacementPriceMinor,
        priceDifferenceMinor: p.priceDifferenceMinor,
      };
      setPendingSubs((prev) => (prev.some((x) => subKey(x) === subKey(sub)) ? prev : [...prev, sub]));
      loadOrders();
    } else if (['order.ready', 'order.paid', 'order.collected', 'exit.cleared', 'substitution.responded'].includes(event.type)) {
      loadOrders();
    }
  });

  const respondToSubstitution = async (sub: PendingSubstitution, decision: 'APPROVED' | 'REJECTED') => {
    try {
      await apiRequest(`/orders/${sub.orderId}/substitutions/${sub.productId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      // Only drop the banner once the server accepted the answer.
      setPendingSubs((prev) => prev.filter((p) => subKey(p) !== subKey(sub)));
      await loadOrders();
    } catch (e: any) {
      alert(e.message || 'Could not send your answer. Please try again.');
    }
  };

  const handlePaid = (order: CustomerOrder) => {
    setPayingOrder(null);
    setPaidOrder(order);
    loadOrders();
  };

  useEffect(() => {
    onCartCountChange?.(cart.totalItems);
  }, [cart.totalItems, onCartCountChange]);

  const attention = orders.filter((o) => o.status === 'AWAITING_CUSTOMER_APPROVAL' || AWAITING_PAYMENT.includes(o.status)).length;
  const firstName = currentUser?.name?.split(' ')[0];

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1760px] flex-col overflow-hidden px-4 py-4 sm:px-6 sm:py-5 lg:px-10 2xl:px-12">
      <header className="mb-4 flex shrink-0 flex-col justify-between gap-1 sm:mb-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-navy-800">{firstName ? `Hello, ${firstName}` : 'Welcome'} 👋</h1>
          <p className="text-xs text-slate-500">Shop online and collect, or scan and pay yourself at {currentStore.name}.</p>
        </div>
      </header>

      <div className="shrink-0">
        <CustomerTopBar activeSection={section} setActiveSection={setSection} cartCount={cart.totalItems} attentionCount={attention} />
      </div>

      <div data-customer-scroll-area className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 pt-4 sm:pt-5">
      {section === 'SHOP' && (
        <ShopSection
          store={currentStore}
          products={products}
          cart={cart}
          defaultPhone={currentUser?.phone || ''}
          defaultEmail={currentUser?.email || ''}
          onOrderCreated={cart.clear}
          onOrderPaid={handlePaid}
          goToStores={() => setSection('STORES')}
        />
      )}

      {section === 'ORDERS' && (
        <OrdersSection
          orders={orders}
          loading={ordersLoading}
          error={ordersError}
          onRefresh={loadOrders}
          pendingSubs={pendingSubs}
          onRespond={respondToSubstitution}
          onPay={setPayingOrder}
          goShop={() => setSection('SHOP')}
        />
      )}

      {section === 'STORES' && (
        <StoresSection stores={stores.length ? stores : [currentStore]} currentStore={currentStore} onSelectStore={onSelectStore} goShop={() => setSection('SHOP')} />
      )}

      {section === 'SUPPORT' && (
        <SupportSection orders={orders} prefill={supportPrefill} onPrefillUsed={() => setSupportPrefill(null)} />
      )}

      {section === 'ACCOUNT' && (
        <AccountSection
          onLogout={onLogout}
          onRequestData={() => {
            setSupportPrefill({
              subject: 'Request: copy or deletion of my data',
              description: 'Please send me a copy of my personal data / delete my account. (Edit this message to say which.)',
            });
            setSection('SUPPORT');
          }}
        />
      )}
      </div>

      {/* Pay for an order that was created but not yet paid */}
      {payingOrder && (
        <CheckoutModal
          existingOrder={payingOrder}
          totalMinor={payingOrder.totalMinor}
          defaultPhone={currentUser?.phone || ''}
          onClose={() => setPayingOrder(null)}
          onOrderCreated={() => undefined}
          onPaid={handlePaid}
        />
      )}

      {/* Payment confirmed */}
      {paidOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-lg text-navy-800">Payment confirmed</h3>
              <p className="text-xs text-slate-500">
                Order #{paidOrder.orderNumber} · {formatKes(paidOrder.paidMinor || paidOrder.totalMinor)} paid
              </p>
            </div>
            {paidOrder.orderType === 'CLICK_AND_COLLECT' ? (
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Your order number</span>
                <span className="block text-2xl font-black font-mono tracking-wider text-brand-700">{paidOrder.orderNumber}</span>
                {balanceDueMinor(paidOrder) > 0 && (
                  <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    Balance of {formatKes(balanceDueMinor(paidOrder))} is payable at pickup.
                  </p>
                )}
                <p className="text-[11px] text-slate-500">
                  Give this number to the collection staff. They will send a one-time code to your registered phone: read it out to complete pickup. Bring your ID.
                </p>
              </div>
            ) : paidOrder.collectionQrToken ? (
              <div className="bg-white p-3 rounded-2xl inline-block border-2 border-slate-100">
                <QRCodeSVG value={paidOrder.collectionQrToken} size={160} level="H" />
              </div>
            ) : (
              <p className="text-xs text-slate-500">Your pass will appear in My Orders as soon as the store confirms the payment.</p>
            )}
            <button
              onClick={() => {
                setPaidOrder(null);
                setSection('ORDERS');
              }}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-xl text-xs"
            >
              View in My Orders
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
