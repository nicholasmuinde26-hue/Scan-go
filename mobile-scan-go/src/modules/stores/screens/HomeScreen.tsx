import React, { useEffect, useState } from 'react';
import {
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
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTopInset, useBottomInset } from '../../../core/safeArea';
import * as Haptics from 'expo-haptics';
import { useStores } from '../hooks';
import { currentStore } from '../store';
import { useCollectCart } from '../../cart/store';
import { useProducts } from '../../catalog/hooks';
import { ProductVisual, getProductEmoji } from '../../catalog/components/ProductVisual';
import type { Store } from '../types';
import type { Product } from '../../catalog/types';
import { notify, confirmDialog, Skeleton } from '../../../shared/ui/feedback';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PASTEL_COLORS = [
  '#DCFCE7',
  '#FFE4E6',
  '#FEF3C7',
  '#E0E7FF',
  '#FFEDD5',
  '#F1F5F9',
  '#FEF9C3',
  '#FEE2E2',
];

export default function HomeScreen() {

  const [store, setStore] = useState<Store | null>(null);
  const [showStorePicker, setShowStorePicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const storesQuery = useStores();
  const cartLines = useCollectCart((state) => state.lines);
  const addCartLine = useCollectCart((state) => state.add);

  // Fetch live products for the selected store from the database
  const productsQuery = useProducts({
    storeId: store?._id,
    search: searchQuery || undefined,
  });

  const cartUnits = cartLines.reduce((n, i) => n + i.quantity, 0);
  const topHeaderPadding = useTopInset(12);
  const bottomScrollPadding = useBottomInset(90);

  const liveProducts = productsQuery.data?.products || [];

  // Dynamically derive categories from this store's real database products
  const storeCategories = Array.from(
    new Set(
      liveProducts
        .map((p) => p.category)
        .filter((c): c is string => Boolean(c && c.trim()))
    )
  );

  useEffect(() => {
    currentStore.get().then((saved) => {
      if (saved) {
        setStore(saved);
      } else if (storesQuery.data?.stores?.length) {
        const first = storesQuery.data.stores[0];
        currentStore.set(first);
        setStore(first);
      }
    });

    return currentStore.subscribe((updated) => {
      setStore(updated);
    });
  }, [storesQuery.data]);

  const selectStore = async (item: Store) => {
    if (store && store._id === item._id) {
      setShowStorePicker(false);
      return;
    }

    const hasItems = cartUnits > 0;
    const executeSwitch = async () => {
      await currentStore.switchStore(item);
      setStore(item);
      setShowStorePicker(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify(`Supermarket Switched: Switched to ${item.name}. Your cart and session are now synced with this store's inventory.`, 'info');
    };

    if (hasItems) {
      const ok = await confirmDialog(
        'Switch Supermarket?',
        `You have ${cartUnits} item(s) from ${store?.name || 'the current supermarket'}. Switching to ${item.name} will clear your previous cart so products match this store's stock and prices.`,
        'Switch & Clear Cart',
        true
      );
      if (ok) await executeSwitch();
    } else {
      await executeSwitch();
    }
  };

  const handleAddToCart = (product: Product) => {
    addCartLine(
      {
        productId: product._id,
        name: product.name,
        quantity: 1,
        unitPriceMinor: product.priceMinor,
      },
      store?._id
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    notify(`Added to Cart: ${product.name} added to your basket.`, 'info');
  };

  const handleCategoryPress = (categoryName: string) => {
    router.push({
      pathname: '/(tabs)/shop',
      params: { category: categoryName },
    });
  };

  return (
    <View style={s.container}>
      <StatusBar style="light" />

      {/* Top Header with Vibrant Green (Images 2 & 4) */}
      <View style={[s.topHeader, { paddingTop: topHeaderPadding }]}>
        {/* Status / Location Bar */}
        <View style={s.locationBar}>
          <Pressable style={s.locationPicker} onPress={() => setShowStorePicker(true)}>
            <Text style={s.pinIcon}>📍</Text>
            <View>
              <Text style={s.storeLabel}>CURRENT STORE</Text>
              <Text style={s.storeName} numberOfLines={1}>
                {store ? store.name : 'Select Supermarket'} ▾
              </Text>
            </View>
          </Pressable>

          {/* Floating Cart Badge Button */}
          <Pressable
            style={s.cartBadgeBtn}
            onPress={() => router.push('/(tabs)/shop')}
          >
            <Text style={s.cartIcon}>🛒</Text>
            {cartUnits > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeText}>{cartUnits}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Search Input Bar */}
        <View style={s.searchInputWrapper}>
          <Text style={s.searchMagnifier}>🔍</Text>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search products..."
            placeholderTextColor="#94A3B8"
            style={s.searchInput}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Text style={s.clearSearch}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Main Scroll Content */}
      <ScrollView
        style={s.scrollView}
        contentContainerStyle={[s.scrollContent, { paddingBottom: bottomScrollPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {/* In-Store Scan & Go Fast Pass Card */}
        <View style={s.scanFastCard}>
          <View style={s.scanFastLeft}>
            <View style={s.scanIconCircle}>
              <Text style={s.scanIconText}>⌗</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.scanFastTitle}>In-Store Scan & Go</Text>
              <Text style={s.scanFastSub}>
                {store
                  ? `Shopping at ${store.name}. Point camera at any item barcode.`
                  : 'Select a supermarket to begin in-store scanning.'}
              </Text>
            </View>
          </View>
          <Pressable
            style={s.scanStartBtn}
            onPress={() => {
              if (!store) {
                notify(`Select Store: Please select a participating store first.`, 'info');
                setShowStorePicker(true);
                return;
              }
              router.push('/(tabs)/scan');
            }}
          >
            <Text style={s.scanStartText}>Start Scanning →</Text>
          </Pressable>
        </View>

        {/* Categories Section (Derived from real database products) */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>
            {storeCategories.length > 0
              ? 'Find Your Products'
              : 'Popular Departments'}
          </Text>
          <Pressable onPress={() => router.push('/(tabs)/shop')}>
            <Text style={s.seeAllText}>See all</Text>
          </Pressable>
        </View>

        <View style={s.categoriesGrid}>
          {(storeCategories.length > 0
            ? storeCategories
            : ['Stationary', 'Bakery', 'Beverages', 'Cooking Oils', 'Dairy & Eggs', 'General']
          ).map((catName, index) => {
            const bg = PASTEL_COLORS[index % PASTEL_COLORS.length];
            const emoji = getProductEmoji('', catName);
            return (
              <Pressable
                key={catName}
                style={[s.categoryTile, { backgroundColor: bg }]}
                onPress={() => handleCategoryPress(catName)}
              >
                <Text style={s.catEmoji}>{emoji}</Text>
                <Text style={s.catName} numberOfLines={2}>
                  {catName}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Featured Products rail (live catalog, capped for a tidy preview) */}
        <View style={[s.sectionHeader, { marginTop: 24 }]}>
          <Text style={s.sectionTitle}>
            {store ? `Popular at ${store.name.split('-')[0]}` : 'Store products'}
          </Text>
          <Pressable onPress={() => router.push('/(tabs)/shop')}>
            <Text style={s.seeAllText}>See all</Text>
          </Pressable>
        </View>

        {productsQuery.isLoading ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={i} style={{ width: 140 }}>
                <Skeleton height={110} style={{ borderRadius: 14 }} />
                <Skeleton height={11} style={{ marginTop: 8, width: '80%' }} />
                <Skeleton height={11} style={{ marginTop: 6, width: '50%' }} />
              </View>
            ))}
          </View>
        ) : liveProducts.length === 0 ? (
          <View style={s.emptyProductsCard}>
            <Text style={{ fontSize: 32, marginBottom: 6 }}>📦</Text>
            <Text style={s.emptyProductsTitle}>No products found</Text>
            <Text style={s.emptyProductsSub}>
              {searchQuery
                ? `No items match "${searchQuery}".`
                : 'This store has no active products listed yet. Tap the store name above to switch branches.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.horizontalProducts}
          >
            {liveProducts.slice(0, 12).map((prod) => (
              <Pressable
                key={prod._id}
                style={s.productCard}
                onPress={() => setSelectedProduct(prod)}
              >
                {/* Product Thumbnail using live image or smart emoji */}
                <View style={s.productThumb}>
                  {prod.compareAtPriceMinor && prod.compareAtPriceMinor > prod.priceMinor && (
                    <View style={s.dealBadge}>
                      <Text style={s.dealBadgeText}>
                        -{Math.round((1 - prod.priceMinor / prod.compareAtPriceMinor) * 100)}%
                      </Text>
                    </View>
                  )}
                  <ProductVisual
                    image={prod.image || (prod._id ? `${(process.env.EXPO_PUBLIC_API_URL || '').replace(/\/api\/v1$/, '')}/api/v1/products/${prod._id}/image` : undefined)}
                    name={prod.name}
                    category={prod.category}
                    size={84}
                    emojiSize={40}
                    borderRadius={14}
                  />
                </View>

                {/* Details */}
                <Text style={s.productName} numberOfLines={2}>
                  {prod.name}
                </Text>
                <Text style={s.productUnit}>
                  {prod.weightGrams
                    ? `${prod.weightGrams}g`
                    : prod.soldBy === 'weight'
                    ? 'Per kg'
                    : prod.category || 'In stock'}
                </Text>

                {/* Bottom row: Price and Add button */}
                <View style={s.productBottomRow}>
                  <View>
                    {prod.compareAtPriceMinor && prod.compareAtPriceMinor > prod.priceMinor && (
                      <Text style={s.productWas}>KES {(prod.compareAtPriceMinor / 100).toFixed(2)}</Text>
                    )}
                    <Text style={s.productPrice}>
                      KES {((prod.priceMinor / 100)).toFixed(2)}
                    </Text>
                  </View>
                  <Pressable
                    style={s.addBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleAddToCart(prod);
                    }}
                  >
                    <Text style={s.addBtnText}>＋</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}

      </ScrollView>

      {/* Product Detail Modal */}
      <Modal visible={!!selectedProduct} animationType="slide" transparent>
        <View style={s.detailBackdrop}>
          <View style={s.detailSheet}>
            <View style={s.sheetHandle} />

            <View style={s.detailHeaderRow}>
              <Pressable
                style={s.detailClose}
                onPress={() => setSelectedProduct(null)}
              >
                <Text style={s.detailCloseText}>✕</Text>
              </Pressable>
              <Text style={{ fontSize: 13, color: '#16A34A', fontWeight: '700' }}>
                {store?.name}
              </Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.detailImageContainer}>
                <ProductVisual
                  image={selectedProduct?.image}
                  name={selectedProduct?.name}
                  category={selectedProduct?.category}
                  size={140}
                  emojiSize={64}
                  borderRadius={18}
                />
              </View>

              <Text style={s.detailTitle}>{selectedProduct?.name}</Text>
              <Text style={s.detailCategory}>
                {selectedProduct?.category || 'Grocery'} · {selectedProduct?.barcode ? `Barcode: ${selectedProduct.barcode}` : ''}
              </Text>

              <View style={s.detailPriceRow}>
                <Text style={s.detailPrice}>
                  KES {selectedProduct ? ((selectedProduct.priceMinor / 100)).toFixed(2) : '0.00'}
                </Text>
              </View>

              <View style={s.stockBox}>
                <Text style={s.stockText}>
                  Stock: {selectedProduct?.stock !== undefined ? `${selectedProduct.stock} units available` : 'In stock'}
                </Text>
              </View>
            </ScrollView>

            <Pressable
              style={s.addToBasketBtn}
              onPress={() => {
                if (selectedProduct) {
                  handleAddToCart(selectedProduct);
                  setSelectedProduct(null);
                }
              }}
            >
              <Text style={s.addToBasketText}>
                Add To Basket · KES {selectedProduct ? ((selectedProduct.priceMinor / 100)).toFixed(2) : ''}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Store Picker Modal */}
      <Modal visible={showStorePicker} animationType="slide" transparent>
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>
            <View style={s.sheetHandle} />
            <Text style={s.modalTitle}>Choose Supermarket</Text>
            <Text style={s.modalSubtitle}>
              Select your nearby branch for real-time inventory and pricing
            </Text>

            <ScrollView style={{ maxHeight: 380 }}>
              {storesQuery.data?.stores?.map((item) => (
                <Pressable
                  key={item._id}
                  style={[
                    s.modalStoreItem,
                    store?._id === item._id && s.modalStoreSelected,
                  ]}
                  onPress={() => selectStore(item)}
                >
                  <View style={s.modalStoreIcon}>
                    <Text style={{ fontSize: 22 }}>🏪</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.modalStoreName}>{item.name}</Text>
                    <Text style={s.modalStoreAddress}>
                      {item.location?.address || item.location?.city || 'Kenya'}
                    </Text>
                  </View>
                  {store?._id === item._id && (
                    <Text style={s.checkedMark}>✓</Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              style={s.closeModalBtn}
              onPress={() => setShowStorePicker(false)}
            >
              <Text style={s.closeModalText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF8',
  },
  topHeader: {
    backgroundColor: '#15803D',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  locationPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  pinIcon: {
    fontSize: 20,
  },
  storeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#BBF7D0',
    letterSpacing: 0.8,
  },
  storeName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 1,
  },
  cartBadgeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartIcon: {
    fontSize: 19,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#F97316',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#15803D',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  searchInputWrapper: {
    flex: 1,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  searchMagnifier: {
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  clearSearch: {
    fontSize: 14,
    color: '#94A3B8',
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  scanFastCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  scanFastLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scanIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanIconText: {
    fontSize: 22,
    color: '#15803D',
    fontWeight: '800',
  },
  scanFastTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  scanFastSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  scanStartBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 14,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  scanStartText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  seeAllText: {
    fontSize: 14,
    color: '#16A34A',
    fontWeight: '700',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryTile: {
    width: (SCREEN_WIDTH - 36 - 30) / 4,
    height: 96,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    position: 'relative',
  },
  catEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  catName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 13,
  },
  productsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  productsLoadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyProductsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyProductsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  emptyProductsSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  horizontalProducts: {
    gap: 12,
    paddingRight: 10,
  },
  productCard: {
    width: 154,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  productThumb: {
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    marginBottom: 8,
    overflow: 'hidden',
  },
  productName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    minHeight: 36,
  },
  productUnit: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 6,
  },
  productBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  productPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803D',
  },
  productWas: {
    fontSize: 10,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  dealBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 2,
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dealBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 16,
  },
  modalStoreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 5,
    gap: 12,
  },
  modalStoreSelected: {
    borderColor: '#16A34A',
    backgroundColor: '#F0FDF4',
  },
  modalStoreIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalStoreName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalStoreAddress: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  checkedMark: {
    fontSize: 18,
    color: '#16A34A',
    fontWeight: '800',
  },
  closeModalBtn: {
    marginTop: 16,
    height: 48,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeModalText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
  },
  detailBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  detailSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '85%',
  },
  detailHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCloseText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '700',
  },
  detailImageContainer: {
    height: 160,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    overflow: 'hidden',
  },
  detailTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  detailCategory: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  detailPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 18,
  },
  detailPrice: {
    fontSize: 22,
    fontWeight: '900',
    color: '#15803D',
  },
  stockBox: {
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  stockText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  addToBasketBtn: {
    height: 52,
    backgroundColor: '#16A34A',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  addToBasketText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
});
