import AsyncStorage from '@react-native-async-storage/async-storage';
const KEY='active_basket';
export const activeBasket={get:()=>AsyncStorage.getItem(KEY),set:(id:string)=>AsyncStorage.setItem(KEY,id),clear:()=>AsyncStorage.removeItem(KEY)};
