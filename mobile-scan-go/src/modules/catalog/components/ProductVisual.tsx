import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

export function getProductEmoji(name?: string, category?: string): string {
  const text = `${name || ''} ${category || ''}`.toLowerCase();

  if (text.includes('book') || text.includes('station') || text.includes('paper') || text.includes('pen')) {
    return '📚';
  }
  if (text.includes('milk') || text.includes('dairy') || text.includes('cheese') || text.includes('yogurt')) {
    return '🥛';
  }
  if (text.includes('egg')) {
    return '🥚';
  }
  if (text.includes('bread') || text.includes('baker') || text.includes('toast') || text.includes('pastry')) {
    return '🍞';
  }
  if (text.includes('oil') || text.includes('olive') || text.includes('fat') || text.includes('ghee')) {
    return '🫒';
  }
  if (text.includes('tea') || text.includes('coffee') || text.includes('beverag') || text.includes('juice') || text.includes('soda')) {
    return '🧃';
  }
  if (text.includes('baby') || text.includes('infant') || text.includes('formula') || text.includes('diaper')) {
    return '🍼';
  }
  if (text.includes('whisky') || text.includes('beer') || text.includes('wine') || text.includes('liquor') || text.includes('spirit')) {
    return '🍾';
  }
  if (text.includes('chicken') || text.includes('poultry') || text.includes('meat') || text.includes('beef') || text.includes('fish')) {
    return '🍗';
  }
  if (text.includes('tooth') || text.includes('colgate') || text.includes('care') || text.includes('soap') || text.includes('shampoo')) {
    return '🧼';
  }
  if (text.includes('rice') || text.includes('flour') || text.includes('grain') || text.includes('cereal') || text.includes('maize')) {
    return '🌾';
  }
  if (text.includes('apple') || text.includes('banana') || text.includes('fruit') || text.includes('mango') || text.includes('orange')) {
    return '🍎';
  }
  if (text.includes('vegetable') || text.includes('pepper') || text.includes('greens') || text.includes('tomato') || text.includes('onion')) {
    return '🥦';
  }
  return '🛍️';
}

interface Props {
  image?: string;
  name?: string;
  category?: string;
  size?: number;
  emojiSize?: number;
  borderRadius?: number;
}

export function ProductVisual({
  image,
  name,
  category,
  size = 70,
  emojiSize = 34,
  borderRadius = 14,
}: Props) {
  const [imageError, setImageError] = React.useState(false);

  if (image && !imageError) {
    return (
      <View style={[s.container, { width: size, height: size, borderRadius }]}>
        <Image
          source={{ uri: image }}
          style={[s.image, { borderRadius }]}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      </View>
    );
  }

  const emoji = getProductEmoji(name, category);
  return (
    <View style={[s.container, s.fallbackBg, { width: size, height: size, borderRadius }]}>
      <Text style={{ fontSize: emojiSize }}>{emoji}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallbackBg: {
    backgroundColor: '#F8FAFC',
  },
});
