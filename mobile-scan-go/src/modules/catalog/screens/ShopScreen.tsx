import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useProducts } from '../hooks';
import { useCollectCart } from '../../cart/store';
import { currentStore } from '../../stores/store';
import { ProductVisual } from '../components/ProductVisual';
import type { Store } from '../../stores';
import type { Product } from '../types';
import { notify, ProductCardSkeleton } from '../../../shared/ui/feedback';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string }>();
  const [store, setStore] = useState<Store | null>(null);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [isFavorite, setIsFavorite] = useState(false);
  const [activeSection, setActiveSection] = useState<'detail' | 'nutrition' | 'review'>('detail');

  const topPadding = Math.max(insets.top, 24) + 10;
  const bottomPadding = Math.max(insets.bottom, 16) + 70;

  const cartLines = useCollectCart((state) => state.lines);
  const addLine = useCollectCart((state) => state.add);

  useEffect(() => {
    currentStore.get().then((st) => {
      setStore(st);
      if (st) useCollectCart.getState().setStoreId(st._id);
    });
    return currentStore.subscribe((st) => {
      setStore(st);
      if (st) useCollectCart.getState().setStoreId(st._id);
    });
  }, []);

  // Update selected category if navigated from Home with category param
  useEffect(() => {
    if (params.category) {
      setSelectedCategory(params.category);
    }
  }, [params.category]);

  const productsQuery = useProducts({
    storeId: store?._id,
    search: query || undefined,
  });

  const cartUnits = cartLines.reduce((n, i) => n + i.quantity, 0);

  const rawProducts = productsQuery.data?.products || [];

  // Dynamically compute store categories directly from the live database
  const liveCategories = ['All', ...Array.from(new Set(
    rawProducts
      .map((p) => p.category)
      .filter((c): c is string => Boolean(c && c.trim()))
  ))];

  const handleAdd = (item: Product, qty: number = 1) => {
    addLine(
      {
        productId: item._id,
        name: item.name,
        quantity: qty,
        unitPriceMinor: item.priceMinor,
      },
      store?._id
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    notify(`${item.name} (${qty}x) added to basket.`, 'info');
  };

  const openProductDetail = (item: Product) => {
    setSelectedProduct(item);
    setDetailQuantity(1);
  };

  const filteredProducts = rawProducts.filter((p) => {
    if (selectedCategory === 'All') return true;
    if (p.category && p.category.toLowerCase() === selectedCategory.toLowerCase()) return true;
    return true;
  });

  return (
    <View style={s.page}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPadding }]}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerTitle}>Find Products</Text>
            <Text style={s.headerSub}>{store?.name || 'All Store Catalog'}</Text>
          </View>
          <Pressable
            style={s.cartBtn}
            onPress={() => router.push('/collect-checkout')}
          >
            <Text style={{ fontSize: 18 }}>🛒</Text>
            {cartUnits > 0 && (
              <View style={s.cartBadge}>
                <Text style={s.cartBadgeText}>{cartUnits}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Search Bar */}
        <View style={s.searchBar}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search groceries, brands, sku..."
            placeholderTextColor="#94A3B8"
            style={s.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}>
              <Text style={s.clearSearch}>✕</Text>
            </Pressable>
          )}
        </View>

        {/* Dynamic Category Pills Bar derived from the store database */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.categoryTabs}
        >
          {liveCategories.map((cat) => (
            <Pressable
              key={cat}
              style={[s.catPill, selectedCategory.toLowerCase() === cat.toLowerCase() && s.catPillActive]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  s.catText,
                  selectedCategory.toLowerCase() === cat.toLowerCase() && s.catTextActive,
                ]}
              >
                {cat}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Product Grid */}
      {productsQuery.isLoading ? (
        <View style={[s.grid, { flexDirection: 'row', flexWrap: 'wrap' }]}>
          {Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}
        </View>
      ) : productsQuery.error ? (
        <View style={s.center}>
          <Text style={s.errorText}>{productsQuery.error.message}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(p) => p._id}
          numColumns={2}
          contentContainerStyle={[s.grid, { paddingBottom: bottomPadding + 40 }]}
          columnWrapperStyle={s.gridRow}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ fontSize: 40, marginBottom: 8 }}>🧺</Text>
              <Text style={s.emptyTitle}>No products found</Text>
              <Text style={s.emptySubtitle}>
                {selectedCategory !== 'All'
                  ? `No products found under "${selectedCategory}".`
                  : 'This store has no active products in this category.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={s.card}
              onPress={() => openProductDetail(item)}
            >
              <View style={s.cardThumb}>
                <ProductVisual
                  image={item.image}
                  name={item.name}
                  category={item.category}
                  size={100}
                  emojiSize={42}
                  borderRadius={14}
                />
              </View>
              <Text style={s.cardName} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={s.cardCategory}>{item.category || 'Grocery'}</Text>
              <View style={s.cardBottom}>
                <Text style={s.cardPrice}>
                  KES {((item.priceMinor / 100)).toFixed(2)}
                </Text>
                <Pressable
                  style={s.addBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleAdd(item);
                  }}
                >
                  <Text style={s.addBtnText}>＋</Text>
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}

      {/* Review Floating Bottom Bar */}
      {cartUnits > 0 && (
        <View style={[s.bottomFloating, { bottom: Math.max(insets.bottom, 16) + 70 }]}>
          <Pressable
            style={s.bottomBtn}
            onPress={() => {
              if (!store) {
                notify(`Select Store: Choose a store from Home first.`, 'info');
                return;
              }
              router.push('/collect-checkout');
            }}
          >
            <View style={s.bottomBtnLeft}>
              <Text style={s.bottomCartIcon}>🛒</Text>
              <Text style={s.bottomBtnCount}>{cartUnits} items in cart</Text>
            </View>
            <Text style={s.bottomBtnAction}>Review Cart →</Text>
          </Pressable>
        </View>
      )}

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
              <Pressable onPress={() => setIsFavorite(!isFavorite)}>
                <Text style={{ fontSize: 22 }}>{isFavorite ? '❤️' : '🤍'}</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Product Visual */}
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

              {/* Title & Price */}
              <Text style={s.detailTitle}>{selectedProduct?.name}</Text>
              <Text style={s.detailCategory}>
                {selectedProduct?.category || 'Grocery'} · {selectedProduct?.barcode ? `Barcode: ${selectedProduct.barcode}` : ''}
              </Text>

              {/* Stepper & Price Row */}
              <View style={s.detailPriceRow}>
                <View style={s.detailStepper}>
                  <Pressable
                    style={s.detailStepBtn}
                    onPress={() => setDetailQuantity(Math.max(1, detailQuantity - 1))}
                  >
                    <Text style={s.detailStepText}>−</Text>
                  </Pressable>
                  <Text style={s.detailQty}>{detailQuantity}</Text>
                  <Pressable
                    style={s.detailStepBtn}
                    onPress={() => setDetailQuantity(detailQuantity + 1)}
                  >
                    <Text style={s.detailStepText}>＋</Text>
                  </Pressable>
                </View>

                <Text style={s.detailPrice}>
                  KES{' '}
                  {selectedProduct
                    ? (((selectedProduct.priceMinor * detailQuantity) / 100)).toFixed(2)
                    : '0.00'}
                </Text>
              </View>

              {/* Accordion Tabs */}
              <View style={s.accordion}>
                <Pressable
                  style={s.accordionHeader}
                  onPress={() => setActiveSection(activeSection === 'detail' ? 'nutrition' : 'detail')}
                >
                  <Text style={s.accordionTitle}>Product & Stock Info</Text>
                  <Text style={s.accordionArrow}>{activeSection === 'detail' ? '▾' : '›'}</Text>
                </Pressable>
                {activeSection === 'detail' && (
                  <View style={{ paddingVertical: 8 }}>
                    <Text style={s.accordionContent}>
                      Stock status: {selectedProduct?.stock !== undefined ? `${selectedProduct.stock} units available in store` : 'In stock'}
                    </Text>
                    {selectedProduct?.weightGrams ? (
                      <Text style={s.accordionContent}>
                        Net weight: {selectedProduct.weightGrams}g
                      </Text>
                    ) : null}
                    {selectedProduct?.soldBy ? (
                      <Text style={s.accordionContent}>
                        Sold by: {selectedProduct.soldBy === 'weight' ? 'Weighted measurement' : 'Standard unit packaging'}
                      </Text>
                    ) : null}
                  </View>
                )}

                <Pressable
                  style={s.accordionHeader}
                  onPress={() => setActiveSection(activeSection === 'nutrition' ? 'review' : 'nutrition')}
                >
                  <Text style={s.accordionTitle}>Nutritions & Quality</Text>
                </Pressable>

                <Pressable
                  style={s.accordionHeader}
                  onPress={() => setActiveSection(activeSection === 'review' ? 'detail' : 'review')}
                >
                  <Text style={s.accordionTitle}>Ingredients & Details</Text>
                </Pressable>
              </View>
            </ScrollView>

            {/* Sticky Add to Basket Button */}
            <Pressable
              style={s.addToBasketBtn}
              onPress={() => {
                if (selectedProduct) {
                  handleAdd(selectedProduct, detailQuantity);
                  setSelectedProduct(null);
                }
              }}
            >
              <Text style={s.addToBasketText}>
                Add To Basket · KES{' '}
                {selectedProduct
                  ? (((selectedProduct.priceMinor * detailQuantity) / 100)).toFixed(2)
                  : ''}
              </Text>
            </Pressable>
          </View>
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
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '700',
    marginTop: 2,
  },
  cartBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#16A34A',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  searchBar: {
    height: 48,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 12,
  },
  searchIcon: {
    fontSize: 15,
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
  categoryTabs: {
    gap: 8,
    paddingVertical: 4,
  },
  catPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catPillActive: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  catText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  catTextActive: {
    color: '#FFFFFF',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    textAlign: 'center',
  },
  grid: {
    padding: 16,
    paddingBottom: 110,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  card: {
    width: (SCREEN_WIDTH - 44) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardThumb: {
    height: 104,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  cardName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    minHeight: 36,
  },
  cardCategory: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    marginBottom: 6,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  cardPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803D',
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
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  bottomFloating: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  bottomBtn: {
    height: 54,
    backgroundColor: '#16A34A',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  bottomBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bottomCartIcon: {
    fontSize: 18,
  },
  bottomBtnCount: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  bottomBtnAction: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
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
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
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
  detailStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 12,
  },
  detailStepBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailStepText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  detailQty: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    minWidth: 20,
    textAlign: 'center',
  },
  detailPrice: {
    fontSize: 20,
    fontWeight: '900',
    color: '#15803D',
  },
  accordion: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 8,
    marginBottom: 20,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  accordionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  accordionArrow: {
    fontSize: 18,
    color: '#94A3B8',
  },
  accordionContent: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
    paddingVertical: 4,
  },
  nutritionBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  nutritionBadgeText: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '700',
  },
  reviewStars: {
    color: '#F59E0B',
    fontSize: 14,
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
