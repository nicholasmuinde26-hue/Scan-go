import { request } from '../../core/api/client';
import type { AuthResult } from './types';
export const authApi = {
  sendOtp: (phone: string, purpose: 'REGISTRATION'|'FORGOT_PASSWORD'|'LOGIN_VERIFY') => request<any>('/auth/otp/send',{method:'POST',body:JSON.stringify({phone,purpose})}),
  register: (input: {name:string;phone:string;email?:string;password:string;otp:string;termsConsent:true}) => request<AuthResult>('/auth/register',{method:'POST',body:JSON.stringify(input)}),
  login: (phone:string,password:string) => request<AuthResult>('/auth/login',{method:'POST',body:JSON.stringify({phone,password,portal:'CUSTOMER'})}),
  google: (input: { email?: string; name?: string; googleId?: string; avatarUrl?: string; idToken?: string }) => request<AuthResult>('/auth/google', { method: 'POST', body: JSON.stringify({ ...input, isMobile: true }) }),
  me: () => request<{success:true;user:import('./types').Customer}>('/auth/me'),
  logout: async () => { const refreshToken = await (await import('../../core/session/tokens')).tokens.refresh(); return request('/auth/logout',{method:'POST',body:JSON.stringify({refreshToken})}); },
  logoutAll: () => request('/auth/logout-all',{method:'POST'}),
  resetPassword: (phone:string,otp:string,newPassword:string) => request('/auth/reset-password',{method:'POST',body:JSON.stringify({phone,otp,newPassword})}),
};
