import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/auth-context'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { FlagImage } from '@/components/FlagImage'

// ─── Types ───────────────────────────────────────────────────────────────────

type LeagueRef = { id: string; shortId: string; name: string }
type PendingInvite = { id: string; leagueName: string; token: string }
type LeaderEntry = { id: string; name: string; value: number; delta: number | null; createdAt: string }
type PredictionEntry = { id: string; name: string; income: number; delta: number | null }
type SharesEntry = { id: string; name: string; investmentPnl: number; delta: number | null }
type CommentRow = { id: string; content: string; created_at: string; author: string; userId: string }

type LeagueData = {
  leagueId: string
  leagueName: string
  leagueCreatedBy: string
  isMember: boolean
  leaders: LeaderEntry[]
  surrounding?: LeaderEntry[]
  predictionLeaders?: PredictionEntry[]
  sharesLeaders?: SharesEntry[]
  hasRecalc: boolean
  lastRecalcAt: string | null
  comments: CommentRow[]
}

// ─── User popup ──────────────────────────────────────────────────────────────

const STAGE_ABBR: Record<string, string> = {
  group: 'GS', round_of_32: 'R32', round_of_16: 'R16',
  quarterfinal: 'QF', semifinal: 'SF', third_place: '3rd', final: 'F',
}

const KNOCKOUT_NEXT_STAGE: Record<string, string> = {
  round_of_32: 'round_of_16', round_of_16: 'quarterfinal',
  quarterfinal: 'semifinal', semifinal: 'final', final: 'winner',
}

type UserPopupMatch = {
  matchId: string
  matchDate: string
  stage: string
  homeTeam: { id: string; name: string; code: string } | null
  awayTeam: { id: string; name: string; code: string } | null
  predictionLabel: string | null
  sharesHome: number
  sharesAway: number
}

type UserPopupHolding = { countryId: string; name: string; code: string; shares: number }

type UserPopupData = {
  name: string
  totalValue: number
  cumulativePredictionIncome: number
  investmentPnl: number
  holdings: UserPopupHolding[]
  upcomingMatches: UserPopupMatch[]
}

async function fetchUserPopup(targetUserId: string): Promise<UserPopupData | null> {
  const now = new Date().toISOString()

  const [userRes, holdingsRes, lastRecalcRes] = await Promise.all([
    supabase.from('users').select('display_name, balance').eq('id', targetUserId).single(),
    supabase.from('holdings').select('country_id, shares, countries(name, code, current_price)').eq('user_id', targetUserId),
    supabase.from('recalculations').select('id, recalc_timestamp').order('recalc_timestamp', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (!userRes.data) return null

  const latestRecalcId = (lastRecalcRes.data as any)?.id ?? null
  const since = (lastRecalcRes.data as any)?.recalc_timestamp ?? now

  const [snapshotRes, upcomingRes] = await Promise.all([
    latestRecalcId
      ? supabase.from('recalculation_user_snapshots')
          .select('cumulative_prediction_income, investment_pnl')
          .eq('recalculation_id', latestRecalcId)
          .eq('user_id', targetUserId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('matches')
      .select('id, match_date, stage, home_country_id, away_country_id, home:home_country_id(id,name,code), away:away_country_id(id,name,code)')
      .gte('match_date', since)
      .order('match_date')
      .limit(20),
  ])

  const holdings = (holdingsRes.data ?? []) as any[]
  const holdingsMap = new Map(holdings.map((h: any) => [h.country_id, h.shares]))

  const balance = Number((userRes.data as any).balance)
  const portfolioValue = holdings.reduce((sum: number, h: any) => sum + h.shares * (h.countries?.current_price ?? 0), 0)

  const allUpcoming = (upcomingRes.data ?? []) as any[]
  const toMatchDay = (iso: string) => new Date(new Date(iso).getTime() - 8 * 3600_000).toISOString().slice(0, 10)
  const nextDayStr = allUpcoming[0] ? toMatchDay(allUpcoming[0].match_date) : null
  const dayMatches = nextDayStr ? allUpcoming.filter((m: any) => toMatchDay(m.match_date) === nextDayStr) : []

  const groupMatchIds = dayMatches.filter((m: any) => m.stage === 'group').map((m: any) => m.id)
  const hasKnockout = dayMatches.some((m: any) => m.stage !== 'group')

  const [matchPredsRes, advPredsRes] = await Promise.all([
    groupMatchIds.length > 0
      ? supabase.from('match_predictions').select('match_id, predicted_winner_id').eq('user_id', targetUserId).in('match_id', groupMatchIds)
      : Promise.resolve({ data: [] }),
    hasKnockout
      ? supabase.from('advancement_predictions').select('country_id, stage').eq('user_id', targetUserId)
      : Promise.resolve({ data: [] }),
  ])

  const predByMatch = new Map((matchPredsRes.data ?? []).map((p: any) => [p.match_id, p.predicted_winner_id]))
  const advMap = new Map<string, Set<string>>()
  for (const p of (advPredsRes.data ?? []) as any[]) {
    if (!advMap.has(p.country_id)) advMap.set(p.country_id, new Set())
    advMap.get(p.country_id)!.add(p.stage)
  }

  const snapshot = snapshotRes.data as any

  const holdingsList: UserPopupHolding[] = holdings
    .filter((h: any) => h.shares > 0)
    .map((h: any) => ({
      countryId: h.country_id,
      name: h.countries?.name ?? '',
      code: h.countries?.code ?? '',
      shares: h.shares,
    }))
    .sort((a, b) => b.shares - a.shares)

  return {
    name: (userRes.data as any).display_name ?? 'Unknown',
    totalValue: balance + portfolioValue,
    cumulativePredictionIncome: Number(snapshot?.cumulative_prediction_income ?? 0),
    investmentPnl: Number(snapshot?.investment_pnl ?? 0),
    holdings: holdingsList,
    upcomingMatches: dayMatches.map((m: any) => {
      let predictionLabel: string | null = null
      if (m.stage === 'group') {
        if (predByMatch.has(m.id)) {
          const winnerId = predByMatch.get(m.id)
          if (winnerId === null) predictionLabel = 'draw'
          else if (winnerId === m.home_country_id) predictionLabel = `${m.home?.name ?? 'Home'} wins`
          else predictionLabel = `${m.away?.name ?? 'Away'} wins`
        }
      } else {
        const predStage = KNOCKOUT_NEXT_STAGE[m.stage] ?? m.stage
        const homePred = m.home_country_id ? advMap.get(m.home_country_id)?.has(predStage) : false
        const awayPred = m.away_country_id ? advMap.get(m.away_country_id)?.has(predStage) : false
        if (homePred && awayPred) predictionLabel = `${m.home?.name ?? 'Home'} & ${m.away?.name ?? 'Away'} to advance`
        else if (homePred) predictionLabel = `${m.home?.name ?? 'Home'} to advance`
        else if (awayPred) predictionLabel = `${m.away?.name ?? 'Away'} to advance`
        else predictionLabel = 'none to advance'
      }
      return {
        matchId: m.id,
        matchDate: m.match_date,
        stage: m.stage,
        homeTeam: m.home,
        awayTeam: m.away,
        predictionLabel,
        sharesHome: m.home_country_id ? (holdingsMap.get(m.home_country_id) ?? 0) : 0,
        sharesAway: m.away_country_id ? (holdingsMap.get(m.away_country_id) ?? 0) : 0,
      }
    }),
  }
}

function UserPopupModal({ userId, userName, onClose }: { userId: string | null; userName: string | null; onClose: () => void }) {
  const [data, setData] = useState<UserPopupData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!userId) { setData(null); return }
    setLoading(true)
    setData(null)
    fetchUserPopup(userId).then(result => {
      setData(result)
      setLoading(false)
    })
  }, [userId])

  if (!userId) return null

  const hasSentence = (m: UserPopupMatch) =>
    m.predictionLabel !== null || m.sharesHome > 0 || m.sharesAway > 0

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 }} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ backgroundColor: '#fff', borderRadius: 16, maxHeight: '80%', overflow: 'hidden' }}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#1f2937' }}>{userName}</Text>
              {data && (
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1f2937' }}>{fmt(data.totalValue)}</Text>
              )}
            </View>

            {loading ? (
              <View style={{ height: 80, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color="#4a7c3f" />
              </View>
            ) : data ? (
              <>
                {/* Stats grid */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#f3f4f6', padding: 10 }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b7280' }}>Predictions</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#1f2937', marginTop: 4 }}>{fmt(data.cumulativePredictionIncome)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#f3f4f6', padding: 10 }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b7280' }}>Shares</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: data.investmentPnl >= 0 ? '#16a34a' : '#dc2626', marginTop: 4 }}>
                      {data.investmentPnl >= 0 ? '+' : ''}{fmt(data.investmentPnl)}
                    </Text>
                  </View>
                </View>

                {/* Upcoming matches */}
                {data.upcomingMatches.length > 0 && (
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b7280' }}>Matches</Text>
                    <View style={{ borderRadius: 10, borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden', backgroundColor: '#fff' }}>
                      {data.upcomingMatches.map((m, idx) => {
                        const d = new Date(m.matchDate)
                        const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })
                        const timeStr = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
                        const sharesLine = [
                          m.sharesHome > 0 ? `${m.sharesHome}× ${m.homeTeam?.name ?? ''}` : null,
                          m.sharesAway > 0 ? `${m.sharesAway}× ${m.awayTeam?.name ?? ''}` : null,
                        ].filter(Boolean).join(' · ')
                        return (
                          <View key={m.matchId} style={{ borderBottomWidth: idx < data.upcomingMatches.length - 1 ? 1 : 0, borderBottomColor: '#f3f4f6', padding: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                              <Text style={{ fontSize: 10, fontWeight: '600', color: '#9ca3af' }}>{STAGE_ABBR[m.stage] ?? m.stage}</Text>
                              <Text style={{ fontSize: 10, fontWeight: '500', color: '#374151' }}>{dateStr}</Text>
                              <Text style={{ fontSize: 10, color: '#9ca3af' }}>{timeStr}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                {m.homeTeam && <FlagImage code={m.homeTeam.code} size={12} radius={2} />}
                                <Text style={{ fontSize: 12, fontWeight: '500', color: '#1f2937' }} numberOfLines={1}>{m.homeTeam?.name ?? '—'}</Text>
                              </View>
                              <Text style={{ fontSize: 10, fontWeight: '600', color: '#9ca3af', paddingHorizontal: 4 }}>vs</Text>
                              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                {m.awayTeam && <FlagImage code={m.awayTeam.code} size={12} radius={2} />}
                                <Text style={{ fontSize: 12, fontWeight: '500', color: '#1f2937' }} numberOfLines={1}>{m.awayTeam?.name ?? '—'}</Text>
                              </View>
                            </View>
                            {hasSentence(m) && (
                              <Text style={{ fontSize: 11, color: '#374151', textAlign: 'center', marginTop: 4 }}>
                                {m.predictionLabel ? `Prediction: ${m.predictionLabel}` : ''}
                                {m.predictionLabel && sharesLine ? ' / ' : ''}
                                {sharesLine ? `Shares: ${sharesLine}` : ''}
                              </Text>
                            )}
                          </View>
                        )
                      })}
                    </View>
                  </View>
                )}

                {data.upcomingMatches.length === 0 && (
                  <Text style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>No matches since last recalc</Text>
                )}
              </>
            ) : (
              <View style={{ height: 80, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: '#9ca3af' }}>No data available</Text>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 20 20" fill="#9ca3af">
      <Path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
    </Svg>
  )
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

function Leaderboard({ leaders, hasRecalc, currentUserId, marketOpen, onPressUser }: { leaders: LeaderEntry[]; hasRecalc: boolean; currentUserId: string; marketOpen: boolean; onPressUser: (id: string, name: string) => void }) {
  const podium = leaders.slice(0, 3)
  const rest = leaders.slice(3)

  const medal = (idx: number) => idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'

  const deltaText = (delta: number | null) => {
    if (delta === null) return null
    const abs = fmt(Math.abs(delta))
    const sign = delta > 0 ? '+' : delta < 0 ? '-' : ''
    const color = delta > 0 ? '#16a34a' : delta < 0 ? '#ef4444' : '#9ca3af'
    return <Text style={{ fontSize: 11, color, width: 60, textAlign: 'right' }}>{sign}{abs}</Text>
  }

  return (
    <View style={{ gap: 6 }}>
      {podium.map((u, idx) => (
        <View key={u.id} style={[s.card, u.id === currentUserId && s.selfHighlight]}>
          <Text style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{medal(idx)}</Text>
          <Pressable style={{ flex: 1 }} onPress={() => !marketOpen && onPressUser(u.id, u.name)}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1f2937' }} numberOfLines={1}>{u.name}</Text>
          </Pressable>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#1f2937', width: 80, textAlign: 'right' }}>{fmt(u.value)}</Text>
          {hasRecalc && deltaText(u.delta)}
        </View>
      ))}

      {rest.length > 0 && (
        <View style={s.listCard}>
          {rest.map((u, idx) => (
            <View key={u.id} style={[s.listRow, idx < rest.length - 1 && s.listRowBorder, u.id === currentUserId && s.selfHighlight]}>
              <Text style={{ fontSize: 12, color: '#9ca3af', width: 24, textAlign: 'center' }}>{idx + 4}</Text>
              <Pressable style={{ flex: 1 }} onPress={() => !marketOpen && onPressUser(u.id, u.name)}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#1f2937' }} numberOfLines={1}>{u.name}</Text>
              </Pressable>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1f2937', width: 80, textAlign: 'right' }}>{fmt(u.value)}</Text>
              {hasRecalc && deltaText(u.delta)}
            </View>
          ))}
        </View>
      )}

      {leaders.length === 0 && (
        <View style={[s.card, { justifyContent: 'center', flexDirection: 'column', gap: 4, paddingVertical: 24 }]}>
          <Text style={{ textAlign: 'center', fontWeight: '500', color: '#374151' }}>No members yet</Text>
          <Text style={{ textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>Invite people to join this league.</Text>
        </View>
      )}
    </View>
  )
}

// ─── Comment Item ─────────────────────────────────────────────────────────────

function CommentItem({
  comment,
  isOwn,
  onEdit,
}: {
  comment: CommentRow
  isOwn: boolean
  onEdit: (id: string, text: string) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(comment.content)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    const err = await onEdit(comment.id, editText)
    setSaving(false)
    if (err) { setError(err) } else { setEditing(false); setError(null) }
  }

  return (
    <View style={s.commentRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{comment.author}</Text>
        <Text style={{ fontSize: 11, color: '#9ca3af', flex: 1 }}>{fmtDate(comment.created_at)}</Text>
        {isOwn && !editing && (
          <Pressable onPress={() => { setEditing(true); setEditText(comment.content) }} hitSlop={8}>
            <PencilIcon />
          </Pressable>
        )}
      </View>

      {editing ? (
        <View style={{ gap: 6, marginTop: 4 }}>
          <TextInput
            value={editText}
            onChangeText={setEditText}
            autoFocus
            maxLength={500}
            style={s.commentInput}
            returnKeyType="done"
            onSubmitEditing={save}
          />
          {error && <Text style={{ fontSize: 11, color: '#dc2626' }}>{error}</Text>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={save} disabled={saving || !editText.trim()} style={[s.btnSmall, { opacity: saving || !editText.trim() ? 0.4 : 1 }]}>
              <Text style={s.btnSmallText}>{saving ? '…' : 'Save'}</Text>
            </Pressable>
            <Pressable onPress={() => { setEditing(false); setError(null) }}>
              <Text style={{ fontSize: 12, color: '#9ca3af', paddingVertical: 4 }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={{ fontSize: 13, color: '#1f2937', marginTop: 2 }}>{comment.content}</Text>
      )}
    </View>
  )
}

// ─── Overall Leaderboard (3-mode: overall / predictions / shares) ─────────────

type OverallMode = 'overall' | 'predictions' | 'shares'

function OverallLeaderboard({
  leaders, surrounding, predictionLeaders, sharesLeaders, hasRecalc, currentUserId, marketOpen, onPressUser,
}: {
  leaders: LeaderEntry[]
  surrounding?: LeaderEntry[]
  predictionLeaders?: PredictionEntry[]
  sharesLeaders?: SharesEntry[]
  hasRecalc: boolean
  currentUserId: string
  marketOpen: boolean
  onPressUser: (id: string, name: string) => void
}) {
  const [mode, setMode] = useState<OverallMode>('overall')
  const podium = leaders.slice(0, 3)
  const rest = leaders.slice(3, 10)

  const medal = (idx: number) => idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'

  const deltaEuro = (delta: number | null) => {
    if (delta === null) return null
    const sign = delta > 0 ? '+' : delta < 0 ? '-' : ''
    const color = delta > 0 ? '#16a34a' : delta < 0 ? '#ef4444' : '#9ca3af'
    return <Text style={{ fontSize: 11, color, width: 60, textAlign: 'right' }}>{sign}{fmt(Math.abs(delta))}</Text>
  }

  function renderRow(entry: LeaderEntry, rank: number) {
    const isSelf = entry.id === currentUserId
    return (
      <View key={entry.id} style={[s.listRow, { backgroundColor: isSelf ? '#f0fdf4' : '#fff' }]}>
        <Text style={{ fontSize: 12, color: '#9ca3af', width: 24, textAlign: 'center' }}>{rank}</Text>
        <Pressable style={{ flex: 1 }} onPress={() => !marketOpen && onPressUser(entry.id, entry.name)}>
          <Text style={{ fontSize: 13, fontWeight: isSelf ? '700' : '500', color: isSelf ? '#4a7c3f' : '#1f2937' }} numberOfLines={1}>{entry.name}</Text>
        </Pressable>
        <Text style={{ fontSize: 12, fontWeight: '700', color: isSelf ? '#4a7c3f' : '#1f2937', width: 80, textAlign: 'right' }}>{fmt(entry.value)}</Text>
        {hasRecalc && deltaEuro(entry.delta)}
      </View>
    )
  }

  function renderPredRow(entry: PredictionEntry, rank: number) {
    const isSelf = entry.id === currentUserId
    return (
      <View key={entry.id} style={[s.listRow, { backgroundColor: isSelf ? '#f0fdf4' : '#fff' }]}>
        <Text style={{ fontSize: 12, color: '#9ca3af', width: 24, textAlign: 'center' }}>{rank}</Text>
        <Pressable style={{ flex: 1 }} onPress={() => !marketOpen && onPressUser(entry.id, entry.name)}>
          <Text style={{ fontSize: 13, fontWeight: isSelf ? '700' : '500', color: isSelf ? '#4a7c3f' : '#1f2937' }} numberOfLines={1}>{entry.name}</Text>
        </Pressable>
        <Text style={{ fontSize: 12, fontWeight: '700', color: isSelf ? '#4a7c3f' : '#1f2937', width: 60, textAlign: 'right' }}>{entry.income}</Text>
        <Text style={{ fontSize: 11, color: entry.delta ? '#16a34a' : '#d1d5db', width: 56, textAlign: 'right' }}>{entry.delta ? `+${entry.delta}` : ''}</Text>
      </View>
    )
  }

  function renderSharesRow(entry: SharesEntry, rank: number) {
    const isSelf = entry.id === currentUserId
    const sign = entry.investmentPnl > 0 ? '+' : entry.investmentPnl < 0 ? '-' : ''
    return (
      <View key={entry.id} style={[s.listRow, { backgroundColor: isSelf ? '#f0fdf4' : '#fff' }]}>
        <Text style={{ fontSize: 12, color: '#9ca3af', width: 24, textAlign: 'center' }}>{rank}</Text>
        <Pressable style={{ flex: 1 }} onPress={() => !marketOpen && onPressUser(entry.id, entry.name)}>
          <Text style={{ fontSize: 13, fontWeight: isSelf ? '700' : '500', color: isSelf ? '#4a7c3f' : '#1f2937' }} numberOfLines={1}>{entry.name}</Text>
        </Pressable>
        <Text style={{ fontSize: 12, fontWeight: '700', color: isSelf ? '#4a7c3f' : '#1f2937', width: 80, textAlign: 'right' }}>{sign}{fmt(Math.abs(entry.investmentPnl))}</Text>
        {deltaEuro(entry.delta)}
      </View>
    )
  }

  const modeLabel: Record<OverallMode, string> = {
    overall: 'Overall leaderboard',
    predictions: 'Prediction leaderboard',
    shares: 'Shares leaderboard',
  }

  return (
    <View style={{ gap: 10 }}>
      {/* Dynamic header + mode switcher links */}
      <Text style={s.sectionHeader}>{modeLabel[mode]}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {(Object.keys(modeLabel) as OverallMode[]).filter(m => m !== mode).map(m => (
          <Pressable key={m} onPress={() => setMode(m)}>
            <Text style={{ fontSize: 12, color: '#4a7c3f', textDecorationLine: 'underline', fontWeight: '500' }}>{modeLabel[m]}</Text>
          </Pressable>
        ))}
      </View>

      {mode === 'overall' && (
        <>
          {/* Medal cards (top 3) */}
          <View style={{ gap: 6 }}>
            {podium.map((u, idx) => {
              const isSelf = u.id === currentUserId
              return (
                <View key={u.id} style={[s.card, isSelf && s.selfHighlight]}>
                  <Text style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{medal(idx)}</Text>
                  <Pressable style={{ flex: 1 }} onPress={() => !marketOpen && onPressUser(u.id, u.name)}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: isSelf ? '#4a7c3f' : '#1f2937' }} numberOfLines={1}>{u.name}</Text>
                  </Pressable>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: isSelf ? '#4a7c3f' : '#1f2937', width: 80, textAlign: 'right' }}>{fmt(u.value)}</Text>
                  {hasRecalc && deltaEuro(u.delta)}
                </View>
              )
            })}
          </View>

          {/* Positions 4–10 */}
          {rest.length > 0 && (
            <View style={s.listCard}>
              {rest.map((u, idx) => (
                <View key={u.id} style={[idx < rest.length - 1 && s.listRowBorder]}>
                  {renderRow(u, idx + 4)}
                </View>
              ))}
            </View>
          )}

          {/* ••• + surrounding (current user if rank > 10) */}
          {surrounding && surrounding.length > 0 && (
            <>
              <Text style={{ textAlign: 'center', color: '#d1d5db', fontSize: 14, letterSpacing: 4 }}>• • •</Text>
              <View style={s.listCard}>
                {surrounding.map((u, idx) => {
                  const rank = leaders.findIndex(e => e.id === u.id) + 1
                  return (
                    <View key={u.id} style={[idx < surrounding!.length - 1 && s.listRowBorder]}>
                      {renderRow(u, rank)}
                    </View>
                  )
                })}
              </View>
            </>
          )}
        </>
      )}

      {mode === 'predictions' && predictionLeaders && (
        <View style={s.listCard}>
          {predictionLeaders.map((e, idx) => (
            <View key={e.id} style={[idx < predictionLeaders.length - 1 && s.listRowBorder]}>
              {renderPredRow(e, idx + 1)}
            </View>
          ))}
        </View>
      )}

      {mode === 'shares' && sharesLeaders && (
        <View style={s.listCard}>
          {sharesLeaders.map((e, idx) => (
            <View key={e.id} style={[idx < sharesLeaders.length - 1 && s.listRowBorder]}>
              {renderSharesRow(e, idx + 1)}
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function Leagues() {
  const { session } = useSession()
  const userId = session?.user?.id ?? ''
  const userEmail = session?.user?.email ?? ''

  const [userLeagues, setUserLeagues] = useState<LeagueRef[]>([])
  const [selectedId, setSelectedId] = useState<string>('overall')
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [leagueData, setLeagueData] = useState<LeagueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [leagueLoading, setLeagueLoading] = useState(false)

  // Controls
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [renameSaving, setRenameSaving] = useState(false)

  // Invite
  const [showInvite, setShowInvite] = useState(false)
  const [invitePending, setInvitePending] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)

  // Comment
  const [commentText, setCommentText] = useState('')
  const [commentPosting, setCommentPosting] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)

  // Market status + user popup
  const [marketOpen, setMarketOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null)

  const isMounted = useRef(true)
  useEffect(() => () => { isMounted.current = false }, [])

  // ── Load user leagues + pending invites ──
  const fetchUserData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const [membershipsRes, invitesRes, marketRes] = await Promise.all([
      supabase.from('league_members')
        .select('league_id, joined_at, leagues(id, name, short_id)')
        .eq('user_id', userId)
        .order('joined_at', { ascending: true }),
      supabase.from('league_invites')
        .select('id, token, leagues(name)')
        .eq('invited_email', userEmail.toLowerCase())
        .eq('status', 'pending'),
      supabase.from('active_trading_window').select('*'),
    ])

    if (!isMounted.current) return

    setMarketOpen((marketRes.data ?? []).length > 0)

    const leagues = (membershipsRes.data ?? []).map((m: any) => {
      const l = m.leagues as { id: string; name: string; short_id: string } | null
      return { id: l?.id ?? m.league_id, shortId: l?.short_id ?? m.league_id, name: l?.name ?? '?' }
    })
    setUserLeagues(leagues)

    const invites = (invitesRes.data ?? []).map((i: any) => ({
      id: i.id,
      token: i.token as string,
      leagueName: (i.leagues as { name: string } | null)?.name ?? 'Unknown',
    }))
    setPendingInvites(invites)

    // Default selection: first league or overall
    const defaultId = invites.length === 0 && leagues.length > 0 ? leagues[0].shortId : 'overall'
    setSelectedId(prev => prev === 'overall' && leagues.length > 0 ? defaultId : prev)
    setLoading(false)
  }, [userId, userEmail])

  useFocusEffect(useCallback(() => { fetchUserData() }, [fetchUserData]))

  // ── Load selected league data ──
  const fetchLeagueData = useCallback(async (shortId: string) => {
    if (!userId) return
    setLeagueLoading(true)
    setLeagueData(null)

    if (shortId === 'overall') {
      // Overall: fetch all users + holdings live (same approach as website).
      // Snapshot table used only for delta/prediction/shares columns when available.
      const recalcRes = await supabase
        .from('recalculations').select('id, recalc_timestamp').order('recalc_timestamp', { ascending: false }).limit(2)

      if (!isMounted.current) return

      const recalcs = (recalcRes.data ?? []) as Array<{ id: string; recalc_timestamp: string }>
      const latestRecalcId = recalcs[0]?.id ?? null
      const prevRecalcId = recalcs[1]?.id ?? null

      const [allUsersRes, allHoldingsRes, latestSnapRes, prevSnapRes, commentsRes] = await Promise.all([
        supabase.from('users').select('id, display_name, balance, created_at'),
        supabase.from('holdings').select('user_id, shares, countries(current_price)'),
        latestRecalcId
          ? supabase.from('recalculation_user_snapshots')
              .select('user_id, total_value, cumulative_prediction_income, investment_pnl, prediction_income_this_recalc')
              .eq('recalculation_id', latestRecalcId)
          : Promise.resolve({ data: [] }),
        prevRecalcId
          ? supabase.from('recalculation_user_snapshots')
              .select('user_id, total_value')
              .eq('recalculation_id', prevRecalcId)
          : Promise.resolve({ data: [] }),
        supabase.from('overall_comments')
          .select('id, content, created_at, user_id, users(display_name)')
          .order('created_at', { ascending: false })
          .limit(30),
      ])

      if (!isMounted.current) return

      const holdingsByUser: Record<string, number> = {}
      for (const h of (allHoldingsRes.data ?? []) as any[]) {
        holdingsByUser[h.user_id] = (holdingsByUser[h.user_id] ?? 0) + h.shares * (h.countries?.current_price ?? 0)
      }

      const prevSnapMap = new Map((prevSnapRes.data ?? []).map((s: any) => [s.user_id, Number(s.total_value)]))
      const latestSnapMap = new Map((latestSnapRes.data ?? []).map((s: any) => [s.user_id, s as any]))

      // Build enriched entries from all users with live portfolio values
      type SnapEntry = {
        id: string; name: string; value: number; delta: number | null; createdAt: string
        income: number; incomeDelta: number | null; investmentPnl: number; sharesDelta: number | null
      }
      const snapEntries: SnapEntry[] = ((allUsersRes.data ?? []) as any[]).map((u: any) => {
        const uid = u.id
        const value = Number(u.balance) + (holdingsByUser[uid] ?? 0)
        const snap = latestSnapMap.get(uid)
        const latestTotal = snap !== undefined ? Number(snap.total_value ?? 0) : undefined
        const prev = prevSnapMap.get(uid)
        const totalDelta = latestTotal !== undefined && prev !== undefined ? latestTotal - prev : null
        const predictionThisRecalc = Number(snap?.prediction_income_this_recalc ?? 0)
        const sharesDelta = totalDelta !== null ? totalDelta - predictionThisRecalc : null
        return {
          id: uid,
          name: u.display_name ?? 'Unknown',
          value,
          delta: totalDelta,
          createdAt: u.created_at ?? '',
          income: Number(snap?.cumulative_prediction_income ?? 0),
          incomeDelta: predictionThisRecalc > 0 ? predictionThisRecalc : null,
          investmentPnl: Number(snap?.investment_pnl ?? 0),
          sharesDelta,
        }
      })

      const leaders: LeaderEntry[] = [...snapEntries]
        .sort((a, b) => b.value !== a.value ? b.value - a.value : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

      const userRankIdx = leaders.findIndex(e => e.id === userId)
      let surrounding: LeaderEntry[] | undefined
      if (userRankIdx >= 10) {
        const startIdx = Math.max(userRankIdx - 2, 10)
        const endIdx = Math.min(userRankIdx + 3, leaders.length)
        surrounding = leaders.slice(startIdx, endIdx)
      }

      const predictionLeaders: PredictionEntry[] = [...snapEntries]
        .sort((a, b) => b.income - a.income)
        .slice(0, 10)
        .map(e => ({ id: e.id, name: e.name, income: e.income, delta: e.incomeDelta }))

      const sharesLeaders: SharesEntry[] = [...snapEntries]
        .sort((a, b) => b.investmentPnl - a.investmentPnl)
        .slice(0, 10)
        .map(e => ({ id: e.id, name: e.name, investmentPnl: e.investmentPnl, delta: e.sharesDelta }))

      const comments: CommentRow[] = ((commentsRes.data ?? []) as any[]).map((c: any) => ({
        id: c.id, content: c.content, created_at: c.created_at,
        author: (c.users as any)?.display_name ?? 'Unknown', userId: c.user_id,
      }))

      setLeagueData({
        leagueId: 'overall', leagueName: 'Overall leaderboard', leagueCreatedBy: '',
        isMember: true, leaders, surrounding, predictionLeaders, sharesLeaders,
        hasRecalc: recalcs.length > 0, lastRecalcAt: recalcs[0]?.recalc_timestamp ?? null, comments,
      })
    } else {
      // Specific league
      const { data: league } = await supabase
        .from('leagues').select('id, name, short_id, created_by').eq('short_id', shortId).maybeSingle()
      if (!league || !isMounted.current) { setLeagueLoading(false); return }

      // Use FK join so the RLS traversal through league_members can reach users data
      const memberRes = await supabase
        .from('league_members')
        .select('user_id, joined_at, users(id, display_name, balance, created_at)')
        .eq('league_id', league.id)
      const memberRows = (memberRes.data ?? []) as any[]
      const memberIds = memberRows.map((m: any) => m.user_id)
      const isMember = memberIds.includes(userId)

      // Build user map from the FK join; fall back to direct users query for own data
      const userMapFromJoin: Record<string, { id: string; display_name: string; balance: number; created_at: string }> = {}
      for (const m of memberRows) {
        const u = m.users
        if (u) userMapFromJoin[u.id] = u
      }
      // If FK join didn't return other users (strict RLS), supplement with own user data
      if (!userMapFromJoin[userId]) {
        const { data: selfUser } = await supabase.from('users').select('id, display_name, balance, created_at').eq('id', userId).single()
        if (selfUser) userMapFromJoin[userId] = selfUser as any
      }

      const [recalcRes, commentsRes] = await Promise.all([
        supabase.from('recalculations').select('id, recalc_timestamp').order('recalc_timestamp', { ascending: false }).limit(2),
        isMember
          ? supabase.from('league_comments')
              .select('id, content, created_at, user_id, users(display_name)')
              .eq('league_id', league.id)
              .order('created_at', { ascending: false })
              .limit(30)
          : Promise.resolve({ data: [] }),
      ])

      if (!isMounted.current) return

      const recalcs = (recalcRes.data ?? []) as Array<{ id: string; recalc_timestamp: string }>
      const latestRecalcId = recalcs[0]?.id ?? null
      const prevRecalcId = recalcs[1]?.id ?? null

      const [latestSnapRes, prevSnapRes, allMemberHoldingsRes] = await Promise.all([
        latestRecalcId && memberIds.length > 0
          ? supabase.from('recalculation_user_snapshots').select('user_id, total_value').eq('recalculation_id', latestRecalcId).in('user_id', memberIds)
          : Promise.resolve({ data: [] }),
        prevRecalcId && memberIds.length > 0
          ? supabase.from('recalculation_user_snapshots').select('user_id, total_value').eq('recalculation_id', prevRecalcId).in('user_id', memberIds)
          : Promise.resolve({ data: [] }),
        memberIds.length > 0
          ? supabase.from('holdings').select('user_id, shares, countries(current_price)').in('user_id', memberIds)
          : Promise.resolve({ data: [] }),
      ])

      if (!isMounted.current) return

      const latestSnap = new Map((latestSnapRes.data ?? []).map((s: any) => [s.user_id, Number(s.total_value)]))
      const prevSnap = new Map((prevSnapRes.data ?? []).map((s: any) => [s.user_id, Number(s.total_value)]))

      const holdingsByMember: Record<string, number> = {}
      for (const h of (allMemberHoldingsRes.data ?? []) as any[]) {
        holdingsByMember[h.user_id] = (holdingsByMember[h.user_id] ?? 0) + h.shares * (h.countries?.current_price ?? 0)
      }

      const allMemberIds = memberIds.length > 0 ? memberIds : [userId]
      const leaders: LeaderEntry[] = allMemberIds
        .map((uid: string) => {
          const u = userMapFromJoin[uid]
          const name = u?.display_name ?? 'Unknown'
          const createdAt = u?.created_at ?? ''
          const value = Number(u?.balance ?? 0) + (holdingsByMember[uid] ?? 0)
          const latest = latestSnap.get(uid)
          const prev = prevSnap.get(uid)
          const delta = latest !== undefined && prev !== undefined ? latest - prev : null
          return { id: uid, name, value, delta, createdAt }
        })
        .sort((a, b) => b.value !== a.value ? b.value - a.value : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

      const comments: CommentRow[] = ((commentsRes.data ?? []) as any[]).map((c: any) => ({
        id: c.id, content: c.content, created_at: c.created_at,
        author: (c.users as any)?.display_name ?? 'Unknown', userId: c.user_id,
      }))

      setLeagueData({
        leagueId: league.id, leagueName: league.name, leagueCreatedBy: league.created_by,
        isMember, leaders, hasRecalc: recalcs.length > 0,
        lastRecalcAt: recalcs[0]?.recalc_timestamp ?? null, comments,
      })
    }

    setLeagueLoading(false)
  }, [userId])

  useEffect(() => {
    if (!loading) fetchLeagueData(selectedId)
  }, [selectedId, loading, fetchLeagueData])

  // ── Actions ──

  async function handleAcceptInvite(invite: PendingInvite) {
    const { data: inv } = await supabase.from('league_invites')
      .select('id, league_id, status').eq('id', invite.id).maybeSingle()
    if (!inv || inv.status !== 'pending') { Alert.alert('Error', 'Invite not found.'); return }
    const { error } = await supabase.from('league_members')
      .upsert({ league_id: inv.league_id, user_id: userId }, { onConflict: 'league_id,user_id', ignoreDuplicates: true })
    if (error) { Alert.alert('Error', error.message); return }
    await supabase.from('league_invites').update({ status: 'accepted' }).eq('id', inv.id)
    setPendingInvites(p => p.filter(i => i.id !== invite.id))
    await fetchUserData()
  }

  async function handleDeclineInvite(invite: PendingInvite) {
    await supabase.from('league_invites').update({ status: 'declined' }).eq('id', invite.id)
    setPendingInvites(p => p.filter(i => i.id !== invite.id))
  }

  async function handleCreateInvite() {
    if (!leagueData) return
    setInvitePending(true)
    const token = Math.random().toString(36).slice(2, 10)
    const { error } = await supabase.from('league_invites').insert({
      league_id: leagueData.leagueId,
      invited_email: null,
      invited_by: userId,
      token,
      status: 'pending',
    })
    setInvitePending(false)
    if (error) { Alert.alert('Error', error.message); return }
    const url = `https://www.soccershares.nl/leagues/invite/${token}`
    setShareUrl(url)
  }

  async function handleShareLink() {
    if (!shareUrl || !leagueData) return
    await Share.share({
      message: `You are invited to join SoccerShares league "${leagueData.leagueName}": ${shareUrl}`,
    })
  }

  async function handleRename() {
    if (!leagueData || !renameValue.trim()) return
    setRenameSaving(true)
    setRenameError(null)
    const trimmed = renameValue.trim()
    const { error } = await supabase.from('leagues')
      .update({ name: trimmed })
      .eq('id', leagueData.leagueId)
      .eq('created_by', userId)
    setRenameSaving(false)
    if (error) { setRenameError(error.message); return }
    setIsRenaming(false)
    setLeagueData(d => d ? { ...d, leagueName: trimmed } : d)
    setUserLeagues(ls => ls.map(l => l.id === leagueData.leagueId ? { ...l, name: trimmed } : l))
  }

  async function handleLeaveLeague() {
    if (!leagueData) return
    const { error } = await supabase.from('league_members')
      .delete().eq('league_id', leagueData.leagueId).eq('user_id', userId)
    if (error) { Alert.alert('Error', error.message); return }
    setUserLeagues(ls => ls.filter(l => l.id !== leagueData.leagueId))
    setSelectedId('overall')
    await fetchUserData()
  }

  async function handlePostComment() {
    if (!commentText.trim() || !leagueData) return
    setCommentPosting(true)
    setCommentError(null)
    const table = selectedId === 'overall' ? 'overall_comments' : 'league_comments'
    const payload: any = { content: commentText.trim(), user_id: userId }
    if (selectedId !== 'overall') payload.league_id = leagueData.leagueId

    const { data: newComment, error } = await supabase.from(table)
      .insert(payload).select('id, content, created_at, user_id, users(display_name)').single()
    setCommentPosting(false)
    if (error) { setCommentError(error.message); return }
    const c = newComment as any
    const row: CommentRow = {
      id: c.id, content: c.content, created_at: c.created_at,
      author: (c.users as any)?.display_name ?? 'Me', userId: c.user_id,
    }
    setCommentText('')
    Keyboard.dismiss()
    setLeagueData(d => d ? { ...d, comments: [row, ...d.comments] } : d)
  }

  async function handleEditComment(commentId: string, text: string): Promise<string | null> {
    const table = selectedId === 'overall' ? 'overall_comments' : 'league_comments'
    const { error } = await supabase.from(table).update({ content: text.trim() }).eq('id', commentId).eq('user_id', userId)
    if (error) return error.message
    setLeagueData(d => d ? { ...d, comments: d.comments.map(c => c.id === commentId ? { ...c, content: text.trim() } : c) } : d)
    return null
  }

  // ── Render ──

  const allTabs = [...userLeagues, { id: 'overall', shortId: 'overall', name: 'Overall leaderboard' }]
  const isOverall = selectedId === 'overall'
  const isCreator = !isOverall && leagueData?.leagueCreatedBy === userId
  const isMember = leagueData?.isMember ?? false

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' }}>
        <ActivityIndicator color="#4a7c3f" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <UserPopupModal
        userId={selectedUser?.id ?? null}
        userName={selectedUser?.name ?? null}
        onClose={() => setSelectedUser(null)}
      />
      <ScrollView style={{ flex: 1, backgroundColor: '#f9fafb' }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>

        {/* League switcher — dot-separated text links */}
        {allTabs.length > 1 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 }}>
            {allTabs.map((l, idx) => (
              <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {idx > 0 && <Text style={{ fontSize: 12, color: '#d1d5db' }}>•</Text>}
                <Pressable onPress={() => { setSelectedId(l.shortId); setIsRenaming(false); setShowInvite(false); setShareUrl(null) }}>
                  <Text style={{ fontSize: 12, fontWeight: l.shortId === selectedId ? '700' : '400', color: l.shortId === selectedId ? '#4b5563' : '#9ca3af' }}>
                    {l.name}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Pending invites */}
        {pendingInvites.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionHeader}>Pending invites</Text>
            {pendingInvites.map(inv => (
              <View key={inv.id} style={[s.card, { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }]}>
                <Text style={{ flex: 1, fontSize: 14, color: '#374151' }}>
                  Invited to <Text style={{ fontWeight: '600' }}>{inv.leagueName}</Text>
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => handleAcceptInvite(inv)} style={s.btnGreen}>
                    <Text style={s.btnGreenText}>Accept</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDeclineInvite(inv)} style={s.btnGhost}>
                    <Text style={s.btnGhostText}>Decline</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {leagueLoading ? (
          <ActivityIndicator color="#4a7c3f" style={{ marginTop: 32 }} />
        ) : leagueData ? (
          <>
            {/* League header */}
            <View style={s.section}>
              {isRenaming ? (
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TextInput
                      value={renameValue}
                      onChangeText={setRenameValue}
                      autoFocus
                      maxLength={40}
                      style={[s.commentInput, { flex: 1 }]}
                      returnKeyType="done"
                      onSubmitEditing={handleRename}
                    />
                    <Pressable onPress={handleRename} disabled={renameSaving || !renameValue.trim()} style={[s.btnSmall, { opacity: renameSaving || !renameValue.trim() ? 0.4 : 1 }]}>
                      <Text style={s.btnSmallText}>{renameSaving ? '…' : 'Save'}</Text>
                    </Pressable>
                    <Pressable onPress={() => { setIsRenaming(false); setRenameError(null) }}>
                      <Text style={{ fontSize: 12, color: '#9ca3af' }}>Cancel</Text>
                    </Pressable>
                  </View>
                  {renameError && <Text style={{ fontSize: 11, color: '#dc2626' }}>{renameError}</Text>}
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {!isOverall && <Text style={s.sectionHeader}>{leagueData.leagueName}</Text>}
                    {isCreator && !showInvite && (
                      <Pressable onPress={() => { setRenameValue(leagueData.leagueName); setIsRenaming(true) }} hitSlop={8}>
                        <PencilIcon />
                      </Pressable>
                    )}
                  </View>
                  {isMember && !isOverall && !showInvite && (
                    <Pressable onPress={() => { setShowInvite(true); setShareUrl(null) }} style={s.btnGreen}>
                      <Text style={s.btnGreenText}>Invite</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Invite panel */}
              {showInvite && (
                <View style={[s.inviteCard]}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>Invite to {leagueData.leagueName}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>Share with anyone via WhatsApp, email, etc.</Text>
                  {!shareUrl ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable onPress={handleCreateInvite} disabled={invitePending} style={[s.btnGreen, { opacity: invitePending ? 0.5 : 1 }]}>
                        <Text style={s.btnGreenText}>{invitePending ? 'Creating…' : 'Get shareable link'}</Text>
                      </Pressable>
                      <Pressable onPress={() => { setShowInvite(false); setShareUrl(null) }}>
                        <Text style={{ fontSize: 12, color: '#9ca3af', paddingVertical: 6 }}>Cancel</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      <View style={s.urlBox}>
                        <Text style={s.urlText} numberOfLines={1}>{shareUrl}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable onPress={handleShareLink} style={s.btnGreen}>
                          <Text style={s.btnGreenText}>Share</Text>
                        </Pressable>
                        <Pressable onPress={() => { setShowInvite(false); setShareUrl(null) }}>
                          <Text style={{ fontSize: 12, color: '#9ca3af', paddingVertical: 6 }}>Done</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Leaderboard */}
            {isOverall ? (
              <OverallLeaderboard
                leaders={leagueData.leaders}
                surrounding={leagueData.surrounding}
                predictionLeaders={leagueData.predictionLeaders}
                sharesLeaders={leagueData.sharesLeaders}
                hasRecalc={leagueData.hasRecalc}
                currentUserId={userId}
                marketOpen={marketOpen}
                onPressUser={(id, name) => setSelectedUser({ id, name })}
              />
            ) : (
              <Leaderboard leaders={leagueData.leaders} hasRecalc={leagueData.hasRecalc} currentUserId={userId} marketOpen={marketOpen} onPressUser={(id, name) => setSelectedUser({ id, name })} />
            )}

            {leagueData.lastRecalcAt && (
              <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right' }}>
                Last updated: {fmtDate(leagueData.lastRecalcAt)}
              </Text>
            )}

            {/* Leave / Create */}
            {isMember && !isOverall && (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Pressable onPress={handleLeaveLeague} style={s.btnDanger}>
                  <Text style={s.btnDangerText}>Leave League</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/leagues-create')} style={s.btnGreen}>
                  <Text style={s.btnGreenText}>Create League</Text>
                </Pressable>
              </View>
            )}

            {(!isMember && !isOverall && userLeagues.length === 0) || (isOverall && userLeagues.length === 0) ? (
              <Pressable onPress={() => router.push('/leagues-create')} style={[s.btnGreen, { alignSelf: 'flex-start' }]}>
                <Text style={s.btnGreenText}>Create League</Text>
              </Pressable>
            ) : null}

            {/* Comments */}
            {isMember && (
              <View style={s.section}>
                <Text style={s.sectionHeader}>Comments</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={commentText}
                    onChangeText={setCommentText}
                    placeholder="Write a comment…"
                    maxLength={500}
                    style={[s.commentInput, { flex: 1 }]}
                    returnKeyType="send"
                    onSubmitEditing={handlePostComment}
                  />
                  <Pressable onPress={handlePostComment} disabled={commentPosting || !commentText.trim()} style={[s.btnGreen, { opacity: commentPosting || !commentText.trim() ? 0.4 : 1 }]}>
                    <Text style={s.btnGreenText}>{commentPosting ? '…' : 'Post'}</Text>
                  </Pressable>
                </View>
                {commentError && <Text style={{ fontSize: 11, color: '#dc2626' }}>{commentError}</Text>}

                {leagueData.comments.length === 0 ? (
                  <Text style={{ fontSize: 13, color: '#9ca3af' }}>No comments yet. Be the first!</Text>
                ) : (
                  <View style={s.listCard}>
                    {leagueData.comments.map((c, idx) => (
                      <View key={c.id} style={[idx < leagueData.comments.length - 1 && s.listRowBorder]}>
                        <CommentItem comment={c} isOwn={c.userId === userId} onEdit={handleEditComment} />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        ) : (
          <Text style={{ textAlign: 'center', color: '#9ca3af', marginTop: 32 }}>No league data available.</Text>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  section: { gap: 8 },
  sectionHeader: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: '#374151' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#f3f4f6',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  selfHighlight: { backgroundColor: '#f0fdf4' },
  listCard: {
    backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: '#f3f4f6',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  btnGreen: { backgroundColor: '#4a7c3f', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  btnGreenText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  btnDanger: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#fca5a5' },
  btnDangerText: { fontSize: 12, fontWeight: '600', color: '#dc2626' },
  btnGhost: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#e5e7eb' },
  btnGhostText: { fontSize: 12, fontWeight: '500', color: '#6b7280' },
  btnSmall: { backgroundColor: '#4a7c3f', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  btnSmallText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  commentInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#1f2937', backgroundColor: '#fff' },
  commentRow: { paddingHorizontal: 12, paddingVertical: 10 },
  inviteCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 10, borderWidth: 1, borderColor: '#f3f4f6', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  urlBox: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f9fafb' },
  urlText: { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#374151' },
})
