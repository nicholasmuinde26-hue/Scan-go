import React from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useTopInset, useBottomInset } from '../../../core/safeArea';
import { useLogout, useLogoutAll } from '../../auth';
import { useProfile } from '../hooks';
import { tokens } from '../../../core/session/tokens';
import { useRegisterDevice } from '../../notifications';
import { GoogleIcon } from '../../../shared/GoogleButton';
import { notify as notifyMsg, confirmDialog } from '../../../shared/ui/feedback';
import { useI18n } from '../../../core/i18n';

export default function AccountScreen() {
  const profile = useProfile();
  const signOut = useLogout();
  const signOutEverywhere = useLogoutAll();
  const notifications = useRegisterDevice();

  const user = profile.data?.user;
  const { locale, setLocale, t } = useI18n();
  const isGoogle = !!(user as any)?.googleId || !!user?.email?.includes('@');

  const topPadding = useTopInset(12);
  const bottomPadding = useBottomInset(80);

  const logout = async () => {
    const ok = await confirmDialog('Sign out', 'Sign out of this device?', 'Sign out', true);
    if (!ok) return;
    try {
      await signOut.mutateAsync();
    } catch {}
    await tokens.clear();
    router.replace('/');
  };

  const all = async () => {
    const ok = await confirmDialog('Sign out everywhere', 'This will revoke your active sessions on all devices.', 'Sign out all', true);
    if (!ok) return;
    try {
      await signOutEverywhere.mutateAsync();
    } catch {}
    await tokens.clear();
    router.replace('/');
  };

  const notify = async () => {
    try {
      await notifications.mutateAsync();
      notifyMsg(`Notifications enabled: We will alert you about order status updates, packing progress, and item substitutions.`, 'info');
    } catch (e: any) {
      notifyMsg(`Notification setup: ${e instanceof Error ? e.message : 'Please check device permissions.'}`, 'error');
    }
  };

  return (
    <ScrollView style={s.page} contentContainerStyle={[s.content, { paddingTop: topPadding, paddingBottom: bottomPadding }]}>
      <Text style={s.heading}>Account & Profile</Text>

      {/* Profile Card */}
      <View style={s.profileCard}>
        <View style={s.avatarContainer}>
          {(user as any)?.avatarUrl ? (
            <Image source={{ uri: (user as any).avatarUrl }} style={s.avatarImg} />
          ) : (
            <Text style={s.avatarLetter}>
              {user?.name ? user.name.charAt(0).toUpperCase() : '👤'}
            </Text>
          )}
        </View>

        <View style={s.profileMeta}>
          <Text style={s.profileName}>{user?.name || 'Customer'}</Text>
          <Text style={s.profilePhone}>{user?.phone || 'Scan & Go Shopper'}</Text>
          {user?.email && <Text style={s.profileEmail}>{user.email}</Text>}

          {isGoogle && (
            <View style={s.googleBadge}>
              <GoogleIcon size={14} />
              <Text style={s.googleBadgeText}>Google Account Connected</Text>
            </View>
          )}
        </View>
      </View>

      {/* Trips / Activity stats */}
      <View style={s.statsRow}>
        <View style={s.statBox}>
          <Text style={s.statNumber}>{user?.tripsCompleted || 0}</Text>
          <Text style={s.statLabel}>Trips Completed</Text>
        </View>
        <View style={s.statBox}>
          <Text style={s.statNumber}>{user?.cleanTrips || 0}</Text>
          <Text style={s.statLabel}>Verified Clean</Text>
        </View>
        <View style={s.statBox}>
          <Text style={s.statNumber}>{user?.totalSpentMinor ? `KES ${(user.totalSpentMinor / 100).toLocaleString()}` : '—'}</Text>
          <Text style={s.statLabel}>Total Spent</Text>
        </View>
      </View>

      {/* Settings list */}
      <Text style={s.sectionTitle}>PREFERENCES & SUPPORT</Text>
      <View style={s.item}>
        <Text style={s.itemIcon}>🌐</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.itemTitle}>{t('language')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            {(['en', 'sw'] as const).map((l) => (
              <Pressable
                key={l}
                onPress={() => setLocale(l)}
                style={[s.langChip, locale === l && s.langChipActive]}
              >
                <Text style={[s.langChipText, locale === l && s.langChipTextActive]}>
                  {l === 'en' ? 'English' : 'Kiswahili'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
      <Item
        icon="💳"
        title="Payment & M-Pesa"
        detail={user?.phone || 'Used for instant checkout STK push'}
      />
      <Item
        icon="💬"
        title="Help & Customer Care"
        detail="Chat with in-store support or view past disputes"
        onPress={() => router.push('/support')}
      />
      <Item
        icon="🔒"
        title="Privacy & Data Protection"
        detail="Compliant with Kenya Data Protection Act (DPA)"
      />
      <Item
        icon="📄"
        title="Request my data or account deletion"
        detail="Opens a help request handled by our support team"
        onPress={() => router.push('/support')}
      />

      <Pressable style={s.notifyBtn} onPress={notify}>
        <Text style={s.notifyBtnText}>🔔  Enable Order Notifications</Text>
      </Pressable>

      <Pressable style={s.logoutAllBtn} onPress={all}>
        <Text style={s.logoutAllText}>Sign out of all sessions</Text>
      </Pressable>

      <Pressable style={s.logoutBtn} onPress={logout}>
        <Text style={s.logoutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Item({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: string;
  title: string;
  detail: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={s.item} onPress={onPress}>
      <Text style={s.itemIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.itemTitle}>{title}</Text>
        <Text style={s.itemDetail}>{detail}</Text>
      </View>
      <Text style={s.itemArrow}>›</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F8FAF8',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 46,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 18,
    letterSpacing: -0.5,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 60,
    height: 60,
  },
  avatarLetter: {
    fontSize: 26,
    fontWeight: '800',
    color: '#15803D',
  },
  profileMeta: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  profilePhone: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  profileEmail: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 1,
  },
  googleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  googleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statNumber: {
    fontSize: 17,
    fontWeight: '900',
    color: '#15803D',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#64748B',
    marginBottom: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  itemIcon: {
    fontSize: 20,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemDetail: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  langChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
  },
  langChipActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  langChipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  langChipTextActive: { color: '#FFFFFF' },
  itemArrow: {
    fontSize: 20,
    color: '#CBD5E1',
  },
  notifyBtn: {
    height: 50,
    backgroundColor: '#DCFCE7',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  notifyBtnText: {
    color: '#15803D',
    fontWeight: '700',
    fontSize: 14,
  },
  logoutAllBtn: {
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  logoutAllText: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: 14,
  },
  logoutBtn: {
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 15,
  },
});
