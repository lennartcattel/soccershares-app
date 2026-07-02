import { theme } from '@/constants/theme'
import { useSession } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { Tabs } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Modal,
  Pressable,
  Image as RNImage,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'

type Mode = 'menu' | 'name' | 'email'

function Header() {
  const { session, signOut } = useSession()
  const insets = useSafeAreaInsets()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const nameRef = useRef<View>(null)
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState(session?.user?.email ?? '')
  const [mode, setMode] = useState<Mode>('menu')
  const [nameValue, setNameValue] = useState('')
  const [emailValue, setEmailValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (session?.user?.id) {
      supabase
        .from('users')
        .select('display_name, email')
        .eq('id', session.user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setDisplayName(data.display_name ?? '')
            setEmail(data.email ?? '')
          }
        })
    }
  }, [session?.user?.id])

  function openMenu() {
    nameRef.current?.measure((x, y, width, height, pageX, pageY) => {
      setMenuPos({ top: pageY + height + 4, right: 16 })
      setMode('menu')
      setSaveError(null)
      setMenuOpen(true)
    })
  }

  function closeMenu() {
    setMenuOpen(false)
    setMode('menu')
    setSaveError(null)
  }

  async function handleSaveName() {
    if (!session?.user?.id) return
    setIsSaving(true)
    setSaveError(null)
    const { error } = await supabase.from('users').update({ display_name: nameValue }).eq('id', session.user.id)
    setIsSaving(false)
    if (error) {
      setSaveError(error.message)
    } else {
      setDisplayName(nameValue)
      setMode('menu')
    }
  }

  async function handleSaveEmail() {
    if (!session?.user?.id) return
    setIsSaving(true)
    setSaveError(null)
    const { error } = await supabase.auth.updateUser({ email: emailValue })
    setIsSaving(false)
    if (error) {
      setSaveError(error.message)
    } else {
      Alert.alert('Check your inbox', `A confirmation link was sent to ${emailValue}. Your email will update after confirming.`)
      setMode('menu')
    }
  }

  return (
    <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
      <View style={styles.logoContainer}>
        <RNImage
          source={require('../../../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.subtitle}>2026 FIFA WORLD CUP</Text>
      </View>

      <Pressable onPress={openMenu} ref={nameRef}>
        <View style={styles.userButton}>
          <Text style={styles.userName}>{displayName}</Text>
          <Text style={styles.dropdownArrow}>▼</Text>
        </View>
      </Pressable>

      <Modal transparent visible={menuOpen} onRequestClose={closeMenu}>
        <TouchableOpacity style={styles.overlay} onPress={closeMenu}>
          <Pressable onPress={() => {}} style={[styles.menu, { top: menuPos.top, right: menuPos.right }]}>
            {/* Name row */}
            <View style={styles.menuRow}>
              <Text style={styles.menuName}>{displayName}</Text>
              {mode === 'menu' && (
                <Pressable onPress={() => { setNameValue(displayName); setMode('name'); setSaveError(null) }}>
                  <Text style={styles.editIcon}>✏</Text>
                </Pressable>
              )}
            </View>
            {/* Email row */}
            <View style={styles.menuRow}>
              <Text style={styles.menuEmail}>{email}</Text>
              {mode === 'menu' && (
                <Pressable onPress={() => { setEmailValue(email); setMode('email'); setSaveError(null) }}>
                  <Text style={styles.editIcon}>✏</Text>
                </Pressable>
              )}
            </View>

            {/* Name edit */}
            {mode === 'name' && (
              <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 8, marginTop: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#6b7280' }}>New display name</Text>
                <TextInput
                  value={nameValue}
                  onChangeText={setNameValue}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                  style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, color: '#1f2937' }}
                />
                {saveError && <Text style={{ fontSize: 11, color: '#dc2626' }}>{saveError}</Text>}
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Pressable
                    onPress={handleSaveName}
                    disabled={isSaving}
                    style={{ flex: 1, backgroundColor: '#4a7c3f', borderRadius: 8, paddingVertical: 6, alignItems: 'center', opacity: isSaving ? 0.5 : 1 }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>{isSaving ? 'Saving…' : 'Save'}</Text>
                  </Pressable>
                  <Pressable onPress={() => setMode('menu')}>
                    <Text style={{ fontSize: 12, color: '#9ca3af' }}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Email edit */}
            {mode === 'email' && (
              <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 8, marginTop: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#6b7280' }}>New email address</Text>
                <TextInput
                  value={emailValue}
                  onChangeText={setEmailValue}
                  autoFocus
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleSaveEmail}
                  style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, color: '#1f2937' }}
                />
                {saveError && <Text style={{ fontSize: 11, color: '#dc2626' }}>{saveError}</Text>}
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Pressable
                    onPress={handleSaveEmail}
                    disabled={isSaving}
                    style={{ flex: 1, backgroundColor: '#4a7c3f', borderRadius: 8, paddingVertical: 6, alignItems: 'center', opacity: isSaving ? 0.5 : 1 }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>{isSaving ? 'Saving…' : 'Save'}</Text>
                  </Pressable>
                  <Pressable onPress={() => setMode('menu')}>
                    <Text style={{ fontSize: 12, color: '#9ca3af' }}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Sign out */}
            {mode === 'menu' && (
              <Pressable
                onPress={() => { closeMenu(); signOut() }}
                style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 8, marginTop: 4 }}
              >
                <Text style={styles.signOut}>Sign out</Text>
              </Pressable>
            )}
          </Pressable>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

function HomeIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </Svg>
  )
}

function SharesIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </Svg>
  )
}

function PredictionsIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </Svg>
  )
}

function LeaguesIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
    </Svg>
  )
}

function RulesIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </Svg>
  )
}

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        header: () => <Header />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <HomeIcon color={color} /> }} />
      <Tabs.Screen name="shares" options={{ title: 'Shares', tabBarIcon: ({ color }) => <SharesIcon color={color} /> }} />
      <Tabs.Screen name="predictions" options={{ title: 'Predictions', tabBarIcon: ({ color }) => <PredictionsIcon color={color} /> }} />
      <Tabs.Screen name="leagues" options={{ title: 'Leagues', tabBarIcon: ({ color }) => <LeaguesIcon color={color} /> }} />
      <Tabs.Screen name="rules" options={{ title: 'Rules', tabBarIcon: ({ color }) => <RulesIcon color={color} /> }} />
      <Tabs.Screen name="leagues-create" options={{ href: null }} />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  logoContainer: { flexDirection: 'column' },
  logo: { height: 44, width: 221 },
  subtitle: { fontSize: 10, fontWeight: '700', color: theme.colors.textSecondary, letterSpacing: 0.5, marginTop: 1, marginLeft: 4 },
  userButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userName: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  dropdownArrow: { fontSize: 8, color: theme.colors.text },
  overlay: { flex: 1 },
  menu: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    minWidth: 200,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  menuName: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  menuEmail: { fontSize: 13, color: theme.colors.textSecondary },
  editIcon: { fontSize: 12, color: theme.colors.textSecondary },
  signOut: { fontSize: 14, color: theme.colors.loss, fontWeight: '600', marginTop: 4 },
})