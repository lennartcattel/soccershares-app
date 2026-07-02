import { theme } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import * as Linking from 'expo-linking'
import { Link } from 'expo-router'
import { useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit() {
    const mail = email.trim()
    if (!mail) return

    setLoading(true)
    setError(null)

    const redirectTo = Linking.createURL('/reset-password')
    const { error: err } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo })

    setLoading(false)
    if (err) { setError(err.message); return }
    setSent(true)
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.container}>
        <View style={s.card}>
          <Image
            source={{ uri: 'https://www.soccershares.nl/SoccerShareslogo.png' }}
            style={s.logo}
            resizeMode="contain"
          />
          <Text style={s.subtitle}>
            Enter your email and we'll send you a reset link.
          </Text>

          {sent ? (
            <View style={s.successBox}>
              <Text style={s.successText}>Check your email for a password reset link.</Text>
            </View>
          ) : (
            <>
              <View style={s.field}>
                <Text style={s.label}>Email</Text>
                <TextInput
                  style={s.input}
                  placeholder="you@example.com"
                  placeholderTextColor={theme.colors.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  value={email}
                  onChangeText={setEmail}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              </View>

              {error && (
                <View style={s.errorBox}>
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              <Pressable
                style={[s.button, loading && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={loading || !email.trim()}
              >
                <Text style={s.buttonText}>{loading ? 'Sending…' : 'Send reset link'}</Text>
              </Pressable>
            </>
          )}

          <Link href="/login" style={s.backLink}>← Back to sign in</Link>
        </View>
        <Text style={s.pageFooter}>© SoccerShares 2010 – 2026</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
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
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  logo: { width: 200, height: 56, alignSelf: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  field: { gap: 4 },
  label: { fontSize: 14, fontWeight: '500', color: theme.colors.text },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  successBox: {
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  successText: { fontSize: 13, color: '#15803d' },
  errorBox: {
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: { fontSize: 13, color: '#b91c1c' },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonPressed: { backgroundColor: theme.colors.primaryDark },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  backLink: { fontSize: 14, color: theme.colors.primary, textAlign: 'center', marginTop: 4 },
  pageFooter: { color: theme.colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 8 },
})
