import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * App-wide feedback kit replacing Alert.alert:
 * - notify(): transient toast (success/error/info)
 * - confirm(): bottom-sheet style confirmation returning a Promise<boolean>
 * Mount <FeedbackHost /> once in the root layout.
 */

type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string };
const FeedbackCtx = createContext<{
  notify: (text: string, kind?: Toast['kind']) => void;
  confirm: (title: string, message?: string, confirmLabel?: string, destructive?: boolean) => Promise<boolean>;
}>({ notify: () => {}, confirm: async () => false });

export const useFeedback = () => useContext(FeedbackCtx);

// Imperative API — works anywhere without hooks once FeedbackHost is mounted.
let emitter: { notify: (t: string, k?: Toast['kind']) => void; confirm: (t: string, m?: string, c?: string, d?: boolean) => Promise<boolean> } | null = null;
export const notify = (text: string, kind: Toast['kind'] = 'info') => emitter?.notify(text, kind);
export const confirmDialog = (title: string, message?: string, confirmLabel = 'Confirm', destructive = false) =>
  emitter ? emitter.confirm(title, message, confirmLabel, destructive) : Promise.resolve(false);

let toastId = 0;

export function FeedbackHost({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{ title: string; message?: string; confirmLabel?: string; destructive?: boolean; resolve: (v: boolean) => void } | null>(null);
  const timers = useRef<Record<number, any>>({});

  const notify = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId;
    setToasts((t) => [...t.slice(-2), { id, kind, text }]);
    timers.current[id] = setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const confirm = useCallback((title: string, message?: string, confirmLabel = 'Confirm', destructive = false) => {
    return new Promise<boolean>((resolve) => setConfirmState({ title, message, confirmLabel, destructive, resolve }));
  }, []);

  const closeConfirm = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  React.useEffect(() => {
    emitter = { notify, confirm };
    return () => { emitter = null; };
  }, [notify, confirm]);

  const iconFor = (kind: Toast['kind']) =>
    kind === 'success' ? 'checkmark-circle' : kind === 'error' ? 'alert-circle' : 'information-circle';
  const colorFor = (kind: Toast['kind']) =>
    kind === 'success' ? '#16A34A' : kind === 'error' ? '#DC2626' : '#2563EB';

  return (
    <FeedbackCtx.Provider value={{ notify, confirm }}>
      {children}
      {/* Toast stack */}
      <View style={s.toastWrap} pointerEvents="none">
        {toasts.map((t) => (
          <View key={t.id} style={[s.toast, { borderLeftColor: colorFor(t.kind) }]}>
            <Ionicons name={iconFor(t.kind) as any} size={18} color={colorFor(t.kind)} />
            <Text style={s.toastText}>{t.text}</Text>
          </View>
        ))}
      </View>
      {/* Confirm sheet */}
      <Modal visible={!!confirmState} transparent animationType="fade" onRequestClose={() => closeConfirm(false)}>
        <Pressable style={s.sheetBackdrop} onPress={() => closeConfirm(false)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={s.sheetTitle}>{confirmState?.title}</Text>
            {!!confirmState?.message && <Text style={s.sheetMsg}>{confirmState.message}</Text>}
            <View style={s.sheetBtns}>
              <Pressable style={s.sheetCancel} onPress={() => closeConfirm(false)}>
                <Text style={s.sheetCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.sheetOk, confirmState?.destructive && { backgroundColor: '#DC2626' }]}
                onPress={() => closeConfirm(true)}
              >
                <Text style={s.sheetOkText}>{confirmState?.confirmLabel}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </FeedbackCtx.Provider>
  );
}

export function Skeleton({ width = '100%', height = 16, style }: { width?: number | `${number}%`; height?: number; style?: any }) {
  const opacity = React.useRef(new Animated.Value(0.4)).current;
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[{ width: width as any, height, borderRadius: 8, backgroundColor: '#E2E8F0', opacity }, style]} />;
}

export function ProductCardSkeleton() {
  return (
    <View style={{ flex: 1, margin: 6 }}>
      <Skeleton height={110} style={{ borderRadius: 14 }} />
      <Skeleton height={12} style={{ marginTop: 8, width: '80%' }} />
      <Skeleton height={12} style={{ marginTop: 6, width: '50%' }} />
    </View>
  );
}

const s = StyleSheet.create({
  toastWrap: { position: 'absolute', top: 50, left: 16, right: 16, gap: 8, zIndex: 999 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12,
    borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 6,
  },
  toastText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#0F172A' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  sheetMsg: { fontSize: 13, color: '#475569', marginTop: 6, lineHeight: 19 },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 18 },
  sheetCancel: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center' },
  sheetCancelText: { fontWeight: '700', color: '#475569' },
  sheetOk: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#16A34A', alignItems: 'center' },
  sheetOkText: { fontWeight: '700', color: '#FFF' },
});
