import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCustomer } from '../../auth';
import { useCollectCart } from '../store';
import { useCreateCollectOrder } from '../hooks';
import { currentStore } from '../../stores/store';
import type { Store } from '../../stores';
import { useStartMpesa } from '../../payments/hooks';
import { notify } from '../../../shared/ui/feedback';

export default function CollectCheckoutScreen() {
  const insets = useSafeAreaInsets();
  const [store, setStore] = useState<Store | null>(null);
  const [slot, setSlot] = useState<any>(null);
  const [plan, setPlan] = useState<'FULL' | 'DEPOSIT'>('FULL');
  const [phone, setPhone] = useState('');
  const cart = useCollectCart((state) => state.lines);
  const clearCart = useCollectCart((state) => state.clear);
  const customer = useCustomer();
  const createOrder = useCreateCollectOrder();
  const mpesa = useStartMpesa();

  const topPadding = Math.max(insets.top, 24) + 12;
  const bottomPadding = Math.max(insets.bottom, 16) + 32;

  useEffect(() => {
    currentStore.get().then(setStore);
  }, []);

  useEffect(() => {
    if (customer.data?.user?.phone && !phone) setPhone(customer.data.user.phone);
  }, [customer.data]);

  const busy = createOrder.isPending || mpesa.isPending;

  const submit = async () => {
    if (!store || !slot) return notify(`Choose a pickup time: Select an available pickup slot first.`, 'info');
    if (!cart.length) return notify(`Basket is empty: Add products before checkout.`, 'info');
    try {
      const pickupSlot = {
        slotId: slot.slotId,
        date: new Date().toISOString().slice(0, 10),
        timeWindow: `${slot.startTime}–${slot.endTime}`,
      };
      const made = await createOrder.mutateAsync({
        storeId: store._id,
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        pickupSlot,
        paymentPlan: plan,
        substitutionsAllowed: true,
      });
      await mpesa.mutateAsync({ orderId: made.order._id, phone });
      clearCart();
      router.replace('/(tabs)/orders');
      notify(`Order placed: Order ${made.order.orderNumber} has been created. Complete the M-Pesa prompt to confirm it.`, 'info');
    } catch (e) {
      notify(`Could not place order: ${e instanceof Error ? e.message : 'Please try again.'}`, 'error');
    }
  };

  return (
    <ScrollView style={s.page} contentContainerStyle={[s.content, { paddingTop: topPadding, paddingBottom: bottomPadding }]}>
      <Pressable onPress={() => router.back()} style={s.backBtn}>
        <Text style={s.back}>‹  Back to shop</Text>
      </Pressable>
      <Text style={s.heading}>Pickup & payment</Text>
      <Text style={s.sub}>{store?.name || 'Selected store'}</Text>
      <Text style={s.label}>PICK A TIME</Text>
      {(store?.pickupSlots || [])
        .filter((x) => x.active)
        .map((x) => (
          <Pressable
            key={x.slotId}
            style={[s.slot, slot?.slotId === x.slotId && s.selected]}
            onPress={() => setSlot(x)}
          >
            <Text style={s.slotText}>
              {x.startTime} – {x.endTime}
            </Text>
            <Text style={s.capacity}>{x.capacity} spaces</Text>
          </Pressable>
        ))}
      {!store?.pickupSlots?.length && (
        <Text style={s.empty}>No pickup slots are available for this store.</Text>
      )}
      <Text style={s.label}>PAYMENT PLAN</Text>
      <View style={s.plans}>
        <Pressable
          style={[s.plan, plan === 'FULL' && s.selected]}
          onPress={() => setPlan('FULL')}
        >
          <Text style={s.planTitle}>Pay in full</Text>
          <Text style={s.capacity}>Complete payment now</Text>
        </Pressable>
        <Pressable
          style={[s.plan, plan === 'DEPOSIT' && s.selected]}
          onPress={() => setPlan('DEPOSIT')}
        >
          <Text style={s.planTitle}>Pay deposit</Text>
          <Text style={s.capacity}>Pay balance at pickup</Text>
        </Pressable>
      </View>
      <Text style={s.label}>M-PESA PHONE</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="0712 345 678"
        style={s.input}
      />
      <View style={s.note}>
        <Text style={s.noteText}>
          If an item is unavailable while picking, you’ll be asked to approve or decline a replacement.
        </Text>
      </View>
      <Pressable style={s.button} onPress={submit} disabled={busy}>
        <Text style={s.buttonText}>{busy ? 'Placing order…' : 'Place order & pay'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f7f5' },
  content: { paddingHorizontal: 22 },
  backBtn: { paddingVertical: 6, alignSelf: 'flex-start' },
  back: { color: '#16A34A', fontWeight: '700', fontSize: 16 },
  heading: { fontSize: 28, fontWeight: '800', color: '#19281f', marginTop: 14 },
  sub: { color: '#78847c', marginTop: 4, marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#748078', marginTop: 18, marginBottom: 8 },
  slot: { backgroundColor: '#fff', padding: 15, borderRadius: 14, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E2E8F0' },
  selected: { borderColor: '#16A34A', backgroundColor: '#f2faf5' },
  slotText: { fontWeight: '700', color: '#27372e' },
  capacity: { color: '#7b867f', fontSize: 12 },
  plans: { flexDirection: 'row', gap: 8 },
  plan: { flex: 1, backgroundColor: '#fff', padding: 13, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  planTitle: { fontWeight: '700', color: '#27372e', marginBottom: 5 },
  input: { height: 51, backgroundColor: '#fff', borderRadius: 13, paddingHorizontal: 14, fontSize: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  note: { backgroundColor: '#eaf4ee', padding: 13, borderRadius: 13, marginTop: 20 },
  noteText: { color: '#41634f', fontSize: 13, lineHeight: 19 },
  button: { height: 54, backgroundColor: '#16A34A', borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  empty: { color: '#77837b', textAlign: 'center', padding: 14 },
});
