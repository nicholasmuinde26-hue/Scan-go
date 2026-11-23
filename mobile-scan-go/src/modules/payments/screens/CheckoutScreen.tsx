import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
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
import type { Basket, BasketLine } from '../../basket/types';
import { notify } from '../../../shared/ui/feedback';

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [basket, setBasket] = useState<Basket | null>(null);
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

  useEffect(() => {
    activeBasket.get().then((basketId) => {
      if (basketId) {
        // Fetch current basket items if possible or read
        (basketApi as any)
          .open
          ? null
          : null;
      }
    });
  }, []);

  useEffect(() => {
    if (customer.data?.user?.phone && !phone) {
      setPhone(customer.data.user.phone);
    }
  }, [customer.data]);

  useEffect(() => {
    if (payment.data?.status === 'SUCCESS') {
      activeBasket.clear();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({
        pathname: '/pass',
        params: { orderId: payment.data.orderId },
      });
    } else if (
      payment.data &&
      ['FAILED', 'TIMED_OUT', 'HELD'].includes(payment.data.status)
    ) {
      setStatus(
        payment.data.message ||
          'Payment did not complete. Check Orders before retrying.'
      );
    }
  }, [payment.data]);

  const handlePay = async () => {
    setBusy(true);
    try {
      const basketId = await activeBasket.get();
      if (!basketId) throw new Error('Your basket is empty.');

      setStatus('Creating your order…');
      const made = await checkout.mutateAsync(basketId);

      setStatus('Sending payment prompt…');
      const result = await mpesa.mutateAsync({
        orderId: made.order._id,
        phone,
      });

      setPaymentId(result.paymentId);
      setStatus('Check your phone and enter your M-Pesa PIN. Waiting for confirmation…');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      notify(`Checkout failed: ${e instanceof Error ? e.message : 'Please retry.'}`, 'error');
      setStatus(e instanceof Error ? e.message : 'Payment could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.page}>
      {/* Top Header (Image 3 & 5 Right) */}
      <View style={[s.header, { paddingTop: topPadding }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backIcon}>‹</Text>
          <Text style={s.backText}>Your Cart</Text>
        </Pressable>
        <View style={s.headerRightIcons}>
          <Text style={{ fontSize: 18, marginRight: 8 }}>🛒</Text>
          <Text style={{ fontSize: 18 }}>🔔</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: bottomDockPadding + 70 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Receipt Total Card (Image 5 Right) */}
        <View style={s.totalCard}>
          <Text style={s.totalSubtitle}>TOTAL AMOUNT</Text>
          <Text style={s.totalBigAmount}>KES 2,450.00</Text>

          <View style={s.breakdownTable}>
            <View style={s.breakdownRow}>
              <Text style={s.breakdownLabel}>Products count</Text>
              <Text style={s.breakdownValue}>4 items</Text>
            </View>
            <View style={s.breakdownRow}>
              <Text style={s.breakdownLabel}>Subtotal</Text>
              <Text style={s.breakdownValue}>KES 2,590.00</Text>
            </View>
            <View style={s.breakdownRow}>
              <Text style={s.breakdownLabel}>Store discount (promos)</Text>
              <Text style={[s.breakdownValue, { color: '#16A34A' }]}>− KES 140.00</Text>
            </View>
            <View style={s.breakdownRow}>
              <Text style={s.breakdownLabel}>TAX (VAT 16% incl.)</Text>
              <Text style={s.breakdownValue}>KES 337.93</Text>
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
            <Text style={s.methodName}>Card / Visa</Text>
            <Text style={s.methodSub}>Debit / Credit</Text>
          </Pressable>
        </View>

        {/* M-Pesa Phone Input */}
        <Text style={s.sectionLabel}>PAYMENT PHONE NUMBER</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="07XX XXX XXX or 2547..."
          placeholderTextColor="#94A3B8"
          keyboardType="phone-pad"
          style={s.input}
        />

        {/* Status notice */}
        <View style={s.statusNotice}>
          <Text style={s.statusText}>
            {payment.isFetching ? 'Verifying payment from Safaricom M-Pesa…' : status}
          </Text>
        </View>

        {/* Security / Exit Pass info */}
        <View style={s.securityBadge}>
          <Text style={{ fontSize: 18 }}>🛡</Text>
          <Text style={s.securityText}>
            After payment, an encrypted QR Exit Pass is generated immediately for store exit gate scanning.
          </Text>
        </View>
      </ScrollView>

      {/* Sticky Bottom Pay Button (Image 5 Right & Image 3) */}
      <View style={[s.bottomDock, { paddingBottom: bottomDockPadding }]}>
        <Pressable
          style={[s.payButton, (busy || !!paymentId) && s.payButtonDisabled]}
          onPress={handlePay}
          disabled={busy || !!paymentId}
        >
          <Text style={s.payButtonText}>
            {busy
              ? 'Processing payment…'
              : paymentId
              ? 'Waiting for M-Pesa PIN…'
              : 'Pay & Generate Exit Pass →'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#FAF8F5', // Warm cream background matching Image 3
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
  headerRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: {
    padding: 20,
    paddingBottom: 110,
  },
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
