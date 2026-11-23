import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrders, usePendingSubstitutions, useRespondSubstitution } from '../hooks';
import type { Order } from '../types';
import { formatKes } from '../../../shared/money';
import { notify, Skeleton } from '../../../shared/ui/feedback';

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState('');
  const orders = useOrders();
  const substitutions = usePendingSubstitutions(expanded);
  const respond = useRespondSubstitution();

  const topPadding = Math.max(insets.top, 24) + 12;
  const bottomPadding = Math.max(insets.bottom, 16) + 84;

  const toggle = (id: string) => setExpanded(expanded === id ? '' : id);

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
                      {item.status} · {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={s.amount}>{formatKes(item.totalMinor)}</Text>
                </View>
                <Text style={s.link}>{expanded === item._id ? 'Hide details' : 'View details'} ↓</Text>
              </Pressable>
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
