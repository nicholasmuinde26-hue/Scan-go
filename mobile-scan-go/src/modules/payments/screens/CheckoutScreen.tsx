import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useCustomer } from '../../auth';
import {
  useCheckoutBasket,
  activeBasket,
  basketApi,
  useUpdateBasketLine,
} from '../../basket';
import { usePaymentStatus, useStartMpesa } from '../hooks';
import { paymentsApi } from '../api';
import type { Basket, BasketLine } from '../../basket/types';
import { formatKes } from '../../../shared/money';
import { notify } from '../../../shared/ui/feedback';

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [cardEmail, setCardEmail] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [basket, setBasket] = useState<Basket | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Review your items and complete payment.');
  const [busy, setBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'card'>('mpesa');

  const topPadding = Math.max(insets.top, 24) + 10;
  const bottomDockPadding = Math.max(insets.bottom, 16) + 14;

  const customer = useCustomer();
  const checkout = useCheckoutBasket();
  const mpesa = useStartMpesa();
  const payment = usePaymentStatus(paymentId, !!paymentId);
  const updateLineMutation = useUpdateBasketLine();

  const loadBasket = useCallback(async () => {
    const basketId = await activeBasket.get();
    if (!basketId) {
      setBasket(null);
      setLoading(false);
      return;
    }
    try {
      const r = await basketApi.get(basketId);
      if (r.basket.status !== 'OPEN') {
        await activeBasket.clear();
        setBasket(null);
      } else {
        setBasket(r.basket);
      }
    } catch {
      setBasket(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBasket();
  }, [loadBasket]);

  useEffect(() => {
    const user = customer.data?.user as any;
    if (user?.phone && !phone) setPhone(user.phone);
    if (user?.email && !cardEmail) setCardEmail(user.email);
  }, [customer.data]);

  useEffect(() => {
    if (payment.data?.status === 'SUCCESS') {
      activeBasket.clear();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/pass', params: { orderId: payment.data.orderId || orderId } });
    } else if (
      payment.data &&
      ['FAILED', 'TIMED_OUT', 'HELD'].includes(payment.data.status)
    ) {
      setStatus(
        payment.data.message ||
          'Payment did not complete. Check Orders before retrying.'
      );
    }
  }, [payment.data, orderId]);

  const createOrder = async (): Promise<string> => {
    const basketId = await activeBasket.get();
    if (!basketId) throw new Error('Your basket is empty.');
    setStatus('Creating your order…');
    const made = await checkout.mutateAsync(basketId);
    const id = made.order._id;
    setOrderId(id);
    return id;
  };

  const handlePay = async () => {
    setBusy(true);
    try {
      const id = orderId || (await createOrder());

      if (paymentMethod === 'mpesa') {
        setStatus('Sending payment prompt…');
        const result = await mpesa.mutateAsync({ orderId: id, phone });
        setPaymentId(result.paymentId);
        setStatus('Check your phone and enter your M-Pesa PIN. Waiting for confirmation…');
      } else {
        if (!/^\S+@\S+\.\S+$/.test(cardEmail.trim())) {
          throw new Error('Enter a valid email for the card receipt.');
        }
        setStatus('Opening secure card checkout…');
        const result = await paymentsApi.card(id, cardEmail.trim());
        setPaymentId(result.paymentId);
        setStatus('Complete the payment in your browser, then return here.');
        await Linking.openURL(result.checkoutUrl);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      notify(`Checkout failed: ${e instanceof Error ? e.message : 'Please retry.'}`, 'error');
      setStatus(e instanceof Error ? e.message : 'Payment could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const handleQty = async (line: BasketLine, delta: number) => {
    const basketId = await activeBasket.get();
    if (!basketId) return;
    try {
      const r = await updateLineMutation.mutateAsync({
        basketId,
        productId: line.productId,
        quantity: line.quantity + delta,
      });
      setBasket(r.basket);
    } catch (e: any) {
      notify(e?.message || 'Could not update item.', 'error');
    }
  };

  const items = basket?.items || [];
  const totalMinor = basket?.totalMinor || 0;
  const itemCount = basket?.totalItems || items.reduce((n, i) => n + i.quantity, 0);

  return (
    <View style={s.page}>
      {/* Top Header */}
      <View style={[s.header, { paddingTop: topPadding }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backIcon}>‹</Text>
          <Text style={s.backText}>Your Cart</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#16A34A" />
        </View>
      ) : !basket || items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🛒</Text>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#0F172A' }}>Your basket is empty</Text>
          <Text style={{ fontSize: 13, color: '#78716C', marginTop: 6, textAlign: 'center' }}>
            Scan some items first, then come back to pay.
          </Text>
          <Pressable
            style={{ marginTop: 20, backgroundColor: '#16A34A', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 13 }}
            onPress={() => router.replace('/(tabs)/scan')}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>Go to Scan</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[s.content, { paddingBottom: bottomDockPadding + 90 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Items list */}
            <View style={s.itemsCard}>
              <Text style={s.itemsTitle}>{itemCount} item{itemCount === 1 ? '' : 's'}</Text>
              {items.map((line) => (
                <View key={line.productId} style={s.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName} numberOfLines={2}>{line.name}</Text>
                    <Text style={s.itemPrice}>{formatKes(line.unitPriceMinor)} each</Text>
                  </View>
                  <View style={s.qtyRow}>
                    <Pressable style={s.qtyBtn} onPress={() => handleQty(line, -1)}>
                      <Text style={s.qtyBtnText}>−</Text>
                    </Pressable>
                    <Text style={s.qtyValue}>{line.quantity}</Text>
                    <Pressable style={s.qtyBtn} onPress={() => handleQty(line, 1)}>
                      <Text style={s.qtyBtnText}>+</Text>
                    </Pressable>
                  </View>
                  <Text style={s.itemTotal}>{formatKes(line.unitPriceMinor * line.quantity)}</Text>
                </View>
              ))}
            </View>

            {/* Total Card */}
            <View style={s.totalCard}>
              <Text style={s.totalSubtitle}>TOTAL AMOUNT</Text>
              <Text style={s.totalBigAmount}>{formatKes(totalMinor)}</Text>
              <View style={s.breakdownTable}>
                <View style={s.breakdownRow}>
                  <Text style={s.breakdownLabel}>Products</Text>
                  <Text style={s.breakdownValue}>{itemCount} items</Text>
                </View>
                <View style={s.breakdownRow}>
                  <Text style={s.breakdownLabel}>Subtotal</Text>
                  <Text style={s.breakdownValue}>{formatKes(totalMinor)}</Text>
                </View>
                <View style={s.breakdownRow}>
                  <Text style={s.breakdownLabel}>VAT</Text>
                  <Text style={s.breakdownValue}>Included</Text>
                </View>
              </View>
            </View>

            {/* Payment Method Selector */}
            <Text style={s.sectionLabel}>PAYMENT METHOD</Text>
            <View style={s.methodRow}>
              <Pressable
                style={[s.methodCard, paymentMethod === 'mpesa' && s.methodCardSelected]}
                onPress={() => setPaymentMethod('mpesa')}
              >
                <Text style={s.methodIcon}>📱</Text>
                <Text style={s.methodName}>M-Pesa</Text>
                <Text style={s.methodSub}>Instant STK push</Text>
              </Pressable>

              <Pressable
                style={[s.methodCard, paymentMethod === 'card' && s.methodCardSelected]}
                onPress={() => setPaymentMethod('card')}
              >
                <Text style={s.methodIcon}>💳</Text>
                <Text style={s.methodName}>Card</Text>
                <Text style={s.methodSub}>Visa / Mastercard</Text>
              </Pressable>
            </View>

            {paymentMethod === 'mpesa' ? (
              <>
                <Text style={s.sectionLabel}>PAYMENT PHONE NUMBER</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="07XX XXX XXX or 2547..."
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  style={s.input}
                />
              </>
            ) : (
              <>
                <Text style={s.sectionLabel}>CARD RECEIPT EMAIL</Text>
                <TextInput
                  value={cardEmail}
                  onChangeText={setCardEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#94A3B8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={s.input}
                />
                <Text style={s.cardHint}>
                  You'll be taken to a secure payment page to enter your card details.
                </Text>
              </>
            )}

            {/* Status notice */}
            <View style={s.statusNotice}>
              <Text style={s.statusText}>
                {payment.isFetching ? 'Verifying payment…' : status}
              </Text>
            </View>

            <View style={s.securityBadge}>
              <Text style={{ fontSize: 18 }}>🛡</Text>
              <Text style={s.securityText}>
                After payment, an encrypted QR Exit Pass is generated immediately for store exit gate scanning.
              </Text>
            </View>
          </ScrollView>

          {/* Sticky Bottom Pay Button */}
          <View style={[s.bottomDock, { paddingBottom: bottomDockPadding }]}>
            <Pressable
              style={[s.payButton, (busy || !!paymentId) && s.payButtonDisabled]}
              onPress={handlePay}
              disabled={busy || !!paymentId}
            >
              <Text style={s.payButtonText}>
                {busy
                  ? 'Processing payment…'
                  : paymentId && paymentMethod === 'mpesa'
                  ? 'Waiting for M-Pesa PIN…'
                  : paymentId
                  ? 'Complete card payment in browser…'
                  : `Pay ${formatKes(totalMinor)} →`}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  header: {
    backgroundColor: '#FAF8F5',
    paddingTop: Platform.OS === 'ios' ? 52 : 44,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EBE7E0',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backIcon: {
    fontSize: 24,
    fontWeight: '700',
    color: '#15803D',
  },
  backText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  content: {
    padding: 20,
    paddingBottom: 110,
  },
  itemsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E7E4DC',
    marginBottom: 16,
  },
  itemsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#78716C',
    letterSpacing: 0.6,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F0EB',
    gap: 10,
  },
  itemName: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  itemPrice: { fontSize: 12, color: '#78716C', marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#F1F5F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 17, fontWeight: '800', color: '#15803D' },
  qtyValue: { fontSize: 14, fontWeight: '800', color: '#0F172A', minWidth: 18, textAlign: 'center' },
  itemTotal: { fontSize: 14, fontWeight: '800', color: '#0F172A', minWidth: 70, textAlign: 'right' },
  totalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E7E4DC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 20,
  },
  totalSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8C857B',
    letterSpacing: 1,
    marginBottom: 6,
  },
  totalBigAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 16,
  },
  breakdownTable: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: '#F3F0EB',
    paddingTop: 14,
    gap: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#78716C',
    marginTop: 10,
    marginBottom: 8,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  methodCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E7E4DC',
  },
  methodCardSelected: {
    borderColor: '#16A34A',
    backgroundColor: '#F0FDF4',
  },
  methodIcon: {
    fontSize: 22,
    marginBottom: 6,
  },
  methodName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  methodSub: {
    fontSize: 11,
    color: '#78716C',
    marginTop: 2,
  },
  input: {
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E7E4DC',
    color: '#0F172A',
    marginBottom: 16,
  },
  cardHint: {
    fontSize: 12,
    color: '#78716C',
    marginTop: -8,
    marginBottom: 12,
    lineHeight: 17,
  },
  statusNotice: {
    backgroundColor: '#F0FDF4',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 14,
  },
  statusText: {
    color: '#15803D',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  securityBadge: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7E4DC',
  },
  securityText: {
    flex: 1,
    fontSize: 12,
    color: '#78716C',
    lineHeight: 17,
  },
  bottomDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FAF8F5',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 18,
    borderTopWidth: 1,
    borderTopColor: '#EBE7E0',
  },
  payButton: {
    height: 54,
    backgroundColor: '#16A34A',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  payButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
