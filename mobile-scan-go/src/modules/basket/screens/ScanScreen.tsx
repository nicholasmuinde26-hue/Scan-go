import React, { useEffect, useState, useRef } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Line } from 'react-native-svg';
import { useCheckIn, usePresence } from '../../presence';
import { currentStore } from '../../stores';
import type { Store } from '../../stores';
import {
  activeBasket,
  basketApi,
  useScanItem,
  useUpdateBasketLine,
} from '../index';
import type { Basket, BasketLine } from '../types';
import { requestLocationPermission } from '../../../core/permissions';
import { notify, confirmDialog } from '../../../shared/ui/feedback';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [store, setStore] = useState<Store | null>(null);
  const [basket, setBasket] = useState<Basket | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [mode, setMode] = useState<'checkin' | 'scan'>('checkin');
  const [activeTab, setActiveTab] = useState<'scanned' | 'list'>('scanned');
  const [busy, setBusy] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [zoom, setZoom] = useState(0);
  const [lastScanLabel, setLastScanLabel] = useState('');
  const recentScans = useRef<Map<string, number>>(new Map());

  const topPadding = Math.max(insets.top, 24) + 10;
  const bottomDockPadding = Math.max(insets.bottom, 16) + 12;

  // Laser animation
  const laserAnim = useRef(new Animated.Value(0)).current;

  const checkinMutation = useCheckIn();
  const scanMutation = useScanItem();
  const updateLineMutation = useUpdateBasketLine();
  const presenceQuery = usePresence(store?._id);

  useEffect(() => {
    currentStore.get().then(setStore);
    return currentStore.subscribe((newStore) => {
      setStore(newStore);
      setBasket(null);
      setMode('checkin');
    });
  }, []);

  useEffect(() => {
    if (!store || !presenceQuery.data) return;
    if (presenceQuery.data.session || !presenceQuery.data.enforced) {
      setMode('scan');
      basketApi
        .open(store._id)
        .then(async (r) => {
          setBasket(r.basket);
          await activeBasket.set(r.basket._id);
        })
        .catch(() => {});
    }
  }, [store, presenceQuery.data]);

  // Start laser animation when scanner opens
  useEffect(() => {
    if (isScannerOpen) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, {
            toValue: 200,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(laserAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [isScannerOpen]);

  const handleBarcodeScanned = async (data: string) => {
    const now = Date.now();
    const lastAt = recentScans.current.get(data) || 0;
    // Per-code throttle: same barcode ignored for 2.5s (prevents frame-spam duplicates)
    // while still letting the user intentionally rescan the same item shortly after.
    if (busy || now - lastAt < 2500) return;
    recentScans.current.set(data, now);
    // Prune stale entries so the map can't grow unbounded during long sessions
    if (recentScans.current.size > 200) {
      for (const [code, ts] of recentScans.current) {
        if (now - ts > 60_000) recentScans.current.delete(code);
      }
    }
    setBusy(true);

    try {
      if (mode === 'checkin') {
        let gps: any;
        try {
          const allowed = await requestLocationPermission();
          if (allowed.granted) {
            const position = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            gps = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
          }
        } catch {}

        const r = await checkinMutation.mutateAsync({ code: data, gps });
        setMode('scan');
        setStore((s) => (s ? { ...s, _id: r.store._id, name: r.store.name } : s));
        setIsScannerOpen(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        notify(`Checked in!: You're checked in at ${r.store.name}. Tap "Scan" to scan barcodes.`, 'info');
        return;
      }

      if (!store) {
        notify(`Choose a store: Please select a supermarket from Home first.`, 'info');
        return;
      }

      let basketId = await activeBasket.get();
      if (!basketId) {
        const created = await basketApi.open(store._id);
        basketId = created.basket._id;
        await activeBasket.set(basketId);
      }

      const r = await scanMutation.mutateAsync({ basketId, barcode: data });
      setBasket(r.basket);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Continuous scanning: keep the camera open so the next item can be scanned
      // immediately. Show a brief inline confirmation instead of closing the modal.
      const items = r.basket.items || [];
      setLastScanLabel(items.length ? items[items.length - 1].name : 'Item added');
      setTimeout(() => setLastScanLabel(''), 1600);
    } catch (e: any) {
      notify(`${e instanceof Error ? e.message : 'Item barcode not recognized. Please retry or enter manually.'}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleManualScanSubmit = () => {
    if (!manualCode.trim()) return;
    setShowManualInput(false);
    handleBarcodeScanned(manualCode.trim());
    setManualCode('');
  };

  const handleQuantityChange = async (line: BasketLine, change: number) => {
    const newQty = line.quantity + change;
    const basketId = await activeBasket.get();
    if (!basketId) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const r = await updateLineMutation.mutateAsync({
        basketId,
        productId: line.productId,
        quantity: newQty,
      });
      setBasket(r.basket);
    } catch (e: any) {
      notify(`Could not update: ${e?.message || 'Failed to update item quantity.'}`, 'error');
    }
  };

  const handleClearBasket = async () => {
    if (!basket || !basket.items.length) return;
    const ok = await confirmDialog('Clear Basket', 'Are you sure you want to remove all scanned products?', 'Clear All', true);
    if (!ok) return;
    const basketId = await activeBasket.get();
    if (basketId) {
      await basketApi.clear(basketId);
      setBasket((prev) => (prev ? { ...prev, items: [], totalItems: 0, totalMinor: 0 } : null));
    }
  };

  if (!permission?.granted) {
    return (
      <View style={s.permissionPage}>
        <View style={s.permIconCircle}>
          <Text style={{ fontSize: 36 }}>📷</Text>
        </View>
        <Text style={s.permTitle}>Camera access required</Text>
        <Text style={s.permDesc}>
          Scan & Go uses your camera to scan shelf barcodes and in-store entrance posters.
        </Text>
        <Pressable style={s.permBtn} onPress={requestPermission}>
          <Text style={s.permBtnText}>Allow camera access</Text>
        </Pressable>
      </View>
    );
  }

  const itemsCount = basket?.totalItems || basket?.items?.length || 0;
  const totalFormatted = `KES ${(((basket?.totalMinor || 0) / 100)).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
  })}`;

  return (
    <View style={s.page}>
      {/* In-Store Header (Image 5 Left) */}
      <View style={[s.inStoreHeader, { paddingTop: topPadding }]}>
        <Pressable onPress={() => router.back()} style={s.headerBackBtn}>
          <Text style={s.headerBackText}>‹</Text>
        </Pressable>
        <View style={s.headerTitleArea}>
          <Text style={s.storeHeading} numberOfLines={1}>
            {store?.name || 'Scan & Go Supermarket'}
          </Text>
          <Text style={s.storeStatusDot}>● Active Shopping Session</Text>
        </View>
        <Pressable onPress={handleClearBasket} style={s.headerOptionsBtn}>
          <Text style={s.headerOptionsText}>⋮</Text>
        </Pressable>
      </View>

      {/* Segmented Tabs: Scanned products vs Shopping list (Image 5) */}
      <View style={s.tabsRow}>
        <Pressable
          style={[s.tabPill, activeTab === 'scanned' && s.tabPillActive]}
          onPress={() => setActiveTab('scanned')}
        >
          <Text style={[s.tabText, activeTab === 'scanned' && s.tabTextActive]}>
            Scanned products
          </Text>
          {itemsCount > 0 && (
            <View style={[s.tabCountBadge, activeTab === 'scanned' && s.tabCountBadgeActive]}>
              <Text style={s.tabCountText}>{itemsCount}</Text>
            </View>
          )}
        </Pressable>

        <Pressable
          style={[s.tabPill, activeTab === 'list' && s.tabPillActive]}
          onPress={() => setActiveTab('list')}
        >
          <Text style={[s.tabText, activeTab === 'list' && s.tabTextActive]}>
            Shopping list
          </Text>
        </Pressable>
      </View>

      {/* Main Scanned Items List */}
      {activeTab === 'scanned' ? (
        itemsCount === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIconCircle}>
              <Text style={{ fontSize: 44 }}>🛍</Text>
            </View>
            <Text style={s.emptyTitle}>Your basket is empty</Text>
            <Text style={s.emptyDesc}>
              Tap the green Scan button below and point your camera at any product barcode.
            </Text>
          </View>
        ) : (
          <FlatList
            data={basket?.items || []}
            keyExtractor={(item) => item.productId}
            contentContainerStyle={[s.listContent, { paddingBottom: bottomDockPadding + 90 }]}
            renderItem={({ item }) => (
              <View style={s.scannedCard}>
                <View style={s.cardTopRow}>
                  <View style={s.itemThumb}>
                    <Text style={{ fontSize: 20 }}>📦</Text>
                  </View>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={s.itemName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    {item.labelBarcode && (
                      <Text style={s.itemBarcode}>Code: {item.labelBarcode}</Text>
                    )}
                    <Text style={s.itemUnitPrice}>
                      KES {((item.unitPriceMinor / 100)).toFixed(2)} each
                    </Text>
                  </View>
                  <Text style={s.itemTotalPrice}>
                    KES {(((item.unitPriceMinor * item.quantity) / 100)).toFixed(2)}
                  </Text>
                </View>

                {/* Stepper & Delete */}
                <View style={s.cardBottomRow}>
                  <Pressable
                    style={s.deleteBtn}
                    onPress={() => handleQuantityChange(item, -item.quantity)}
                  >
                    <Text style={s.deleteIcon}>🗑</Text>
                  </Pressable>

                  <View style={s.stepper}>
                    <Pressable
                      style={s.stepBtn}
                      onPress={() => handleQuantityChange(item, -1)}
                    >
                      <Text style={s.stepBtnText}>−</Text>
                    </Pressable>
                    <Text style={s.stepQty}>{item.quantity}</Text>
                    <Pressable
                      style={s.stepBtn}
                      onPress={() => handleQuantityChange(item, 1)}
                    >
                      <Text style={s.stepBtnText}>＋</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          />
        )
      ) : (
        <View style={s.emptyState}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📝</Text>
          <Text style={s.emptyTitle}>Personal Shopping List</Text>
          <Text style={s.emptyDesc}>
            Items you mark here will cross off automatically as you scan them into your basket.
          </Text>
        </View>
      )}

      {/* Docked In-Store Action Bar (Image 5 Left Bottom) */}
      <View style={[s.dockedBar, { paddingBottom: bottomDockPadding }]}>
        {/* Remove item button */}
        <Pressable
          style={s.dockRemoveBtn}
          onPress={handleClearBasket}
          disabled={itemsCount === 0}
        >
          <Text style={[s.dockRemoveIcon, itemsCount === 0 && { opacity: 0.3 }]}>🗑</Text>
          <Text style={[s.dockRemoveText, itemsCount === 0 && { opacity: 0.3 }]}>
            Remove item
          </Text>
        </Pressable>

        {/* Center Floating Scan FAB Button (Image 5) */}
        <Pressable
          style={s.centerScanFab}
          onPress={() => setIsScannerOpen(true)}
        >
          <View style={s.fabInnerRing}>
            <Text style={s.fabIcon}>⌗</Text>
            <Text style={s.fabLabel}>{mode === 'checkin' ? 'Check In' : 'Scan'}</Text>
          </View>
        </Pressable>

        {/* Total & Checkout Pill (Image 5) */}
        <Pressable
          style={[s.checkoutPill, itemsCount === 0 && s.checkoutPillDisabled]}
          onPress={() => {
            if (itemsCount === 0) {
              notify(`Basket Empty: Scan items with the camera first.`, 'info');
              return;
            }
            router.push('/checkout');
          }}
        >
          <Text style={s.checkoutAmount}>{totalFormatted}</Text>
          <Text style={s.checkoutText}>Checkout ›</Text>
        </Pressable>
      </View>

      {/* Full-Screen Barcode Scanner Camera Modal (Image 5 Center) */}
      <Modal visible={isScannerOpen} animationType="slide" transparent={false}>
        <View style={s.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torchOn}
            autofocus="on"
            zoom={zoom}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr', 'code128', 'code39', 'itf14'],
            }}
            onBarcodeScanned={({ data }) => handleBarcodeScanned(data)}
          />

          {/* Scanner Overlay UI (Image 5 Center) */}
          <View style={[s.scannerOverlay, { paddingTop: topPadding, paddingBottom: bottomDockPadding + 14 }]}>
            {/* Top Bar with Close and Torch */}
            <View style={s.scannerTopBar}>
              <Pressable
                style={s.scannerCloseBtn}
                onPress={() => setIsScannerOpen(false)}
              >
                <Text style={s.scannerCloseText}>✕</Text>
              </Pressable>

              <Pressable
                style={[s.torchBtn, torchOn && s.torchBtnActive]}
                onPress={() => setTorchOn(!torchOn)}
              >
                <Text style={s.torchText}>{torchOn ? '🔦 ON' : '🔦'}</Text>
              </Pressable>
            </View>

            {/* Instruction Title */}
            <View style={s.scannerInstruction}>
              <Text style={s.scannerTitleIcon}>⌗</Text>
              <Text style={s.scannerTitle}>
                {mode === 'checkin' ? 'Check in at the entrance' : 'Add product'}
              </Text>
              <Text style={s.scannerSubtitle}>
                {mode === 'checkin'
                  ? 'Scan the store entrance poster to begin'
                  : 'Align barcode inside the frame'}
              </Text>
            </View>

            {/* Viewfinder Reticle Frame with Moving Laser Line */}
            <View style={s.viewfinderWrapper}>
              <View style={s.viewfinder}>
                {/* Corner reticle marks */}
                <View style={[s.corner, s.cornerTL]} />
                <View style={[s.corner, s.cornerTR]} />
                <View style={[s.corner, s.cornerBL]} />
                <View style={[s.corner, s.cornerBR]} />

                {/* Animated Green Laser Line */}
                <Animated.View
                  style={[
                    s.laserLine,
                    {
                      transform: [{ translateY: laserAnim }],
                    },
                  ]}
                />
              </View>
            </View>

            {/* Scan confirmation badge (continuous mode) */}
            {lastScanLabel ? (
              <View style={s.scanBadge}>
                <Text style={s.scanBadgeText}>✓ {lastScanLabel}</Text>
              </View>
            ) : null}

            {/* Zoom controls for distance scanning */}
            {mode === 'scan' && (
              <View style={s.zoomPad}>
                <Pressable
                  style={[s.zoomBtn, zoom <= 0 && s.zoomBtnDisabled]}
                  onPress={() => setZoom((z) => Math.max(0, +(z - 0.2).toFixed(2)))}
                  disabled={zoom <= 0}
                >
                  <Text style={s.zoomBtnText}>−</Text>
                </Pressable>
                <Text style={s.zoomLabel}>{Math.round(zoom * 100)}%</Text>
                <Pressable
                  style={[s.zoomBtn, zoom >= 1 && s.zoomBtnDisabled]}
                  onPress={() => setZoom((z) => Math.min(1, +(z + 0.2).toFixed(2)))}
                  disabled={zoom >= 1}
                >
                  <Text style={s.zoomBtnText}>＋</Text>
                </Pressable>
              </View>
            )}

            {/* Manual Code Entry Button (Image 5 Center) */}
            <View style={s.scannerBottomArea}>
              <Pressable
                style={s.manualEntryBtn}
                onPress={() => setShowManualInput(true)}
              >
                <Text style={s.manualMagnifier}>🔍</Text>
                <Text style={s.manualEntryText}>Enter barcode or name manually</Text>
              </Pressable>

              <Text style={s.scannerTip}>
                {busy ? 'Scanning...' : 'Hold phone 10-15cm from barcode'}
              </Text>
            </View>
          </View>

          {/* Manual Input Modal */}
          {showManualInput && (
            <View style={s.manualModalOverlay}>
              <View style={s.manualModalSheet}>
                <Text style={s.manualModalTitle}>Enter Barcode Manually</Text>
                <Text style={s.manualModalSub}>
                  Type the digits printed below the barcode
                </Text>
                <TextInput
                  value={manualCode}
                  onChangeText={setManualCode}
                  placeholder="e.g. 5060947544543"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  autoFocus
                  style={s.manualInput}
                />
                <View style={s.manualActions}>
                  <Pressable
                    style={s.manualCancel}
                    onPress={() => setShowManualInput(false)}
                  >
                    <Text style={s.manualCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={s.manualSubmit}
                    onPress={handleManualScanSubmit}
                  >
                    <Text style={s.manualSubmitText}>Scan Code</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F8FAF8',
  },
  permissionPage: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  permIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  permTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  permDesc: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  permBtn: {
    backgroundColor: '#16A34A',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 16,
  },
  permBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  inStoreHeader: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 52 : 44,
    paddingHorizontal: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerBackText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    lineHeight: 24,
  },
  headerTitleArea: {
    flex: 1,
  },
  storeHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  storeStatusDot: {
    fontSize: 11,
    color: '#16A34A',
    fontWeight: '700',
    marginTop: 2,
  },
  headerOptionsBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerOptionsText: {
    fontSize: 20,
    color: '#64748B',
    fontWeight: '700',
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    gap: 8,
  },
  tabPillActive: {
    backgroundColor: '#DCFCE7',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#15803D',
  },
  tabCountBadge: {
    backgroundColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabCountBadgeActive: {
    backgroundColor: '#16A34A',
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingBottom: 120,
  },
  scannedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  itemThumb: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 18,
  },
  itemBarcode: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  itemUnitPrice: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  itemTotalPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#15803D',
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIcon: {
    fontSize: 15,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 8,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  stepQty: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    minWidth: 18,
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 100,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
  },
  dockedBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  dockRemoveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  dockRemoveIcon: {
    fontSize: 20,
  },
  dockRemoveText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  centerScanFab: {
    position: 'relative',
    top: -18,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  fabInnerRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: {
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: '900',
  },
  fabLabel: {
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  checkoutPill: {
    backgroundColor: '#16A34A',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  checkoutPillDisabled: {
    backgroundColor: '#CBD5E1',
  },
  checkoutAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  checkoutText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    opacity: 0.9,
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 54 : 44,
    paddingBottom: 40,
    alignItems: 'center',
  },
  scannerTopBar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  scannerCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerCloseText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  torchBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchBtnActive: {
    backgroundColor: '#EAB308',
  },
  torchText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  scannerInstruction: {
    alignItems: 'center',
  },
  scannerTitleIcon: {
    fontSize: 26,
    color: '#FFFFFF',
  },
  scannerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  scannerSubtitle: {
    fontSize: 13,
    color: '#E2E8F0',
    marginTop: 4,
  },
  viewfinderWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinder: {
    width: 260,
    height: 200,
    borderRadius: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#22C55E',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 18,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 18,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 18,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 18,
  },
  laserLine: {
    width: '100%',
    height: 3,
    backgroundColor: '#22C55E',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  scannerBottomArea: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 28,
  },
  manualEntryBtn: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  manualMagnifier: {
    fontSize: 16,
  },
  manualEntryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  scannerTip: {
    fontSize: 12,
    color: '#CBD5E1',
    marginTop: 12,
  },
  manualModalOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  manualModalSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
  },
  manualModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  manualModalSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 16,
  },
  manualInput: {
    height: 48,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    color: '#0F172A',
  },
  manualActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  manualCancel: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  manualSubmit: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualSubmitText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  scanBadge: {
    position: 'absolute',
    top: '38%',
    alignSelf: 'center',
    backgroundColor: 'rgba(22,163,74,0.92)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    zIndex: 5,
  },
  scanBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  zoomPad: {
    position: 'absolute',
    right: 18,
    top: '55%',
    alignItems: 'center',
    gap: 8,
    zIndex: 5,
  },
  zoomBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15,23,42,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnDisabled: {
    opacity: 0.4,
  },
  zoomBtnText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
  },
  zoomLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(15,23,42,0.72)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
