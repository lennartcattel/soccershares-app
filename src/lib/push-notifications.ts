import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { supabase } from './supabase'

export async function registerPushToken(userId: string): Promise<void> {
  if (!Device.isDevice) return

  if (Constants.appOwnership === 'expo') {
    console.log('[PushToken] Skipping registration in Expo Go')
    return
  }

  const { status: existing } = await Notifications.getPermissionsAsync()
  const finalStatus = existing === 'granted'
    ? existing
    : (await Notifications.requestPermissionsAsync()).status

  if (finalStatus !== 'granted') {
    console.warn('[PushToken] Permission not granted:', finalStatus)
    return
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId
  if (!projectId) {
    console.warn('[PushToken] No projectId found in Constants.expoConfig')
    return
  }

  try {
    const { data: tokenData } = await Notifications.getExpoPushTokenAsync({ projectId })
    console.log('[PushToken] Token obtained:', tokenData)
    const { error } = await supabase.from('users').update({ push_token: tokenData }).eq('id', userId)
    if (error) console.warn('[PushToken] Supabase update failed:', error.message)
    else console.log('[PushToken] Token saved successfully for user', userId)
  } catch (e) {
    console.warn('[PushToken] getExpoPushTokenAsync failed:', e)
  }
}

export async function clearPushToken(userId: string | undefined): Promise<void> {
  if (!userId) return
  await supabase.from('users').update({ push_token: null }).eq('id', userId)
}
