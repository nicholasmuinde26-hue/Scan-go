import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { GoogleIcon } from '../../../shared/GoogleButton';
import { theme } from '../../../shared/theme';
import { performGoogleSignIn } from '../googleAuth';
import { notify } from '../../../shared/ui/feedback';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PRESET_ACCOUNTS = [
  { name: 'Alex Mwangi', email: 'alex.mwangi@gmail.com', initial: 'A', color: '#16A34A' },
  { name: 'Grace Wanjiku', email: 'grace.wanjiku@gmail.com', initial: 'G', color: '#EA580C' },
];

export function GoogleSignInModal({ visible, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');

  const handleSelect = async (email: string, name?: string) => {
    setLoading(true);
    try {
      await performGoogleSignIn(email, name);
      onClose();
      onSuccess();
    } catch (e: any) {
      notify(`Google Sign-In Failed: ${e?.message || 'Could not complete Google authentication.'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          {/* Handle bar */}
          <View style={s.handle} />

          <View style={s.header}>
            <GoogleIcon size={28} />
            <Text style={s.title}>Sign in with Google</Text>
            <Text style={s.subtitle}>Choose an account to continue to <Text style={s.brandHighlight}>Scan & Go</Text></Text>
          </View>

          {loading ? (
            <View style={s.loadingContainer}>
              <ActivityIndicator size="large" color="#4285F4" />
              <Text style={s.loadingText}>Authenticating with Google...</Text>
            </View>
          ) : (
            <View style={s.accountsList}>
              {PRESET_ACCOUNTS.map((acc) => (
                <Pressable
                  key={acc.email}
                  style={({ pressed }) => [s.accountItem, pressed && s.accountPressed]}
                  onPress={() => handleSelect(acc.email, acc.name)}
                >
                  <View style={[s.avatar, { backgroundColor: acc.color }]}>
                    <Text style={s.avatarLetter}>{acc.initial}</Text>
                  </View>
                  <View style={s.accountInfo}>
                    <Text style={s.accountName}>{acc.name}</Text>
                    <Text style={s.accountEmail}>{acc.email}</Text>
                  </View>
                </Pressable>
              ))}

              {!showCustomInput ? (
                <Pressable
                  style={({ pressed }) => [s.accountItem, pressed && s.accountPressed]}
                  onPress={() => setShowCustomInput(true)}
                >
                  <View style={[s.avatar, { backgroundColor: '#E2E8F0' }]}>
                    <Text style={[s.avatarLetter, { color: '#475569' }]}>＋</Text>
                  </View>
                  <View style={s.accountInfo}>
                    <Text style={s.accountName}>Use another Google account</Text>
                    <Text style={s.accountEmail}>Enter your Gmail or workspace email</Text>
                  </View>
                </Pressable>
              ) : (
                <View style={s.customBox}>
                  <Text style={s.inputLabel}>YOUR GOOGLE ACCOUNT</Text>
                  <TextInput
                    value={customEmail}
                    onChangeText={setCustomEmail}
                    placeholder="name@gmail.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={s.input}
                  />
                  <TextInput
                    value={customName}
                    onChangeText={setCustomName}
                    placeholder="Full name (optional)"
                    style={[s.input, { marginTop: 8 }]}
                  />
                  <Pressable
                    style={s.confirmButton}
                    onPress={() => {
                      if (!customEmail.includes('@')) {
                        notify(`Invalid Email: Please enter a valid Google email address.`, 'error');
                        return;
                      }
                      handleSelect(customEmail, customName || undefined);
                    }}
                  >
                    <Text style={s.confirmText}>Sign in with this account</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          <View style={s.footer}>
            <Text style={s.privacyNotice}>
              To continue, Google will share your name, email address, and profile picture with Scan & Go.
            </Text>
            <Pressable style={s.cancelButton} onPress={onClose} disabled={loading}>
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
  },
  handle: {
    width: 44,
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 10,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  brandHighlight: {
    fontWeight: '700',
    color: '#16A34A',
  },
  loadingContainer: {
    paddingVertical: 36,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  accountsList: {
    marginBottom: 16,
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginVertical: 4,
  },
  accountPressed: {
    backgroundColor: '#F1F5F9',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  accountEmail: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  customBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  input: {
    height: 46,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#0F172A',
  },
  confirmButton: {
    backgroundColor: '#16A34A',
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  confirmText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 16,
    alignItems: 'center',
  },
  privacyNotice: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 14,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
});
