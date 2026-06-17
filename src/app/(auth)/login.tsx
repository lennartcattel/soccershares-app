import { theme } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import * as Linking from 'expo-linking'
import { Link } from 'expo-router'
import { useState } from 'react'
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

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
      <View style={styles.card}>
        <Image
          source={{ uri: 'https://www.soccershares.nl/SoccerShareslogo.png' }}
          style={styles.logo}
          resizeMode="contain"
        />

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={theme.colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={theme.colors.textSecondary}
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
          />
          <Pressable onPress={forgotPassword} style={styles.forgotContainer}>
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={signIn}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign in'}</Text>
        </Pressable>

        <View style={styles.signupRow}>
          <Text style={styles.signupText}>No account? </Text>
          <Link href="/register" style={styles.signupLink}>Sign up</Link>
        </View>
      </View>

      <Text style={styles.footer}>© SoccerShares 2010 – 2026</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  logo: {
    width: 200,
    height: 56,
    alignSelf: 'center',
    marginBottom: theme.spacing.sm,
  },
  field: {
    gap: theme.spacing.xs,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  forgotContainer: {
    alignSelf: 'flex-end',
    marginTop: theme.spacing.xs,
  },
  forgot: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  buttonPressed: {
    backgroundColor: theme.colors.primaryDark,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signupText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  signupLink: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
  },
})