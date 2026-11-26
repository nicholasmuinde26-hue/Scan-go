import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTopInset, useBottomInset } from '../../../core/safeArea';
import QRCode from 'react-native-qrcode-svg';
import { guestStore } from '../store';
import { guestApi } from '../api';
import type { GuestBasket } from '../api';
import { formatKes } from '../../../shared/money';
import { notify } from '../../../shared/ui/feedback';

export default function GuestCheckoutScreen() {
  const [basket, setBasket] = useState<GuestBasket | null>(null);
  const [passId, setPassId] = useState('');
  const [loading, setLoading] = useState(true);

  const topPadding = useTopInset(12);
  const bottomPadding = useBottomInset(24);

  useEffect(() => {
    (async () => {
      const session = await guestStore.get();
      if (!session) {
        router.replace('/guest');
        return;
      }
      setPassId(session.passId);
      try {
        setBasket((await guestApi.currentBasket()).basket);
      } catch (e: any) {
        notify(e.message || 'Could not load basket.', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={[s.page, s.center]}>
        <ActivityIndicator size="large" color="#16A34A" />
      </View>
    );
  }

  return (
    <ScrollView style={s.page} contentContainerStyle={[s.content, { paddingTop: topPadding, paddingBottom: bottomPadding }]}>
      <Pressable onPress={() => router.back()} style={s.backBtn}>
        <Text style={s.backText}>‹  Back to basket</Text>
      </Pressable>

      <Text style={s.heading}>Pay at the till</Text>
      <Text style={s.sub}>
        Guest shopping is paid for at the checkout till. Show this pass code to the cashier.
      </Text>

      {/* Pass QR */}
      <View style={s.qrCard}>
        <Text style={s.qrLabel}>YOUR GUEST PASS</Text>
        <View style={s.qrBox}>
          <QRCode value={passId} size={180} />
        </View>
        <Text style={s.passId}>{passId}</Text>
        <Text style={s.qrHint}>Cashier scans or types this code to find your basket</Text>
      </View>

      {/* Basket summary */}
      <View style={s.summaryCard}>
        <Text style={s.summaryTitle}>Basket summary</Text>
        {(basket?.items || []).map((item) => (
          <View key={item.productId} style={s.row}>
            <Text style={s.rowName} numberOfLines={1}>
              {item.quantity} × {item.name}
            </Text>
            <Text style={s.rowPrice}>{formatKes(item.unitPriceMinor * item.quantity)}</Text>
          </View>
        ))}
        <View style={[s.row, s.totalRow]}>
          <Text style={s.totalLabel}>Total due</Text>
          <Text style={s.totalValue}>{formatKes(basket?.totalMinor || 0)}</Text>
        </View>
      </View>

      <View style={s.tipCard}>
        <Text style={s.tipTitle}>Before you pay</Text>
        <Text style={s.tipLine}>• Head to any open checkout till</Text>
        <Text style={s.tipLine}>• Show this screen — the cashier will scan your pass</Text>
        <Text style={s.tipLine}>• Pay by M-Pesa, card, or cash at the till</Text>
      </View>

      <Pressable style={s.secondaryBtn} onPress={() => router.replace('/(tabs)')}>
        <Text style={s.secondaryBtnText}>Keep shopping</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F8F6' },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20 },
  backBtn: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { color: '#16A34A', fontWeight: '700', fontSize: 15 },
  heading: { fontSize: 26, fontWeight: '800', color: '#14271D', marginTop: 8 },
  sub: { fontSize: 14, color: '#7A8A80', marginTop: 6, lineHeight: 20, marginBottom: 20 },
  qrCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8ECE8',
    marginBottom: 16,
  },
  qrLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: '#7A8A80', marginBottom: 14 },
  qrBox: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#E8ECE8' },
  passId: { fontSize: 20, fontWeight: '900', color: '#16A34A', marginTop: 14, letterSpacing: 1 },
  qrHint: { fontSize: 12, color: '#7A8A80', marginTop: 6, textAlign: 'center' },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E8ECE8',
    marginBottom: 16,
  },
  summaryTitle: { fontSize: 15, fontWeight: '800', color: '#14271D', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  rowName: { flex: 1, fontSize: 13, color: '#3D4A42', marginRight: 10 },
  rowPrice: { fontSize: 13, fontWeight: '700', color: '#14271D' },
  totalRow: { borderTopWidth: 1, borderTopColor: '#EEF1EE', marginTop: 8, paddingTop: 12 },
  totalLabel: { fontSize: 15, fontWeight: '800', color: '#14271D' },
  totalValue: { fontSize: 18, fontWeight: '900', color: '#16A34A' },
  tipCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    padding: 18,
    marginBottom: 20,
  },
  tipTitle: { fontSize: 14, fontWeight: '800', color: '#15803D', marginBottom: 8 },
  tipLine: { fontSize: 13, color: '#3F6212', lineHeight: 22 },
  secondaryBtn: {
    height: 50,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: '#16A34A', fontWeight: '800', fontSize: 15 },
});
