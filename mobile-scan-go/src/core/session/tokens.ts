import * as SecureStore from 'expo-secure-store';
const ACCESS = 'access_token'; const REFRESH = 'refresh_token';
export const tokens = {
  access: () => SecureStore.getItemAsync(ACCESS),
  refresh: () => SecureStore.getItemAsync(REFRESH),
  save: async (accessToken: string, refreshToken?: string) => { await SecureStore.setItemAsync(ACCESS, accessToken); if (refreshToken) await SecureStore.setItemAsync(REFRESH, refreshToken); },
  clear: async () => { await SecureStore.deleteItemAsync(ACCESS); await SecureStore.deleteItemAsync(REFRESH); },
};
