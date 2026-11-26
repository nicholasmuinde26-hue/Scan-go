import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useTopInset, useBottomInset } from '../../../core/safeArea';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { redeemPass } from '../api';
import { notify } from '../../../shared/ui/feedback';

export default function GuestGateScreen() {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  const topPadding = useTopInset(12);
  const bottomPadding = useBottomInset(24);

  const redeem = async () => {
    const value = token.trim();
    if (!value) return notify('Enter your guest pass code to continue.', 'info');
    setBusy(true);
    try {
      const result = await redeemPass(value);
      notify(`Welcome! Guest pass ${result.passId} activated at ${result.session.storeName}.`, 'info');
      router.replace('/(tabs)');
    } catch (e: any) {
      notify(e instanceof Error ? e.message : 'Could not redeem this pass.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={s.page}
    >
      <View style={[s.content, { paddingTop: topPadding, paddingBottom: bottomPadding }]}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backText}>‹  Back</Text>
        </Pressable>

        <View style={s.heroCircle}>
          <Svg width={120} height={120} viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="46" fill="#DCFCE7" />
            <Rect x="28" y="30" width="44" height="34" rx="5" fill="#16A34A" />
            <Rect x="33" y="36" width="20" height="12" rx="2" fill="#FFFFFF" opacity={0.9} />
            <Circle cx="62" cy="56" r="4" fill="#F97316" />
            <Path d="M36 68 L64 68 L60 78 L40 78 Z" fill="#15803D" />
          </Svg>
        </View>

        <Text style={s.heading}>Shop as a guest</Text>
        <Text style={s.sub}>
          No account needed. Ask a staff member for a guest pass at the store
          entrance, then enter the pass code below to start scanning.
        </Text>

        <View style={s.card}>
          <Text style={s.label}>GUEST PASS CODE</Text>
          <TextInput
            value={token}
            onChangeText={setToken}
            placeholder="sgp_… or scan the pass QR"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            autoCorrect={false}
            style={s.input}
          />
          <Pressable style={[s.primaryBtn, busy && s.btnDisabled]} onPress={redeem} disabled={busy}>
            <Text style={s.primaryBtnText}>{busy ? 'Activating…' : 'Activate guest pass'}</Text>
          </Pressable>
        </View>

        <View style={s.tipCard}>
          <Text style={s.tipTitle}>How it works</Text>
          <Text style={s.tipLine}>• Get a guest pass from any staff member</Text>
          <Text style={s.tipLine}>• Scan items with your phone camera</Text>
          <Text style={s.tipLine}>• Pay at the till — show your pass code</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flex: 1, paddingHorizontal: 24 },
  backBtn: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { color: '#16A34A', fontWeight: '700', fontSize: 16 },
  heroCircle: { alignItems: 'center', marginTop: 12, marginBottom: 20 },
  heading: { fontSize: 28, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  sub: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20, marginTop: 10, marginBottom: 24 },
  card: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
  },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: '#64748B', marginBottom: 8 },
  input: {
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    color: '#0F172A',
    marginBottom: 16,
  },
  primaryBtn: {
    height: 52,
    backgroundColor: '#16A34A',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  tipCard: {
    marginTop: 24,
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    padding: 18,
  },
  tipTitle: { fontSize: 14, fontWeight: '800', color: '#15803D', marginBottom: 8 },
  tipLine: { fontSize: 13, color: '#3F6212', lineHeight: 22 },
});
