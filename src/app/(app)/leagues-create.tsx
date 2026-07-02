import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/auth-context'
import { router } from 'expo-router'
import { useState } from 'react'
import {
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

const VALID_NAME = /^[a-zA-Z0-9 '\-&.!]+$/

function ChevronLeftIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={2}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </Svg>
  )
}

function validateName(value: string): string | null {
  if (!value.trim()) return null
  if (!VALID_NAME.test(value)) return "Only letters, numbers, spaces and ' - & . ! are allowed."
  if (value.trim().length < 2) return 'Name must be at least 2 characters.'
  if (value.trim().length > 40) return 'Name must be 40 characters or fewer.'
  return null
}

export default function CreateLeague() {
  const { session } = useSession()
  const userId = session?.user?.id ?? ''

  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleBlur() {
    const trimmed = name.trim()
    if (!trimmed) return
    const err = validateName(trimmed)
    if (err) { setNameError(err); return }
    const { data } = await supabase.from('leagues').select('id').eq('name', trimmed).maybeSingle()
    if (data) setNameError('This league name is already taken.')
  }

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) return
    const err = validateName(trimmed)
    if (err) { setNameError(err); return }
    if (nameError) return

    setSaving(true)
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    const shortId = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    const { data: league, error } = await supabase
      .from('leagues')
      .insert({ name: trimmed, created_by: userId, short_id: shortId })
      .select('id, short_id')
      .single()
    if (error) { setSaving(false); setNameError(error.message); return }
    await supabase.from('league_members').insert({ league_id: league.id, user_id: userId })
    setSaving(false)
    router.navigate('/leagues')
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#f9fafb' }}
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
      >
        {/* Page header */}
        <View style={s.topRow}>
          <Pressable onPress={() => router.navigate('/leagues')} style={s.backBtn} hitSlop={8}>
            <ChevronLeftIcon />
            <Text style={s.backText}>Leagues</Text>
          </Pressable>
          <Text style={s.pageTitle}>Create League</Text>
        </View>

        {/* Form card */}
        <View style={s.card}>
          <View style={s.field}>
            <Text style={s.label}>League name</Text>
            <TextInput
              value={name}
              onChangeText={v => { setName(v); setNameError(validateName(v)) }}
              onBlur={handleBlur}
              placeholder="e.g. Office Champions"
              placeholderTextColor="#9ca3af"
              autoFocus
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              style={[s.input, nameError ? s.inputError : null]}
            />
            {nameError && <Text style={s.errorText}>{nameError}</Text>}
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={saving || !name.trim() || !!nameError}
            style={[s.button, (saving || !name.trim() || !!nameError) && { opacity: 0.5 }]}
          >
            <Text style={s.buttonText}>{saving ? 'Creating…' : 'Create League'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 16, paddingBottom: 40 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 13, color: '#6b7280' },
  pageTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: '#374151' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2937',
    backgroundColor: '#fff',
  },
  inputError: { borderColor: '#fca5a5' },
  errorText: { fontSize: 12, color: '#dc2626' },
  button: {
    backgroundColor: '#4a7c3f',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
})
