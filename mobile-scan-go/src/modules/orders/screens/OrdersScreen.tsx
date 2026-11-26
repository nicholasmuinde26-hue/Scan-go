import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTopInset, useBottomInset } from '../../../core/safeArea';
import { useOrders, usePendingSubstitutions, useRespondSubstitution } from '../hooks';
import { useStartMpesa, usePaymentStatus } from '../../payments/hooks';
import { AWAITING_PAYMENT, TONE_COLORS, amountDueNow, balanceDueMinor, statusLabel, statusTone } from '../types';
import type { Order } from '../types';
import { useCustomer } from '../../auth';
import { formatKes } from '../../../shared/money';
import { notify, Skeleton } from '../../../shared/ui/feedback';

export default function OrdersScreen() {
  const [expanded, setExpanded] = useState('');
  const [payOrder, setPayOrder] = useState<Order | null>(null);
  const [phone, setPhone] = useState('');
  const orders = useOrders();
  const customer = useCustomer();
  const substitutions = usePendingSubstitutions(expanded);
  const respond = useRespondSubstitution();
  const mpesa = useStartMpesa();
  const [paymentId, setPaymentId] = useState('');
  const payment = usePaymentStatus(paymentId, !!paymentId);

  const topPadding = useTopInset(12);
  const bottomPadding = useBottomInset(84);

  const toggle = (id: string) => setExpanded(expanded === id ? '' : id);

  const openPay = (o: Order) => {
    setPayOrder(o);
    const p = customer.data?.user?.phone;
    if (p && !phone) setPhone(p);
  };

  const payNow = async () => {
    if (!payOrder || mpesa.isPending) return;
    try {
      const result = await mpesa.mutateAsync({ orderId: payOrder._id, phone });
      setPaymentId(result.paymentId);
      notify('Check your phone and enter your M-Pesa PIN.', 'info');
    } catch (e) {
      notify(`Payment failed to start: ${e instanceof Error ? e.message : 'Please try again.'}`, 'error');
    }
  };

  const decide = async (orderId: string, productId: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      await respond.mutateAsync({ orderId, productId, decision });
      notify(`Response sent: ${decision === 'APPROVED' ? 'Replacement approved.' : 'Replacement declined.'}`, 'info');
    } catch (e) {
      notify(`Could not send response: ${e instanceof Error ? e.message : 'Please try again.'}`, 'error');
    }
  };

  return (
    <View style={[s.page, { paddingTop: topPadding }]}>
      <Text style={s.heading}>Your orders</Text>
      <Text style={s.sub}>Track current orders and view your receipts.</Text>
      {orders.isLoading ? (
        <View style={{ marginTop: 18, gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={{ backgroundColor: '#FFF', borderRadius: 16, padding: 16, gap: 8 }}>
              <Skeleton height={14} width="55%" />
              <Skeleton height={11} width="35%" />
              <Skeleton height={11} width="70%" />
            </View>
          ))}
        </View>
      ) : orders.error ? (
        <Text style={s.empty}>{orders.error.message}</Text>
      ) : (
        <FlatList
          style={{ marginTop: 18 }}
          contentContainerStyle={{ paddingBottom: bottomPadding }}
          data={orders.data?.orders || []}
          keyExtractor={(x) => x._id}
          ListEmptyComponent={<Text style={s.empty}>Your orders will appear here.</Text>}
          renderItem={({ item }: { item: Order }) => (
            <View style={s.card}>
              <Pressable onPress={() => toggle(item._id)}>
                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.order}>Order {item.orderNumber}</Text>
                    <Text style={s.sub}>
                      {item.orderType === 'SCAN_AND_GO'
                        ? 'Scan & Go'
                        : `Pickup ${item.pickupSlot?.date || ''} ${item.pickupSlot?.timeWindow || ''}`.trim() || 'Shop & Collect'}
                      {' · '}
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={[s.tone, { backgroundColor: TONE_COLORS[statusTone(item.status)].bg, borderColor: TONE_COLORS[statusTone(item.status)].border }]}>
                    <Text style={[s.toneText, { color: TONE_COLORS[statusTone(item.status)].text }]}>{statusLabel(item.status)}</Text>
                  </View>
                </View>
                {item.collectionCode && (
                  <View style={s.collectionBox}>
                    <Text style={s.collectionLabel}>Collection code</Text>
                    <Text style={s.collectionCode}>{item.collectionCode}</Text>
                  </View>
                )}
                <View style={s.totalsRow}>
                  <Text style={s.sub}>
                    {AWAITING_PAYMENT.includes(item.status)
                      ? item.status === 'AWAITING_FINAL_PAYMENT'
                        ? 'Balance to pay'
                        : item.paymentPlan === 'DEPOSIT'
                          ? 'Deposit to pay'
                          : 'To pay'
                      : 'Total'}
                  </Text>
                  <Text style={s.amount}>{formatKes(AWAITING_PAYMENT.includes(item.status) ? amountDueNow(item) : item.totalMinor)}</Text>
                </View>
                {AWAITING_PAYMENT.includes(item.status) && item.totalMinor !== amountDueNow(item) && (
                  <Text style={s.sub}>Order total {formatKes(item.totalMinor)}</Text>
                )}
                {item.orderType === 'CLICK_AND_COLLECT' &&
                  ['PAID','PICKING','AWAITING_CUSTOMER_APPROVAL','READY_FOR_VERIFICATION','VERIFIED_AND_PACKED','READY_FOR_PICKUP','AWAITING_FINAL_PAYMENT'].includes(item.status) &&
                  (item.paidMinor || 0) > 0 && (
                  <View style={s.collectionBox}>
                    <Text style={s.collectionLabel}>Pickup order number</Text>
                    <Text style={s.collectionCode}>{item.orderNumber}</Text>
                    {balanceDueMinor(item) > 0 && (
                      <Text style={s.balanceNote}>Balance at pickup: {formatKes(balanceDueMinor(item))}</Text>
                    )}
                    <Text style={s.collectionHint}>Give this number at the collection counter. A one-time code goes to your phone; bring your ID.</Text>
                  </View>
                )}
                <Text style={s.link}>{expanded === item._id ? 'Hide details' : 'View details'} ↓</Text>
              </Pressable>
              {AWAITING_PAYMENT.includes(item.status) && (
                <Pressable style={s.payBtn} onPress={() => openPay(item)}>
                  <Text style={s.payBtnText}>
                    {item.status === 'AWAITING_FINAL_PAYMENT' ? 'Pay balance' : item.paymentPlan === 'DEPOSIT' ? 'Pay deposit' : 'Pay now'} · {formatKes(amountDueNow(item))}
                  </Text>
                </Pressable>
              )}
              {expanded === item._id && (
                <View style={s.detail}>
                  <Text style={s.detailTitle}>Items</Text>
                  {item.items.map((it, i) => (
                    <Text key={`${it.productId}-${i}`} style={s.item}>
                      {it.quantity} × {it.productName}
                    </Text>
                  ))}
                  {(substitutions.data?.substitutions || []).map((sub) => (
                    <View key={sub.productId} style={s.substitution}>
                      <Text style={s.detailTitle}>Replacement needs your reply</Text>
                      <Text style={s.item}>
                        {sub.originalName} → {sub.replacementName}
                      </Text>
                      <Text style={s.item}>Difference: {formatKes(sub.priceDifferenceMinor)}</Text>
                      <View style={s.actions}>
                        <Pressable style={s.approve} onPress={() => decide(item._id, sub.productId, 'APPROVED')}>
                          <Text style={s.actionText}>Accept</Text>
                        </Pressable>
                        <Pressable style={s.decline} onPress={() => decide(item._id, sub.productId, 'REJECTED')}>
                          <Text style={s.actionText}>Decline</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                  {item.orderType === 'SCAN_AND_GO' && ['PAID', 'EXITED'].includes(item.status) && (
                    <Pressable onPress={() => router.push({ pathname: '/pass', params: { orderId: item._id } })}>
                      <Text style={s.link}>Show exit pass →</Text>
                    </Pressable>
                  )}
                  <Pressable style={s.help} onPress={() => router.push({ pathname: '/support', params: { orderId: item._id } })}>
                    <Text style={s.helpText}>Get help with this order</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        />
      )}

      {/* Pay-now modal */}
      <Modal visible={!!payOrder} transparent animationType="slide" onRequestClose={() => { setPayOrder(null); setPaymentId(''); }}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            {paymentId ? (
              <>
                <Text style={s.modalTitle}>Payment {payment.data?.status === 'SUCCESS' ? 'confirmed' : payment.data?.status === 'FAILED' || payment.data?.timedOut ? 'failed' : 'in progress'}</Text>
                <Text style={s.modalSub}>
                  {payment.data?.status === 'SUCCESS'
                    ? 'Your payment was received. This order will update shortly.'
                    : payment.data?.status === 'FAILED' || payment.data?.timedOut
                      ? payment.data?.message || 'The payment did not go through. Please try again.'
                      : 'Check your phone and enter your M-Pesa PIN. This screen updates automatically.'}
                </Text>
                {payment.data?.status !== 'SUCCESS' && payment.data?.status !== 'FAILED' && !payment.data?.timedOut && (
                  <ActivityIndicator color="#16A34A" style={{ marginVertical: 12 }} />
                )}
                <Pressable style={s.payBtn} onPress={() => { setPayOrder(null); setPaymentId(''); orders.refetch(); }}>
                  <Text style={s.payBtnText}>Done</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={s.modalTitle}>
                  {payOrder?.status === 'AWAITING_FINAL_PAYMENT' ? 'Pay balance' : payOrder?.paymentPlan === 'DEPOSIT' ? 'Pay deposit' : 'Pay now'}
                </Text>
                <Text style={s.modalSub}>
                  Order {payOrder?.orderNumber} · {formatKes(payOrder ? amountDueNow(payOrder) : 0)} via M-Pesa
                </Text>
                <TextInput
                  style={s.phoneInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="M-Pesa phone e.g. 0712 345 678"
                  keyboardType="phone-pad"
                  placeholderTextColor="#94A3B8"
                />
                <Pressable style={[s.payBtn, (!phone.trim() || mpesa.isPending) && { opacity: 0.6 }]} disabled={!phone.trim() || mpesa.isPending} onPress={payNow}>
                  {mpesa.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.payBtnText}>Send M-Pesa prompt</Text>}
                </Pressable>
                <Pressable onPress={() => setPayOrder(null)} style={{ alignItems: 'center', marginTop: 12 }}>
                  <Text style={s.sub}>Cancel</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f7f5', paddingHorizontal: 20 },
  heading: { fontSize: 28, fontWeight: '800', color: '#17251e' },
  sub: { fontSize: 13, color: '#7a857e', marginTop: 5 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  order: { fontWeight: '800', color: '#24352b', marginBottom: 5 },
  amount: { fontSize: 12, fontWeight: '700', color: '#16A34A' },
  tone: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  toneText: { fontSize: 10, fontWeight: '800' },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  collectionBox: { backgroundColor: '#F8FAF9', borderRadius: 12, padding: 12, marginTop: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  collectionLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 },
  collectionCode: { fontSize: 22, fontWeight: '900', color: '#16A34A', fontFamily: 'monospace', letterSpacing: 3, marginTop: 4 },
  collectionHint: { fontSize: 11, color: '#64748B', marginTop: 8, textAlign: 'center' },
  balanceNote: { fontSize: 11, fontWeight: '800', color: '#92400E', backgroundColor: '#FFFBEB', borderRadius: 8, padding: 6, marginTop: 6, overflow: 'hidden' },
  payBtn: { backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
  payBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  modalSub: { fontSize: 13, color: '#64748B', marginTop: 6 },
  phoneInput: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginTop: 14, color: '#0F172A' },
  empty: { color: '#77837b', textAlign: 'center', padding: 28 },
  link: { color: '#16A34A', fontSize: 13, fontWeight: '800', marginTop: 12 },
  detail: { borderTopWidth: 1, borderColor: '#eef0ee', marginTop: 12, paddingTop: 12 },
  detailTitle: { fontWeight: '800', color: '#26372e', marginVertical: 5 },
  item: { color: '#647168', fontSize: 13, marginTop: 5 },
  substitution: { backgroundColor: '#fff5e8', borderRadius: 13, padding: 12, marginTop: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  approve: { backgroundColor: '#16A34A', padding: 11, borderRadius: 10, flex: 1, alignItems: 'center' },
  decline: { backgroundColor: '#b7433d', padding: 11, borderRadius: 10, flex: 1, alignItems: 'center' },
  actionText: { color: '#fff', fontWeight: '800' },
  help: { marginTop: 15, padding: 12, alignItems: 'center', backgroundColor: '#edf4ef', borderRadius: 11 },
  helpText: { color: '#16A34A', fontWeight: '800' },
});
