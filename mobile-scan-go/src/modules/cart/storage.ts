import AsyncStorage from '@react-native-async-storage/async-storage'; import type { CartLine } from './types';
const KEY='collect_cart';
export const cartStorage={get:async():Promise<CartLine[]>=>{const v=await AsyncStorage.getItem(KEY);return v?JSON.parse(v):[];},set:(cart:CartLine[])=>AsyncStorage.setItem(KEY,JSON.stringify(cart)),clear:()=>AsyncStorage.removeItem(KEY)};
