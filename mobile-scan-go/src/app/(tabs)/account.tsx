import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTopInset } from '../../core/safeArea';
import { guestStore } from '../../modules/guest/store';
import AccountScreen from '../../modules/account/screens/AccountScreen';

/** Guest account view: shows the active pass and offers sign-in / register. */
function GuestAccountView({ onEnd }: { onEnd: () => void }) {
  const topPadding = useTopInset(12);
  const [pass, setPass] = useState<{ passId: string; storeName?: string } | null>(null);

  useEffect(() => {
    guestStore.get().then((s: any) => setPass(s ? { passId: s.passId, storeName: s.storeName } : null));
  }, []);

  return (
    <View style={[s.page, { paddingTop: topPadding }]}>
      <Text style={s.heading}>Account</Text>
      <View style={s.card}>
        <Text style={s.cardLabel}>GUEST SESSION</Text>
        <Text style={s.passId}>{pass?.passId || '—'}</Text>
        <Text style={s.store}>{pass?.storeName || ''}</Text>
        <Text style={s.hint}>You're shopping without an account. Pay at the till with this pass.</Text>
      </View>
      <Pressable style={s.primary} onPress={() => router.push('/')}>
        <Text style={s.primaryText}>Sign in</Text>
      </Pressable>
      <Pressable style={s.secondary} onPress={() => router.push('/register')}>
        <Text style={s.secondaryText}>Create account</Text>
      </Pressable>
      <Pressable style={s.endLink} onPress={onEnd}>
        <Text style={s.endText}>End guest session</Text>
      </Pressable>
    </View>
  );
}

export default function AccountTab() {
  const [isGuest, setIsGuest] = useState<boolean | null>(null);
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    guestStore.isGuest().then(setIsGuest);
  }, [sessionKey]);

  const endGuest = async () => {
    await guestStore.clear();
    setSessionKey((k) => k + 1);
    router.replace('/');
  };

  if (isGuest === null) return null;
  return isGuest ? <GuestAccountView onEnd={endGuest} /> : <AccountScreen />;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f7f5', paddingHorizontal: 20 },
  heading: { fontSize: 28, fontWeight: '800', color: '#17251e', marginBottom: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center' },
  cardLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#7a857e' },
  passId: { fontSize: 24, fontWeight: '900', color: '#16A34A', marginTop: 8, letterSpacing: 1 },
  store: { fontSize: 13, color: '#647168', marginTop: 4 },
  hint: { fontSize: 12, color: '#7a857e', textAlign: 'center', marginTop: 12, lineHeight: 18 },
  primary: { backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondary: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 10, borderWidth: 1.5, borderColor: '#16A34A' },
  secondaryText: { color: '#16A34A', fontWeight: '800', fontSize: 15 },
  endLink: { marginTop: 24, alignItems: 'center', padding: 10 },
  endText: { color: '#DC2626', fontWeight: '700', fontSize: 13 },
});
