import { Alert } from 'react-native';
import { authApi } from './api';
import { tokens } from '../../core/session/tokens';

export interface GoogleUserPayload {
  email: string;
  name: string;
  googleId: string;
  avatarUrl?: string;
}

export async function performGoogleSignIn(customEmail?: string, customName?: string) {
  try {
    // Generate or use provided profile
    const email = (customEmail || 'customer.google@scanandgo.co.ke').trim().toLowerCase();
    const name = customName || (email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
    const googleId = `gid_${Math.abs(hashString(email))}`;
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(name)}`;

    const response = await authApi.google({
      email,
      name,
      googleId,
      avatarUrl,
    });

    if (response?.token) {
      await tokens.save(response.token, response.refreshToken || '');
      return response;
    } else {
      throw new Error('No authentication token received from Google sign in');
    }
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    throw error;
  }
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}
