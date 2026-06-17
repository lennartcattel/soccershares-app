import { useSession } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

export default function ResetPassword() {
  const router = useRouter()
  const { clearRecovery } = useSession()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit() {
    if (password.length < 8) return Alert.alert('Too short', 'Use at least 8 characters.')
    if (password !== confirm) return Alert.alert('Passwords don\'t match')

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) return Alert.alert('Could not update password', error.message)

    clearRecovery()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set a new password</Text>
      <TextInput
        style={styles.input} placeholder="New password" secureTextEntry
        value={password} onChangeText={setPassword} autoCapitalize="none"
      />
      <TextInput
        style={styles.input} placeholder="Confirm password" secureTextEntry
        value={confirm} onChangeText={setConfirm} autoCapitalize="none"
      />
      <Pressable style={styles.button} onPress={onSubmit} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Saving…' : 'Update password'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 14, fontSize: 16 },
  button: { backgroundColor: '#0a7', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})