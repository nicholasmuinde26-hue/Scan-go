import AsyncStorage from '@react-native-async-storage/async-storage';
const KEY='presence_code';
export const presenceSession={get:()=>AsyncStorage.getItem(KEY),set:(id:string)=>AsyncStorage.setItem(KEY,id),clear:()=>AsyncStorage.removeItem(KEY)};
