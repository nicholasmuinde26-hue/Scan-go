import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useTopInset, useBottomInset } from '../../../core/safeArea';
import { guestStore } from '../store';
import { guestApi } from '../api';
import type { GuestBasket, GuestBasketLine } from '../api';
import { currentStore } from '../../stores/store';
import { catalogApi } from '../../catalog/api';
import { notify, confirmDialog } from '../../../shared/ui/feedback';
import { formatKes } from '../../../shared/money';

export default function GuestShopScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [basket, setBasket] = useState<GuestBasket | null>(null);
  const [pass, setPass] = useState<{ passId: string; storeName?: string } | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const recentScans = useRef<Map<string, number>>(new Map());
  const laserAnim = useRef(new Animated.Value(0)).current;
  const beep = useAudioPlayer(require('../../../../assets/beep.wav'));

  const topPadding = useTopInset(10);
  const bottomPadding = useBottomInset(12);

  useEffect(() => {
    (async () => {
      const session = await guestStore.get();
      if (!session) {
        router.replace('/guest');
        return;
      }
      setPass({ passId: session.passId, storeName: session.storeName });
      try {
        let b = (await guestApi.currentBasket()).basket;
        if (!b) {
          b = (await guestApi.openBasket(session.storeId)).basket;
        }
        setBasket(b);
      } catch (e: any) {
        notify(e.message || 'Could not load your guest basket.', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isScannerOpen) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(laserAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(laserAnim, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isScannerOpen]);

  const scan = async (barcode: string) => {
    const now = Date.now();
    const last = recentScans.current.get(barcode) || 0;
    if (busy || now - last < 2500) return;
    recentScans.current.set(barcode, now);
    setBusy(true);
    try {
      beep.seekTo(0);
      beep.play();
    } catch {}
    try {
      // Resolve first: warn on unrecognized codes, confirm before adding.
      let productName = '';
      let productPrice = 0;
      try {
        const session = await guestStore.get();
        const pr = await catalogApi.barcode(barcode, session?.storeId);
        productName = pr.product?.name || '';
        productPrice = pr.product?.priceMinor || 0;
      } catch {
        productName = '';
      }
      if (!productName) {
        notify('Not recognized — this barcode is not a registered product at this store.', 'error');
        return;
      }
      const ok = await confirmDialog('Add to basket?', `${productName} — ${formatKes(productPrice)}`, 'Add', false);
      if (!ok) return;

      let basketId = basket?._id;
      if (!basketId) {
        const session = await guestStore.get();
        if (!session) throw new Error('Guest session expired.');
        basketId = (await guestApi.openBasket(session.storeId)).basket._id;
      }
      const r = await guestApi.scan(basketId, barcode);
      setBasket(r.basket);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      notify(e.message || 'Barcode not recognized.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // "Scan from photo" — decode a barcode server-side (same ZXing path as the
  // main scanner and the web file-upload flow), then run the normal scan.
  const scanFromPhoto = async (source: 'camera' | 'library') => {
    if (busy) return;
    try {
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        base64: true,
        quality: 0.7,
        allowsEditing: false,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.assets?.[0];
      if (result.canceled || !asset?.base64) return;
      const mime = asset.mimeType || 'image/jpeg';
      const r = await catalogApi.decodeImage(`data:${mime};base64,${asset.base64}`);
      setIsScannerOpen(false);
      notify(`Detected: ${r.barcode}`, 'info');
      await scan(r.barcode);
    } catch (e: any) {
      notify(e?.message || 'Could not read a barcode from that photo.', 'error');
    }
  };

  const changeQty = async (line: GuestBasketLine, delta: number) => {
    if (!basket) return;
    const qty = line.quantity + delta;
    try {
      const r = await guestApi.setQuantity(basket._id, line.productId, qty);
      setBasket(r.basket);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) {
      notify(e.message || 'Could not update item.', 'error');
    }
  };

  const clearBasket = async () => {
    if (!basket?.items.length) return;
    const ok = await confirmDialog('Clear basket', 'Remove all scanned items?', 'Clear', true);
    if (!ok || !basket) return;
    try {
      const r = await guestApi.clear(basket._id);
      setBasket(r.basket);
    } catch (e: any) {
      notify(e.message || 'Could not clear basket.', 'error');
    }
  };

  const leaveGuest = async () => {
    const ok = await confirmDialog('End guest session', 'Your guest pass will be deactivated on this device. Items in an open basket remain for the till.', 'End session', true);
    if (!ok) return;
    await guestStore.clear();
    router.replace('/');
  };

  if (loading) {
    return (
      <View style={[s.page, s.center]}>
        <ActivityIndicator size="large" color="#16A34A" />
      </View>
    );
  }

  if (!permission?.granted) {
    return (
      <View style={[s.page, s.center, { padding: 32 }]}>
        <Text style={s.permTitle}>Camera access needed</Text>
        <Text style={s.permDesc}>The guest scanner uses your camera to read product barcodes.</Text>
        <Pressable style={s.primaryBtn} onPress={requestPermission}>
          <Text style={s.primaryBtnText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  const itemCount = basket?.totalItems || basket?.items?.length || 0;

  return (
    <View style={s.page}>
      <View style={[s.header, { paddingTop: topPadding }]}>
        <Pressable onPress={() => router.back()} style={s.iconBtn}>
          <Text style={s.iconBtnText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.storeName} numberOfLines={1}>{pass?.storeName || 'Guest shopping'}</Text>
          <Text style={s.passLabel}>Pass {pass?.passId}</Text>
        </View>
        <Pressable onPress={leaveGuest} style={s.iconBtn}>
          <Text style={s.iconBtnText}>⏻</Text>
        </Pressable>
      </View>

      <View style={s.scanCard}>
        <Pressable style={s.scanButton} onPress={() => setIsScannerOpen(true)}>
          <Text style={s.scanIcon}>▣</Text>
          <Text style={s.scanTitle}>Scan an item</Text>
          <Text style={s.scanSub}>Point your camera at a barcode</Text>
        </Pressable>
        <Pressable style={s.manualLink} onPress={() => setShowManual(true)}>
          <Text style={s.manualText}>Enter code manually</Text>
        </Pressable>
      </View>

      <FlatList
        data={basket?.items || []}
        keyExtractor={(i) => i.productId}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPadding + 90, gap: 10 }}
        ListHeaderComponent={
          <View style={s.listHeader}>
            <Text style={s.listTitle}>Your basket</Text>
            {!!basket?.items.length && (
              <Pressable onPress={clearBasket}>
                <Text style={s.clearText}>Clear</Text>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={s.emptyCard}>
            <Text style={s.emptyText}>Nothing scanned yet — scan your first item above.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.lineCard}>
            <View style={{ flex: 1 }}>
              <Text style={s.lineName} numberOfLines={2}>{item.name}</Text>
              <Text style={s.linePrice}>{formatKes(item.unitPriceMinor * item.quantity)}</Text>
            </View>
            <View style={s.qtyRow}>
              <Pressable style={s.qtyBtn} onPress={() => changeQty(item, -1)}>
                <Text style={s.qtyBtnText}>−</Text>
              </Pressable>
              <Text style={s.qtyValue}>{item.quantity}</Text>
              <Pressable style={s.qtyBtn} onPress={() => changeQty(item, 1)}>
                <Text style={s.qtyBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      {/* Sticky checkout → pay at till */}
      <View style={[s.bottomBar, { paddingBottom: bottomPadding }]}>
        <View>
          <Text style={s.bottomCount}>{itemCount} item{itemCount === 1 ? '' : 's'}</Text>
          <Text style={s.bottomTotal}>{formatKes(basket?.totalMinor || 0)}</Text>
        </View>
        <Pressable
          style={[s.payBtn, itemCount === 0 && s.payBtnDisabled]}
          disabled={itemCount === 0}
          onPress={() => router.push('/guest-checkout')}
        >
          <Text style={s.payBtnText}>Pay at till →</Text>
        </Pressable>
      </View>

      {/* Camera scanner modal */}
      <Modal visible={isScannerOpen} animationType="slide">
        <View style={s.cameraPage}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] }}
            onBarcodeScanned={({ data }) => {
              setIsScannerOpen(false);
              scan(data);
            }}
          />
          <View style={[s.cameraOverlay, { paddingTop: topPadding }]} pointerEvents="box-none">
            <StatusBar style="light" />
            <Pressable style={s.cameraClose} onPress={() => setIsScannerOpen(false)}>
              <Text style={s.cameraCloseText}>✕</Text>
            </Pressable>
            <View style={s.viewfinder}>
              <Animated.View
                style={[
                  s.laser,
                  { transform: [{ translateY: laserAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 180] }) }] },
                ]}
              />
            </View>
            <Text style={s.cameraHint}>Align the barcode inside the frame</Text>
            <Pressable
              style={s.photoScanBtn}
              onPress={() =>
                Alert.alert('Scan from photo', 'Camera not locking on? Use a photo instead.', [
                  { text: 'Take photo', onPress: () => scanFromPhoto('camera') },
                  { text: 'Choose from gallery', onPress: () => scanFromPhoto('library') },
                  { text: 'Cancel', style: 'cancel' },
                ])
              }
            >
              <Text style={s.photoScanText}>🖼  Scan from photo</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Manual entry modal */}
      <Modal visible={showManual} transparent animationType="fade">
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Enter item code</Text>
            <TextInput
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="Barcode / PLU"
              keyboardType="number-pad"
              autoFocus
              style={s.modalInput}
            />
            <View style={s.modalRow}>
              <Pressable style={s.modalGhost} onPress={() => setShowManual(false)}>
                <Text style={s.modalGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={s.modalPrimary}
                onPress={() => {
                  const code = manualCode.trim();
                  setShowManual(false);
                  setManualCode('');
                  if (code) scan(code);
                }}
              >
                <Text style={s.modalPrimaryText}>Add</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F8F6' },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8ECE8',
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F1F5F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 20, color: '#16A34A', fontWeight: '800' },
  storeName: { fontSize: 16, fontWeight: '800', color: '#14271D' },
  passLabel: { fontSize: 12, color: '#7A8A80', marginTop: 2 },
  scanCard: { padding: 20, alignItems: 'center' },
  scanButton: {
    width: '100%',
    backgroundColor: '#16A34A',
    borderRadius: 20,
    paddingVertical: 28,
    alignItems: 'center',
    shadowColor: '#16A34A',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  scanIcon: { fontSize: 34, color: '#FFFFFF', marginBottom: 6 },
  scanTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  scanSub: { fontSize: 13, color: '#DCFCE7', marginTop: 4 },
  manualLink: { marginTop: 14, padding: 8 },
  manualText: { color: '#16A34A', fontWeight: '700', fontSize: 14 },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  listTitle: { fontSize: 18, fontWeight: '800', color: '#14271D' },
  clearText: { color: '#DC2626', fontWeight: '700', fontSize: 13 },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8ECE8',
  },
  emptyText: { color: '#7A8A80', textAlign: 'center', lineHeight: 20 },
  lineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8ECE8',
  },
  lineName: { fontSize: 14, fontWeight: '700', color: '#1F2D24' },
  linePrice: { fontSize: 13, color: '#16A34A', fontWeight: '700', marginTop: 4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F1F5F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 18, fontWeight: '800', color: '#16A34A' },
  qtyValue: { fontSize: 15, fontWeight: '800', color: '#14271D', minWidth: 20, textAlign: 'center' },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E8ECE8',
  },
  bottomCount: { fontSize: 12, color: '#7A8A80', fontWeight: '600' },
  bottomTotal: { fontSize: 20, fontWeight: '900', color: '#14271D' },
  payBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  payBtnDisabled: { backgroundColor: '#CBD5D1' },
  payBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  cameraPage: { flex: 1, backgroundColor: '#000' },
  cameraOverlay: { ...StyleSheet.absoluteFill as object, alignItems: 'center' },
  cameraClose: {
    alignSelf: 'flex-end',
    margin: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraCloseText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  viewfinder: {
    marginTop: 120,
    width: 260,
    height: 180,
    borderWidth: 2,
    borderColor: '#16A34A',
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  laser: {
    position: 'absolute',
    width: '90%',
    height: 3,
    backgroundColor: '#22C55E',
    shadowColor: '#22C55E',
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  cameraHint: { color: '#FFFFFF', marginTop: 24, fontSize: 14, fontWeight: '600' },
  photoScanBtn: {
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  photoScanText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 28,
  },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 22 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#14271D', marginBottom: 14 },
  modalInput: {
    height: 50,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#14271D',
    marginBottom: 18,
  },
  modalRow: { flexDirection: 'row', gap: 12 },
  modalGhost: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F1F5F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalGhostText: { fontWeight: '700', color: '#475569' },
  modalPrimary: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryText: { fontWeight: '800', color: '#FFFFFF' },
  permTitle: { fontSize: 20, fontWeight: '800', color: '#14271D', marginBottom: 8, textAlign: 'center' },
  permDesc: { fontSize: 14, color: '#7A8A80', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  primaryBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 16,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
