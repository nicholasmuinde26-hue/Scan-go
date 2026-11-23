import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { useExitPass } from '../hooks';

export default function ExitPassScreen() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const pass = useExitPass(orderId);

  const topPadding = Math.max(insets.top, 24) + 12;
  const bottomPadding = Math.max(insets.bottom, 16) + 20;

  return (
    <View style={[s.page, { paddingTop: topPadding, paddingBottom: bottomPadding }]}>
      <Text style={s.heading}>Scan & Go exit pass</Text>
      <Text style={s.sub}>{pass.data?.offline ? 'Offline · saved pass shown' : 'Show this QR to the cashier'}</Text>
      {pass.data ? (
        <View style={s.qr}>
          <QRCode value={pass.data.dynamicQrToken} size={250} />
        </View>
      ) : (
        <ActivityIndicator style={{ margin: 50 }} color="#16A34A" />
      )}
      <Text style={s.order}>Order {pass.data?.orderNumber || ''}</Text>
      <Text style={s.note}>
        Keep this screen open for exit verification. The QR refreshes automatically when online.
      </Text>
      <Pressable style={s.button} onPress={() => router.replace('/(tabs)/orders')}>
        <Text style={s.buttonText}>Done</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#eff7f1', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  heading: { fontSize: 25, fontWeight: '800', color: '#14271d' },
  sub: { color: '#5d7064', marginTop: 7 },
  qr: { backgroundColor: '#fff', padding: 20, borderRadius: 20, marginTop: 30 },
  order: { fontSize: 21, fontWeight: '800', color: '#15271e', marginTop: 24 },
  note: { color: '#64756a', textAlign: 'center', lineHeight: 20, marginTop: 8, maxWidth: 290 },
  button: { height: 52, backgroundColor: '#16A34A', borderRadius: 15, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  buttonText: { color: '#fff', fontWeight: '800' },
});
