import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useRegister, useSendOtp } from '../hooks';
import { GoogleButton } from '../../../shared/GoogleButton';
import { GoogleSignInModal } from '../components/GoogleSignInModal';
import { theme } from '../../../shared/theme';
import { notify } from '../../../shared/ui/feedback';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const topPadding = Math.max(insets.top, 20) + 12;
  const bottomPadding = Math.max(insets.bottom, 16) + 30;

  const otpMutation = useSendOtp();
  const registerMutation = useRegister();

  const handleSendOtp = async () => {
    if (!name.trim()) return notify(`Name required: Please enter your full name.`, 'error');
    if (!phone.trim()) return notify(`Phone required: Please enter your phone number.`, 'error');
    if (password.length < 12) return notify(`Password too short: Password must be at least 12 characters.`, 'error');

    try {
      const r = await otpMutation.mutateAsync({ phone: phone.trim(), purpose: 'REGISTRATION' });
      setSent(true);
      notify(`Verification code sent: ${r.devOtpCode ? `Development code: ${r.devOtpCode}` : r.message || 'Check your SMS for the 6-digit code.'}`, 'info');
    } catch (e: any) {
      notify(`Verification error: ${e instanceof Error ? e.message : 'Please check your phone number and try again.'}`, 'error');
    }
  };

  const handleRegister = async () => {
    if (!consent) {
      return notify(`Consent required: Please agree to the Terms of Service and Privacy Policy to proceed.`, 'error');
    }
    if (!otp.trim()) {
      return notify(`Code required: Please enter the 6-digit verification code.`, 'error');
    }
    try {
      await registerMutation.mutateAsync({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        password,
        otp: otp.trim(),
        termsConsent: true,
      });
      router.replace('/(tabs)');
    } catch (e: any) {
      notify(`Could not create account: ${e instanceof Error ? e.message : 'Please try again.'}`, 'error');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={s.page}
    >
      <ScrollView
        contentContainerStyle={[s.scrollContent, { paddingTop: topPadding, paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backText}>‹  Back</Text>
        </Pressable>

        {/* Brand header */}
        <View style={s.brandRow}>
          <Text style={s.brandLogo}>
            scan<Text style={{ color: '#F97316' }}>&</Text>go
          </Text>
          <View style={s.brandBadge}>
            <Svg width={22} height={22} viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="46" fill="#DCFCE7" />
              <Path d="M30 42 L70 42 L66 72 L34 72 Z" fill="#16A34A" />
              <Circle cx="44" cy="38" r="8" fill="#EF4444" />
              <Circle cx="58" cy="36" r="7" fill="#F97316" />
            </Svg>
          </View>
        </View>

        <Text style={s.heading}>Create account</Text>
        <Text style={s.sub}>
          Join Scan & Go to skip checkout lines and enjoy personalized discounts.
        </Text>

        {/* Google Fast Sign Up */}
        <View style={s.googleBox}>
          <GoogleButton
            title="Sign up with Google"
            onPress={() => setShowGoogleModal(true)}
          />
        </View>

        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or register with phone</Text>
          <View style={s.dividerLine} />
        </View>

        {/* Inputs */}
        <Field label="Full Name" value={name} onChange={setName} placeholder="e.g. Alex Mwangi" />
        <Field
          label="Phone Number"
          value={phone}
          onChange={setPhone}
          placeholder="07XX XXX XXX"
          keyboardType="phone-pad"
        />
        <Field
          label="Email (optional)"
          value={email}
          onChange={setEmail}
          placeholder="name@example.com"
          keyboardType="email-address"
        />
        <View style={s.fieldWrapper}>
          <Text style={s.label}>PASSWORD (MIN 12 CHARS)</Text>
          <View style={s.passwordWrap}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••••••"
              secureTextEntry={!showPassword}
              style={[s.input, s.passwordInput]}
            />
            <Pressable style={s.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
              <Text style={s.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
            </Pressable>
          </View>
        </View>

        {sent && (
          <View style={s.otpContainer}>
            <Field
              label="6-Digit Verification Code"
              value={otp}
              onChange={setOtp}
              placeholder="123456"
              keyboardType="number-pad"
            />
          </View>
        )}

        {!sent ? (
          <Pressable
            style={[s.primaryBtn, otpMutation.isPending && s.btnDisabled]}
            onPress={handleSendOtp}
            disabled={otpMutation.isPending}
          >
            <Text style={s.primaryBtnText}>
              {otpMutation.isPending ? 'Sending verification…' : 'Send verification code'}
            </Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              style={s.consentRow}
              onPress={() => setConsent(!consent)}
            >
              <View style={[s.checkbox, consent && s.checkboxChecked]}>
                {consent && <Text style={s.checkmark}>✓</Text>}
              </View>
              <Text style={s.consentText}>
                I agree to the <Text style={s.linkText}>Terms of Service</Text> and{' '}
                <Text style={s.linkText}>Privacy Policy</Text> under the Data Protection Act.
              </Text>
            </Pressable>

            <Pressable
              style={[s.primaryBtn, registerMutation.isPending && s.btnDisabled]}
              onPress={handleRegister}
              disabled={registerMutation.isPending}
            >
              <Text style={s.primaryBtnText}>
                {registerMutation.isPending ? 'Creating account…' : 'Complete Registration'}
              </Text>
            </Pressable>
          </>
        )}

        {/* Already have an account */}
        <Pressable
          style={s.loginLink}
          onPress={() => router.replace('/')}
        >
          <Text style={s.loginLinkText}>
            Already have an account? <Text style={s.linkText}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>

      {/* Google Modal */}
      <GoogleSignInModal
        visible={showGoogleModal}
        onClose={() => setShowGoogleModal(false)}
        onSuccess={() => router.replace('/(tabs)')}
      />
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = 'default',
  secureTextEntry = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  secureTextEntry?: boolean;
}) {
  return (
    <View style={s.fieldWrapper}>
      <Text style={s.label}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        style={s.input}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 54,
    paddingBottom: 40,
  },
  backBtn: {
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  backText: {
    color: '#16A34A',
    fontWeight: '700',
    fontSize: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  brandLogo: {
    fontSize: 24,
    fontWeight: '900',
    color: '#15803D',
    letterSpacing: -0.5,
  },
  brandBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 16,
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 20,
  },
  googleBox: {
    marginBottom: 10,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: 12,
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  fieldWrapper: {
    marginVertical: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#64748B',
    marginBottom: 6,
  },
  input: {
    height: 50,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    color: '#0F172A',
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    paddingRight: 48,
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    padding: 6,
  },
  eyeText: {
    fontSize: 16,
  },
  otpContainer: {
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginVertical: 8,
  },
  primaryBtn: {
    height: 52,
    backgroundColor: '#16A34A',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  consentText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  linkText: {
    color: '#16A34A',
    fontWeight: '700',
  },
  loginLink: {
    marginTop: 24,
    alignItems: 'center',
    paddingVertical: 10,
  },
  loginLinkText: {
    fontSize: 14,
    color: '#64748B',
  },
});
