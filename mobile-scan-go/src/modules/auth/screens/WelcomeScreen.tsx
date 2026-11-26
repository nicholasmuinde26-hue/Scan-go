import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Circle, G } from 'react-native-svg';
import { theme } from '../../../shared/theme';
import { GoogleButton } from '../../../shared/GoogleButton';
import { GoogleSignInModal } from '../components/GoogleSignInModal';
import { useLogin, useSendOtp, useResetPassword } from '../hooks';
import { notify } from '../../../shared/ui/feedback';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  iconType: 'basket' | 'quality' | 'savings' | 'store';
}

const SLIDES: Slide[] = [
  {
    id: '1',
    title: 'Tap a button,\nget your groceries',
    subtitle: 'Get your groceries scanned, bagged, or ready for pickup — skip the checkout line completely.',
    iconType: 'basket',
  },
  {
    id: '2',
    title: 'Get quality groceries\npicked with care',
    subtitle: 'Browse thousands of fresh items with real-time stock, verified prices, and dietary info.',
    iconType: 'quality',
  },
  {
    id: '3',
    title: 'Shop more deals,\nsave more with us',
    subtitle: 'Save with exclusive digital discounts, loyalty points, and barcode price-checks instantly.',
    iconType: 'savings',
  },
  {
    id: '4',
    title: 'Shop from your\nfavorite stores',
    subtitle: 'Participating supermarkets across Kenya — scan items in-store or order ahead seamlessly.',
    iconType: 'store',
  },
];

function SlideIllustration({ type }: { type: Slide['iconType'] }) {
  if (type === 'basket') {
    return (
      <View style={s.illustrationWrapper}>
        <View style={[s.illustrationCircle, { backgroundColor: '#DCFCE7' }]}>
          <Svg width={140} height={140} viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="44" fill="#BBF7D0" opacity={0.6} />
            {/* Phone */}
            <Rect x="20" y="18" width="34" height="60" rx="6" fill="#15803D" />
            <Rect x="24" y="24" width="26" height="42" rx="3" fill="#FFFFFF" />
            <Circle cx="37" cy="72" r="2.5" fill="#BBF7D0" />
            {/* Basket & Groceries */}
            <Path d="M44 48 L76 48 L70 76 L50 76 Z" fill="#16A34A" />
            <Path d="M48 48 L56 34 L64 48" stroke="#15803D" strokeWidth="3" fill="none" />
            {/* Apple & Orange */}
            <Circle cx="55" cy="46" r="7" fill="#EF4444" />
            <Circle cx="65" cy="45" r="6" fill="#F97316" />
            <Circle cx="60" cy="40" r="4" fill="#22C55E" />
          </Svg>
        </View>
      </View>
    );
  }
  if (type === 'quality') {
    return (
      <View style={s.illustrationWrapper}>
        <View style={[s.illustrationCircle, { backgroundColor: '#E0F2FE' }]}>
          <Svg width={140} height={140} viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="44" fill="#BAE6FD" opacity={0.6} />
            {/* Shield & Check */}
            <Path d="M50 18 L76 30 C76 54 50 78 50 78 C50 78 24 54 24 30 Z" fill="#0284C7" />
            <Path d="M38 46 L46 54 L62 38" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            {/* Sparkles */}
            <Circle cx="76" cy="22" r="3" fill="#38BDF8" />
            <Circle cx="20" cy="50" r="3" fill="#38BDF8" />
          </Svg>
        </View>
      </View>
    );
  }
  if (type === 'savings') {
    return (
      <View style={s.illustrationWrapper}>
        <View style={[s.illustrationCircle, { backgroundColor: '#FEF3C7' }]}>
          <Svg width={140} height={140} viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="44" fill="#FDE68A" opacity={0.6} />
            {/* Discount Tag */}
            <Path d="M30 24 L56 24 L80 48 L54 74 L30 50 Z" fill="#D97706" />
            <Circle cx="42" cy="36" r="4" fill="#FFFFFF" />
            <Path d="M46 56 L64 38" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
            <Circle cx="50" cy="44" r="2.5" fill="#FFFFFF" />
            <Circle cx="60" cy="50" r="2.5" fill="#FFFFFF" />
          </Svg>
        </View>
      </View>
    );
  }
  return (
    <View style={s.illustrationWrapper}>
      <View style={[s.illustrationCircle, { backgroundColor: '#DCFCE7' }]}>
        <Svg width={140} height={140} viewBox="0 0 100 100">
          <Circle cx="50" cy="50" r="44" fill="#BBF7D0" opacity={0.6} />
          {/* Store front */}
          <Path d="M22 42 L78 42 L74 76 L26 76 Z" fill="#15803D" />
          <Path d="M18 42 L26 26 L74 26 L82 42 Z" fill="#16A34A" />
          <Rect x="42" y="52" width="16" height="24" rx="2" fill="#FFFFFF" />
          <Rect x="28" y="50" width="10" height="12" rx="2" fill="#BBF7D0" />
          <Rect x="62" y="50" width="10" height="12" rx="2" fill="#BBF7D0" />
        </Svg>
      </View>
    </View>
  );
}

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [modalMode, setModalMode] = useState<'login' | 'forgot'>('login');
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const topPadding = Math.max(insets.top, 20) + 10;
  const bottomPadding = Math.max(insets.bottom, 16) + 12;

  const flatListRef = useRef<FlatList>(null);
  const loginMutation = useLogin();
  const otpMutation = useSendOtp();
  const resetMutation = useResetPassword();

  const openLoginModal = () => {
    setModalMode('login');
    setForgotStep(1);
    setOtp('');
    setNewPassword('');
    setShowLoginModal(true);
  };

  const handleSendResetOtp = async () => {
    if (!phone.trim()) return notify('Enter your registered phone number first.', 'info');
    try {
      const r = await otpMutation.mutateAsync({ phone: phone.trim(), purpose: 'FORGOT_PASSWORD' });
      setForgotStep(2);
      notify(`Code sent: ${r.devOtpCode ? `Development code: ${r.devOtpCode}` : 'Check your SMS for the 6-digit code.'}`, 'info');
    } catch (e: any) {
      notify(`Could not send code: ${e instanceof Error ? e.message : 'Please try again.'}`, 'error');
    }
  };

  const handleResetPassword = async () => {
    if (!otp.trim() || newPassword.length < 12) {
      return notify('Enter the 6-digit code and a new password (min 12 characters).', 'info');
    }
    try {
      await resetMutation.mutateAsync({ phone: phone.trim(), otp: otp.trim(), newPassword });
      notify('Password updated! You can now sign in.', 'info');
      setModalMode('login');
      setForgotStep(1);
      setOtp('');
      setNewPassword('');
      setPassword('');
    } catch (e: any) {
      notify(`Reset failed: ${e instanceof Error ? e.message : 'Please try again.'}`, 'error');
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollOffset / SCREEN_WIDTH);
    setActiveIndex(index);
  };

  const handleLoginSubmit = async () => {
    if (!phone.trim() || !password) {
      return notify(`Sign in: Please enter your phone number and password.`, 'info');
    }
    try {
      await loginMutation.mutateAsync({ phone, password });
      setShowLoginModal(false);
      router.replace('/(tabs)');
    } catch (e: any) {
      notify(`Sign In Failed: ${e instanceof Error ? e.message : 'Please check your credentials.'}`, 'error');
    }
  };

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={[s.slide, { width: SCREEN_WIDTH }]}>
      <SlideIllustration type={item.iconType} />
      <Text style={s.slideTitle}>{item.title}</Text>
      <Text style={s.slideSubtitle}>{item.subtitle}</Text>
    </View>
  );

  return (
    <View style={s.container}>
      {/* Brand logo header */}
      <View style={[s.header, { paddingTop: topPadding }]}>
        <Text style={s.brandLogo}>
          scan<Text style={{ color: '#F97316' }}>&</Text>go
        </Text>
      </View>

      {/* Onboarding Carousel */}
      <View style={s.carouselArea}>
        <FlatList
          ref={flatListRef}
          data={SLIDES}
          renderItem={renderSlide}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
        />

        {/* Dots Pagination */}
        <View style={s.pagination}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                s.dot,
                i === activeIndex ? s.activeDot : s.inactiveDot,
              ]}
            />
          ))}
        </View>
      </View>

      {/* Action Buttons Section */}
      <View style={[s.actionSection, { paddingBottom: bottomPadding }]}>
        {/* Row of Login and Sign Up */}
        <View style={s.buttonRow}>
          <Pressable
            style={s.loginButton}
            onPress={openLoginModal}
          >
            <Text style={s.loginButtonText}>Login</Text>
          </Pressable>

          <Pressable
            style={s.signUpButton}
            onPress={() => router.push('/register')}
          >
            <Text style={s.signUpButtonText}>Sign up</Text>
          </Pressable>
        </View>

        {/* Google Sign In Button */}
        <GoogleButton
          title="Continue with Google"
          onPress={() => setShowGoogleModal(true)}
        />

        {/* Guest / Shopper Link */}
        <Pressable
          style={s.guestLink}
          onPress={() => router.push('/guest')}
        >
          <Text style={s.guestText}>
            Not looking for groceries?{' '}
            <Text style={s.guestHighlight}>Explore as guest</Text>
          </Text>
        </Pressable>
      </View>

      {/* Google Sign In Modal */}
      <GoogleSignInModal
        visible={showGoogleModal}
        onClose={() => setShowGoogleModal(false)}
        onSuccess={() => router.replace('/(tabs)')}
      />

      {/* Standard Phone/Password Login Modal */}
      <Modal visible={showLoginModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.modalBackdrop}
        >
          <View style={s.modalSheet}>
            <View style={s.sheetHandle} />

            {modalMode === 'login' ? (
              <>
                <Text style={s.modalTitle}>Welcome back</Text>
                <Text style={s.modalSubtitle}>Sign in with your registered phone number</Text>

                <Text style={s.fieldLabel}>PHONE NUMBER</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="07XX XXX XXX or +254..."
                  keyboardType="phone-pad"
                  style={s.input}
                />

                <Text style={s.fieldLabel}>PASSWORD</Text>
                <View style={s.passwordWrap}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Your password"
                    secureTextEntry={!showPassword}
                    style={[s.input, s.passwordInput]}
                  />
                  <Pressable style={s.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                    <Text style={s.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={s.forgotLink}
                  onPress={() => { setModalMode('forgot'); setForgotStep(1); }}
                >
                  <Text style={s.forgotText}>Forgot password?</Text>
                </Pressable>

                <Pressable
                  style={s.submitButton}
                  onPress={handleLoginSubmit}
                  disabled={loginMutation.isPending}
                >
                  <Text style={s.submitButtonText}>
                    {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
                  </Text>
                </Pressable>

                <View style={s.modalDivider}>
                  <View style={s.dividerLine} />
                  <Text style={s.dividerText}>or</Text>
                  <View style={s.dividerLine} />
                </View>

                <GoogleButton
                  title="Sign in with Google"
                  onPress={() => {
                    setShowLoginModal(false);
                    setShowGoogleModal(true);
                  }}
                />
              </>
            ) : (
              <>
                <Pressable onPress={() => setModalMode('login')} style={s.backToLogin}>
                  <Text style={s.backToLoginText}>‹  Back to sign in</Text>
                </Pressable>
                <Text style={s.modalTitle}>Reset password</Text>
                <Text style={s.modalSubtitle}>
                  {forgotStep === 1
                    ? 'Enter your phone number and we\'ll send a verification code.'
                    : 'Enter the code from your SMS and choose a new password.'}
                </Text>

                {forgotStep === 1 ? (
                  <>
                    <Text style={s.fieldLabel}>PHONE NUMBER</Text>
                    <TextInput
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="07XX XXX XXX or +254..."
                      keyboardType="phone-pad"
                      style={s.input}
                    />
                    <Pressable
                      style={s.submitButton}
                      onPress={handleSendResetOtp}
                      disabled={otpMutation.isPending}
                    >
                      <Text style={s.submitButtonText}>
                        {otpMutation.isPending ? 'Sending…' : 'Send verification code'}
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={s.fieldLabel}>VERIFICATION CODE</Text>
                    <TextInput
                      value={otp}
                      onChangeText={setOtp}
                      placeholder="6-digit code"
                      keyboardType="number-pad"
                      maxLength={6}
                      style={s.input}
                    />
                    <Text style={s.fieldLabel}>NEW PASSWORD (min 12 chars)</Text>
                    <TextInput
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="Choose a strong password"
                      secureTextEntry={!showPassword}
                      style={s.input}
                    />
                    <Pressable
                      style={s.submitButton}
                      onPress={handleResetPassword}
                      disabled={resetMutation.isPending}
                    >
                      <Text style={s.submitButtonText}>
                        {resetMutation.isPending ? 'Updating…' : 'Reset password'}
                      </Text>
                    </Pressable>
                    <Pressable style={s.forgotLink} onPress={handleSendResetOtp}>
                      <Text style={s.forgotText}>Resend code</Text>
                    </Pressable>
                  </>
                )}
              </>
            )}

            <Pressable
              style={s.closeModal}
              onPress={() => setShowLoginModal(false)}
            >
              <Text style={s.closeModalText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'space-between',
  },
  header: {
    paddingTop: 54,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  brandLogo: {
    fontSize: 26,
    fontWeight: '900',
    color: '#15803D',
    letterSpacing: -0.5,
  },
  carouselArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slide: {
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationWrapper: {
    marginBottom: 28,
    alignItems: 'center',
  },
  illustrationCircle: {
    width: 170,
    height: 170,
    borderRadius: 85,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 33,
    marginBottom: 12,
  },
  slideSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 290,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
    marginBottom: 10,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  activeDot: {
    width: 22,
    backgroundColor: '#16A34A',
  },
  inactiveDot: {
    width: 6,
    backgroundColor: '#CBD5E1',
  },
  actionSection: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
  },
  loginButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  signUpButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  signUpButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  guestLink: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  guestText: {
    fontSize: 13,
    color: '#64748B',
  },
  guestHighlight: {
    color: '#16A34A',
    fontWeight: '700',
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
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginTop: 10,
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
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingVertical: 4,
  },
  forgotText: {
    color: '#16A34A',
    fontSize: 13,
    fontWeight: '700',
  },
  backToLogin: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    paddingVertical: 4,
  },
  backToLoginText: {
    color: '#16A34A',
    fontSize: 14,
    fontWeight: '700',
  },
  submitButton: {
    height: 52,
    backgroundColor: '#16A34A',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalDivider: {
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
    marginHorizontal: 10,
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  closeModal: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 8,
  },
  closeModalText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
});
