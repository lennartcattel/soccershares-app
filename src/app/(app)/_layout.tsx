import { theme } from '@/constants/theme'
import { useSession } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { Tabs } from 'expo-router'
import { useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  Image as RNImage,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

function Header() {
  const { session, signOut } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const nameRef = useRef<View>(null)
  const [displayName, setDisplayName] = useState(session?.user?.email ?? '')
  const [email, setEmail] = useState(session?.user?.email ?? '')

  useState(() => {
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
  })

  function openMenu() {
    nameRef.current?.measure((x, y, width, height, pageX, pageY) => {
      setMenuPos({ top: pageY + height + 4, right: 16 })
      setMenuOpen(true)
    })
  }

  return (
    <View style={styles.header}>
      <View style={styles.logoContainer}>
        <RNImage
          source={{ uri: 'https://www.soccershares.nl/SoccerShareslogo.png' }}
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

      <Modal transparent visible={menuOpen} onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.overlay} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menu, { top: menuPos.top, right: menuPos.right }]}>
            <View style={styles.menuRow}>
              <Text style={styles.menuName}>{displayName}</Text>
              <Text style={styles.editIcon}>✏</Text>
            </View>
            <View style={styles.menuRow}>
              <Text style={styles.menuEmail}>{email}</Text>
              <Text style={styles.editIcon}>✏</Text>
            </View>
            <Pressable onPress={() => { setMenuOpen(false); signOut() }}>
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
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
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="shares" options={{ title: 'Shares' }} />
      <Tabs.Screen name="predictions" options={{ title: 'Predictions' }} />
      <Tabs.Screen name="leagues" options={{ title: 'Leagues' }} />
      <Tabs.Screen name="rules" options={{ title: 'Rules' }} />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  logoContainer: { flexDirection: 'column' },
  logo: { height: 44, width: 180 },
  subtitle: { fontSize: 10, fontWeight: '700', color: theme.colors.textSecondary, letterSpacing: 0.5, marginTop: 1 },
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