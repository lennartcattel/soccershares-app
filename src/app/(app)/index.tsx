import { useSession } from '@/lib/auth-context'
import { Pressable, StyleSheet, Text, View } from 'react-native'

export default function Home() {
  const { session, signOut } = useSession()
  return (
    <View style={styles.container}>
      <Text style={styles.title}>You're signed in</Text>
      <Text>{session?.user.email}</Text>
      <Pressable style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  title: { fontSize: 22, fontWeight: '600' },
  button: { backgroundColor: '#c33', borderRadius: 8, padding: 14, paddingHorizontal: 24 },
  buttonText: { color: '#fff', fontWeight: '600' },
})