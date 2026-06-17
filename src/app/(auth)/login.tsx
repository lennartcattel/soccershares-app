import { supabase } from '@/lib/supabase'
import * as Linking from 'expo-linking'
import { Link } from 'expo-router'
import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function signIn() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) Alert.alert('Sign in failed', error.message)
  }

  async function forgotPassword() {
    if (!email) return Alert.alert('Enter your email first')
    const redirectTo = Linking.createURL('/reset-password')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    Alert.alert(error ? 'Error' : 'Check your email',
      error ? error.message : 'We sent a reset link to your inbox.')
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SoccerShares</Text>
      <TextInput
        style={styles.input} placeholder="Email" keyboardType="email-address"
        autoCapitalize="none" value={email} onChangeText={setEmail}
      />
      <TextInput
        style={styles.input} placeholder="Password" secureTextEntry
        autoCapitalize="none" value={password} onChangeText={setPassword}
      />
      <Pressable style={styles.button} onPress={signIn} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
      </Pressable>
      <Pressable onPress={forgotPassword}>
        <Text style={styles.link}>Forgot password?</Text>
      </Pressable>
      <Link href="/register" style={styles.link}>Create an account</Link>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 14, fontSize: 16 },
  button: { backgroundColor: '#0a7', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { color: '#0a7', textAlign: 'center', paddingVertical: 8 },
})