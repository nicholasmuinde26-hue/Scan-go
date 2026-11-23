import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../../core/i18n';

function TabIcon({
  name,
  focused,
  isScan = false,
}: {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  isScan?: boolean;
}) {
  const color = focused ? '#16A34A' : '#94A3B8';
  if (isScan) {
    return (
      <View style={s.scanTabWrapper}>
        <View style={s.scanTabCircle}>
          <Ionicons name="scan" size={24} color="#FFFFFF" />
        </View>
      </View>
    );
  }
  return (
    <View style={s.tabWrapper}>
      <Ionicons name={name} size={22} color={color} />
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  // Safe bottom inset accounts for Android 3-button / gesture bar and iOS home indicator
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 12);
  const tabHeight = 60 + bottomInset;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#16A34A',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          height: tabHeight,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#F1F5F9',
          paddingTop: 8,
          paddingBottom: bottomInset,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.06,
          shadowRadius: 10,
          elevation: 16,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab_home'),
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: t('tab_shop'),
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'grid' : 'grid-outline'} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: t('tab_scan'),
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '800',
            color: '#16A34A',
            marginBottom: 2,
          },
          tabBarIcon: ({ focused }) => (
            <TabIcon name="scan" focused={focused} isScan />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t('tab_orders'),
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'receipt' : 'receipt-outline'} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('tab_account'),
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const s = StyleSheet.create({
  tabWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTabWrapper: {
    position: 'relative',
    top: -12,
  },
  scanTabCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
});
