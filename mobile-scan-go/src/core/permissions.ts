import { Alert } from 'react-native'; import * as Location from 'expo-location'; import * as Notifications from 'expo-notifications';

// GPS is a soft signal for poster check-in — never block or nag. The explainer
// alert only shows the first time (status 'undetermined'); afterwards we return
// the existing grant/denial so scans don't pop a dialog every time.
export async function requestLocationPermission():Promise<Location.LocationPermissionResponse>{
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted || current.status !== 'undetermined') return current;
  return new Promise(resolve=>Alert.alert('Why we ask for location', 'Location can help confirm your presence at a participating store. You can still scan the entrance poster if indoor location is unavailable.',[{text:'Continue',onPress:async()=>resolve(await Location.requestForegroundPermissionsAsync())},{text:'Not now',style:'cancel',onPress:async()=>resolve(await Location.getForegroundPermissionsAsync())}]));
}
export async function requestNotificationPermission(){return new Promise<Notifications.NotificationPermissionsStatus>(resolve=>Alert.alert('Order updates', 'Notifications let us tell you when your order is ready or a replacement needs your reply.',[{text:'Enable',onPress:async()=>resolve(await Notifications.requestPermissionsAsync())},{text:'Not now',style:'cancel',onPress:async()=>resolve(await Notifications.getPermissionsAsync())}]));}
