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
import { useTopInset, useBottomInset } from '../../../core/safeArea';
import * as Haptics from 'expo-haptics';
import { useProducts } from '../hooks';
import { catalogApi } from '../api';
import type { ProductSort } from '../types';
import { guestStore } from '../../guest/store';
import { useCollectCart } from '../../cart/store';
import { currentStore } from '../../stores/store';
import { ProductVisual } from '../components/ProductVisual';
import type { Store } from '../../stores';
import type { Product } from '../types';
import { notify, ProductCardSkeleton } from '../../../shared/ui/feedback';
import { formatKes } from '../../../shared/money';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ShopScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const [store, setStore] = useState<Store | null>(null);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sort, setSort] = useState<ProductSort>('recommended');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [isFavorite, setIsFavorite] = useState(false);
  const [activeSection, setActiveSection] = useState<'detail' | 'nutrition' | 'review'>('detail');
  const [isGuest, setIsGuest] = useState(false);

  const topPadding = useTopInset(10);
  const bottomPadding = useBottomInset(80);

  const cartLines = useCollectCart((state) => state.lines);
  const addLine = useCollectCart((state) => state.add);

  useEffect(() => {
    guestStore.isGuest().then(setIsGuest);
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

  const categoryCounts = rawProducts.reduce<Record<string, number>>((acc, p) => {
    const c = p.category || 'Other';
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {});

  const handleAdd = (item: Product, qty: number = 1) => {
    if (isGuest) {
      notify('Guest mode: use the Scan tab to scan items in-store, or sign in for click & collect.', 'info');
      return;
    }
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

  // Deals: products with a compare-at price above the selling price
  const dealProducts = rawProducts
    .filter((p) => (p.stock ?? 1) > 0 && p.compareAtPriceMinor && p.compareAtPriceMinor > p.priceMinor)
    .sort((a, b) => ((b.compareAtPriceMinor || 0) - b.priceMinor) - ((a.compareAtPriceMinor || 0) - a.priceMinor));

  // Top sellers by real 30-day sales returned from the API
  const topSellers = rawProducts
    .filter((p) => (p.stock ?? 1) > 0 && (p.unitsSold30d || 0) > 0)
    .sort((a, b) => (b.unitsSold30d || 0) - (a.unitsSold30d || 0))
    .slice(0, 10);

  const filteredProducts = rawProducts
    .filter((p) => {
      if (selectedCategory !== 'All' && p.category?.toLowerCase() !== selectedCategory.toLowerCase()) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.barcode || '').includes(query)
      );
    })
    .sort((a, b) => {
      if (sort === 'price-low') return a.priceMinor - b.priceMinor;
      if (sort === 'price-high') return b.priceMinor - a.priceMinor;
      if (sort === 'name') return a.name.localeCompare(b.name);
      return 0;
    });

  const productImage = (p: Product) => p.image || catalogApi.imageUrl(p._id);
  const discountPct = (p: Product) =>
    p.compareAtPriceMinor && p.compareAtPriceMinor > p.priceMinor
      ? Math.round((1 - p.priceMinor / p.compareAtPriceMinor) * 100)
      : 0;

  return (
    <View style={s.page}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPadding }]}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerTitle}>Find Products</Text>
            <Text style={s.headerSub}>{store?.name || 'All Store Catalog'}</Text>
          </View>
          {!isGuest && (
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
          )}
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
              <Text style={[s.catText, selectedCategory.toLowerCase() === cat.toLowerCase() && s.catTextActive]}>
                {cat}
              </Text>
              <View style={[s.catCount, selectedCategory.toLowerCase() === cat.toLowerCase() && s.catCountActive]}>
                <Text style={[s.catCountText, selectedCategory.toLowerCase() === cat.toLowerCase() && s.catCountTextActive]}>
                  {cat === 'All' ? rawProducts.length : categoryCounts[cat] || 0}
                </Text>
              </View>
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
          numColumns={3}
          contentContainerStyle={[s.grid, { paddingBottom: bottomPadding + 40 }]}
          columnWrapperStyle={s.gridRow}
          ListHeaderComponent={
            <View>
              {/* Hero banner — parity with the web shop hero */}
              {selectedCategory === 'All' && !query && (
                <View style={s.heroCard}>
                  <Text style={s.heroBadge}>🏪 {store?.name || 'Our store'}</Text>
                  <Text style={s.heroTitle}>Your everyday shop, made easy.</Text>
                  <Text style={s.heroSub}>
                    Browse this branch's live catalogue, find good offers, and choose what you need.
                  </Text>
                  {store?.location?.address || store?.location?.city ? (
                    <View style={s.heroStoreChip}>
                      <Text style={s.heroStoreChipText}>
                        📍 {[store.location.address, store.location.city].filter(Boolean).join(', ')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}

              {/* Sort row */}
              <View style={s.sortRow}>
                {(['recommended', 'price-low', 'price-high', 'name'] as ProductSort[]).map((opt) => (
                  <Pressable
                    key={opt}
                    style={[s.sortPill, sort === opt && s.sortPillActive]}
                    onPress={() => setSort(opt)}
                  >
                    <Text style={[s.sortText, sort === opt && s.sortTextActive]}>
                      {opt === 'price-low' ? 'Price ↑' : opt === 'price-high' ? 'Price ↓' : opt === 'name' ? 'A–Z' : 'For you'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Deals rail — "Offers at this branch" */}
              {selectedCategory === 'All' && !query && dealProducts.length > 0 && (
                <View style={s.railCard}>
                  <Text style={s.railKicker}>🏷️ Offers & savings</Text>
                  <Text style={s.railTitle}>Offers at this branch</Text>
                  <Text style={s.railSub}>Current prices and savings set by {store?.name || 'this store'}.</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
                    {dealProducts.slice(0, 8).map((p) => (
                      <Pressable key={p._id} style={s.dealCard} onPress={() => openProductDetail(p)}>
                        <View style={s.dealBadge}>
                          <Text style={s.dealBadgeText}>-{discountPct(p)}%</Text>
                        </View>
                        <ProductVisual image={productImage(p)} name={p.name} category={p.category} size={72} emojiSize={30} borderRadius={12} />
                        <Text style={s.dealName} numberOfLines={2}>{p.name}</Text>
                        <Text style={s.dealPrice}>{formatKes(p.priceMinor)}</Text>
                        <Text style={s.dealWas}>{formatKes(p.compareAtPriceMinor || 0)}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Top sellers rail — "Fast movers" */}
              {selectedCategory === 'All' && !query && topSellers.length > 0 && (
                <View style={[s.railCard, s.railCardAmber]}>
                  <Text style={s.railKickerAmber}>🔥 Popular with shoppers</Text>
                  <Text style={s.railTitle}>Fast movers</Text>
                  <Text style={s.railSub}>Based on items purchased here over the last 30 days.</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
                    {topSellers.map((p) => (
                      <Pressable key={p._id} style={s.topCard} onPress={() => openProductDetail(p)}>
                        <ProductVisual image={productImage(p)} name={p.name} category={p.category} size={72} emojiSize={30} borderRadius={12} />
                        <Text style={s.topName} numberOfLines={2}>{p.name}</Text>
                        <Text style={s.topMeta}>{p.unitsSold30d} sold · {formatKes(p.priceMinor)}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Catalogue heading + count */}
              <View style={s.catalogueHead}>
                <Text style={s.catalogueTitle}>
                  {selectedCategory === 'All' ? 'All products' : `${selectedCategory}`}
                </Text>
                <Text style={s.catalogueCount}>{filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}</Text>
              </View>
            </View>
          }
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
                {discountPct(item) > 0 && (
                  <View style={s.cardDealBadge}>
                    <Text style={s.cardDealBadgeText}>-{discountPct(item)}%</Text>
                  </View>
                )}
                <ProductVisual
                  image={productImage(item)}
                  name={item.name}
                  category={item.category}
                  size={72}
                  emojiSize={30}
                  borderRadius={12}
                />
              </View>
              <Text style={s.cardName} numberOfLines={2}>
                {item.name}
              </Text>
              <View style={s.cardBottom}>
                <View style={{ flex: 1 }}>
                  {discountPct(item) > 0 && (
                    <Text style={s.cardWas}>{formatKes(item.compareAtPriceMinor || 0)}</Text>
                  )}
                  <Text style={s.cardPrice} numberOfLines={1}>
                    {formatKes(item.priceMinor)}
                  </Text>
                </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  catCount: {
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  catCountActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  catCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },
  catCountTextActive: {
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
    padding: 12,
    paddingBottom: 110,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  card: {
    width: (SCREEN_WIDTH - 44) / 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardThumb: {
    height: 72,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    overflow: 'hidden',
  },
  cardName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
    minHeight: 28,
    lineHeight: 14,
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
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
  },
  cardWas: {
    fontSize: 10,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  cardDealBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 2,
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cardDealBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  sortRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  sortPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sortPillActive: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  sortText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  sortTextActive: {
    color: '#FFFFFF',
  },
  railTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  heroCard: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    overflow: 'hidden',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: '800',
    color: '#A7F3D0',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    overflow: 'hidden',
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 10,
  },
  heroSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
    lineHeight: 17,
  },
  heroStoreChip: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroStoreChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
  },
  railCard: {
    backgroundColor: '#FFF1F2',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FECDD3',
    padding: 14,
    marginBottom: 14,
  },
  railCardAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  railKicker: {
    fontSize: 10,
    fontWeight: '900',
    color: '#E11D48',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  railKickerAmber: {
    color: '#D97706',
  },
  railSub: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 10,
  },
  catalogueHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 8,
    marginBottom: 4,
  },
  catalogueTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  catalogueCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  dealCard: {
    width: 130,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    position: 'relative',
  },
  dealBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
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
  dealName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 6,
    minHeight: 30,
  },
  dealPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
    marginTop: 4,
  },
  dealWas: {
    fontSize: 10,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  topCard: {
    width: 130,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  topName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 6,
    minHeight: 30,
  },
  topMeta: {
    fontSize: 10,
    color: '#16A34A',
    fontWeight: '700',
    marginTop: 4,
  },
  addBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginTop: -1,
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
