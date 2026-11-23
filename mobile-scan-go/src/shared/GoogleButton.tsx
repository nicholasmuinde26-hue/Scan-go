import React from 'react';
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { theme } from './theme';

interface GoogleButtonProps {
  onPress: () => void;
  loading?: boolean;
  title?: string;
  variant?: 'outline' | 'filled';
}

export function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </Svg>
  );
}

export function GoogleButton({
  onPress,
  loading = false,
  title = 'Continue with Google',
  variant = 'outline',
}: GoogleButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        s.button,
        variant === 'outline' ? s.buttonOutline : s.buttonFilled,
        pressed && s.pressed,
      ]}
      onPress={onPress}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color={theme.color.ink} />
      ) : (
        <View style={s.content}>
          <GoogleIcon size={22} />
          <Text style={[s.text, variant === 'filled' && s.textFilled]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginVertical: 6,
  },
  buttonOutline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  buttonFilled: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    letterSpacing: -0.2,
  },
  textFilled: {
    color: '#0F172A',
  },
});
