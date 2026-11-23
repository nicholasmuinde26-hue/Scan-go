import { StyleSheet, Text, View } from 'react-native'; import { useOffline } from '../core/offline'; import { useI18n } from '../core/i18n';
export function OfflineBanner(){const offline=useOffline(); const { t } = useI18n();if(!offline)return null;return <View accessibilityRole="alert" style={s.banner}><Text style={s.text}>{t('offline_retry')}</Text></View>;}
const s=StyleSheet.create({banner:{backgroundColor:'#8b4b17',padding:9,alignItems:'center'},text:{color:'#fff',fontSize:12,fontWeight:'700'}});
