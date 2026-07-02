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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'

function EyeIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <Path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </Svg>
  )
}

function EyeOffIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </Svg>
  )
}

export default function Register() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  async function signUp() {
    const name = displayName.trim()
    const mail = email.trim()

    if (!name || !mail || !password) { setError('All fields are required.'); return }
    if (name.length < 2 || name.length > 40) { setError('Display name must be 2–40 characters.'); return }

    setLoading(true)
    setError(null)

    const { data: existing } = await supabase.from('users').select('id').eq('display_name', name).maybeSingle()
    if (existing) { setError('This display name is already taken. Please choose another.'); setLoading(false); return }

    const redirectTo = Linking.createURL('/')
    const { data, error: err } = await supabase.auth.signUp({
      email: mail,
      password,
      options: { data: { full_name: name }, emailRedirectTo: redirectTo },
    })

    setLoading(false)
    if (err) { setError(err.message); return }
    if (!data.session) setEmailSent(true)
  }

  if (emailSent) {
    return (
      <View style={s.container}>
        <View style={s.card}>
          <Text style={{ fontSize: 44, textAlign: 'center' }}>📧</Text>
          <Text style={s.title}>Check your email</Text>
          <Text style={s.subtitle}>
            We sent a confirmation link to your email address. Click it to activate your account.
          </Text>
          <Link href="/login" style={s.brandLink}>Back to sign in</Link>
        </View>
        <Text style={s.pageFooter}>© SoccerShares 2010 – 2026</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Image
            source={{ uri: 'https://www.soccershares.nl/SoccerShareslogo.png' }}
            style={s.logo}
            resizeMode="contain"
          />
          <Text style={s.title}>Create Account</Text>

          <View style={s.field}>
            <Text style={s.label}>Display name</Text>
            <TextInput
              style={s.input}
              placeholder="Name"
              placeholderTextColor={theme.colors.textSecondary}
              autoComplete="name"
              value={displayName}
              onChangeText={setDisplayName}
              returnKeyType="next"
            />
          </View>

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
              returnKeyType="next"
            />
          </View>

          <View style={s.field}>
            <Text style={s.label}>Password</Text>
            <View style={s.passwordWrap}>
              <TextInput
                style={[s.input, { flex: 1, paddingRight: 40 }]}
                placeholder="••••••••"
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                value={password}
                onChangeText={setPassword}
                returnKeyType="done"
                onSubmitEditing={signUp}
              />
              <Pressable onPress={() => setShowPassword(v => !v)} style={s.eyeBtn} hitSlop={8}>
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </Pressable>
            </View>
          </View>

          {error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={[s.button, loading && { opacity: 0.6 }]}
            onPress={signUp}
            disabled={loading}
          >
            <Text style={s.buttonText}>{loading ? 'Creating account…' : 'Create account'}</Text>
          </Pressable>

          <View style={s.footerRow}>
            <Text style={s.footerText}>Already have an account? </Text>
            <Link href="/login" style={s.brandLink}>Sign in</Link>
          </View>
        </View>
        <Text style={s.pageFooter}>© SoccerShares 2010 – 2026</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: {
    flexGrow: 1,
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
  title: { fontSize: 22, fontWeight: '700', color: theme.colors.text, textAlign: 'center' },
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
  passwordWrap: { position: 'relative' },
  eyeBtn: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
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
    marginTop: 4,
  },
  buttonPressed: { backgroundColor: theme.colors.primaryDark },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { fontSize: 14, color: theme.colors.textSecondary },
  brandLink: { fontSize: 14, fontWeight: '600', color: theme.colors.primary },
  pageFooter: { color: theme.colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 8 },
})
