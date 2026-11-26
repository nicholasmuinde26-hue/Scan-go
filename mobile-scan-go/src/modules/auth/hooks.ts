import { useMutation, useQuery } from '@tanstack/react-query';
import { authApi } from './api';
import { tokens } from '../../core/session/tokens';
import { guestStore } from '../guest/store';

const clearGuest = () => { guestStore.clear().catch(() => {}); };

export const useCustomer = () => useQuery({queryKey:['auth','me'],queryFn:authApi.me, retry: false});
export const useLogin = () => useMutation({mutationFn:({phone,password}:{phone:string;password:string})=>authApi.login(phone,password), onSuccess:async r=>{await tokens.save(r.token,r.refreshToken); await clearGuest();}});
export const useGoogleAuth = () => useMutation({mutationFn:authApi.google, onSuccess:async r=>{await tokens.save(r.token,r.refreshToken); await clearGuest();}});
export const useRegister = () => useMutation({mutationFn:authApi.register, onSuccess:async r=>{await tokens.save(r.token,r.refreshToken); await clearGuest();}});
export const useSendOtp=()=>useMutation({mutationFn:({phone,purpose}:{phone:string;purpose:'REGISTRATION'|'FORGOT_PASSWORD'|'LOGIN_VERIFY'})=>authApi.sendOtp(phone,purpose)});
export const useResetPassword=()=>useMutation({mutationFn:({phone,otp,newPassword}:{phone:string;otp:string;newPassword:string})=>authApi.resetPassword(phone,otp,newPassword)});
export const useLogout=()=>useMutation({mutationFn:authApi.logout});
export const useLogoutAll=()=>useMutation({mutationFn:authApi.logoutAll});
