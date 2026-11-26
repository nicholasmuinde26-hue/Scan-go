import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTopInset } from '../../core/safeArea';
import { guestStore } from '../../modules/guest/store';
import OrdersScreen from '../../modules/orders/screens/OrdersScreen';

/** Guest shoppers don't have order history in the app — orders are created
 *  and paid at the till. Show a helpful placeholder instead of API errors. */
function GuestOrdersNotice() {
  const topPadding = useTopInset(12);
  return (
    <View style={[s.page, { paddingTop: topPadding }]}>
      <Text style={s.heading}>Your orders</Text>
      <Text style={s.sub}>Guest shopping is paid at the till.</Text>
      <View style={s.card}>
        <Text style={s.cardTitle}>Shopping as a guest?</Text>
        <Text style={s.cardText}>
          When you pay at the checkout till, your receipt is issued there. Create a free account to track orders, get receipts by SMS, and earn rewards.
        </Text>
        <Pressable style={s.btn} onPress={() => router.push('/register')}>
          <Text style={s.btnText}>Create free account</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/scan')} style={{ marginTop: 12, alignItems: 'center' }}>
          <Text style={s.link}>Back to scanning</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function OrdersTab() {
  const [isGuest, setIsGuest] = useState<boolean | null>(null);

  useEffect(() => {
    guestStore.isGuest().then(setIsGuest);
  }, []);

  if (isGuest === null) return null;
  return isGuest ? <GuestOrdersNotice /> : <OrdersScreen />;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f7f5', paddingHorizontal: 20 },
  heading: { fontSize: 28, fontWeight: '800', color: '#17251e' },
  sub: { fontSize: 13, color: '#7a857e', marginTop: 5 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginTop: 24 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#24352b' },
  cardText: { fontSize: 13, color: '#647168', lineHeight: 20, marginTop: 8 },
  btn: { backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  link: { color: '#16A34A', fontWeight: '700', fontSize: 13 },
});
