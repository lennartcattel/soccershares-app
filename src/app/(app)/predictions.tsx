import Footer from '@/components/Footer'
import { theme } from '@/constants/theme'
import { useSession } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useEffect, useRef, useState } from 'react'
import { FlagImage } from '@/components/FlagImage'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

const KNOCKOUT_STAGES = [
  { key: 'round_of_32',  label: 'To Advance to Round of 32', grid: true  },
  { key: 'round_of_16',  label: 'To Advance to Round of 16', grid: true  },
  { key: 'quarterfinal', label: 'Quarter-finalists',          grid: true  },
  { key: 'semifinal',    label: 'Semi-finalists',             grid: false },
  { key: 'final',        label: 'Finalists',                  grid: false },
  { key: 'winner',       label: 'World Champion',             grid: false },
]

const NAV_ITEMS = [
  { key: 'group',        label: 'GS'  },
  { key: 'round_of_32', label: 'R32' },
  { key: 'round_of_16', label: 'R16' },
  { key: 'quarterfinal', label: 'QF' },
  { key: 'semifinal',   label: 'SF'  },
  { key: 'final',       label: 'F'   },
  { key: 'winner',      label: 'W'   },
]

type TeamRef = { id: string; name: string; code: string; group_name: string | null }
type MatchRow = {
  id: string
  match_date: string
  status: 'scheduled' | 'live' | 'completed'
  home_score: number | null
  away_score: number | null
  winner_id: string | null
  home: TeamRef | null
  away: TeamRef | null
}
type MatchPrediction = {
  match_id: string
  predicted_winner_id: string | null
  points_awarded: number
  is_correct: boolean | null
}
type AdvPick = {
  country_id: string
  stage: string
  is_correct: boolean | null
  points_awarded: number | null
  country_name: string
  country_code: string
}
type GroupStanding = {
  letter: string
  teams: { id: string; name: string; code: string; points: number }[]
}

const flagUrl = (code: string) =>
  `https://www.soccershares.nl/flags/${code.toLowerCase()}.svg`

function computeStandings(matches: MatchRow[], picks: Record<string, string>): GroupStanding[] {
  const pts: Record<string, number> = {}
  const teamMeta: Record<string, { name: string; code: string }> = {}
  const groupTeams: Record<string, Set<string>> = {}

  for (const m of matches) {
    const home = m.home
    const away = m.away
    if (!home || !away) continue
    const g = home.group_name ?? '?'
    if (!groupTeams[g]) groupTeams[g] = new Set()
    groupTeams[g].add(home.id)
    groupTeams[g].add(away.id)
    if (!(home.id in pts)) pts[home.id] = 0
    if (!(away.id in pts)) pts[away.id] = 0
    teamMeta[home.id] = { name: home.name, code: home.code }
    teamMeta[away.id] = { name: away.name, code: away.code }
    const pick = picks[m.id]
    if (!pick) continue
    if (pick === 'draw') { pts[home.id] += 1; pts[away.id] += 1 }
    else if (pick === home.id) pts[home.id] += 3
    else pts[away.id] += 3
  }

  return GROUPS
    .filter(g => groupTeams[g])
    .map(g => ({
      letter: g,
      teams: [...groupTeams[g]]
        .map(id => ({ id, points: pts[id] ?? 0, ...teamMeta[id] }))
        .sort((a, b) => b.points - a.points),
    }))
}

export default function Predictions() {
  const { session } = useSession()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [points, setPoints] = useState<Record<string, number | null>>({})
  const [advPicks, setAdvPicks] = useState<AdvPick[]>([])
  const [tournamentStarted, setTournamentStarted] = useState(true)
  const [r32Selected, setR32Selected] = useState<Set<string>>(new Set())
  const [r32ParticipantIds, setR32ParticipantIds] = useState<string[]>([])
  const [r32Saving, setR32Saving] = useState(false)

  const scrollRef = useRef<ScrollView>(null)
  const sectionY = useRef<Record<string, number>>({})

  async function fetchData() {
    try {
      const uid = session?.user?.id

      const [matchesRes, settingRes, predsRes, advRes, r32Res] = await Promise.all([
        supabase
          .from('matches')
          .select('id, match_date, status, home_score, away_score, winner_id, home:home_country_id(id, name, code, group_name), away:away_country_id(id, name, code)')
          .eq('stage', 'group')
          .order('match_date', { ascending: true }),
        supabase
          .from('game_settings')
          .select('value')
          .eq('key', 'tournament_started')
          .maybeSingle(),
        uid
          ? supabase.from('match_predictions')
              .select('match_id, predicted_winner_id, points_awarded, is_correct')
              .eq('user_id', uid)
          : Promise.resolve({ data: [] }),
        uid
          ? supabase.from('advancement_predictions')
              .select('country_id, stage, is_correct, points_awarded, countries(name, code)')
              .eq('user_id', uid)
          : Promise.resolve({ data: [] }),
        supabase
          .from('matches')
          .select('home_country_id, away_country_id')
          .eq('stage', 'round_of_32'),
      ])

      setMatches((matchesRes.data ?? []) as unknown as MatchRow[])

      const started = (settingRes.data as { value: number } | null)?.value === 1
      setTournamentStarted(started)

      const picksMap: Record<string, string> = {}
      const pointsMap: Record<string, number | null> = {}
      for (const p of (predsRes.data ?? []) as MatchPrediction[]) {
        picksMap[p.match_id] = p.predicted_winner_id ?? 'draw'
        pointsMap[p.match_id] = p.is_correct !== null ? p.points_awarded : null
      }
      setPicks(picksMap)
      setPoints(pointsMap)

      const adv: AdvPick[] = (advRes.data ?? []).map((a: any) => ({
        country_id: a.country_id,
        stage: a.stage,
        is_correct: a.is_correct ?? null,
        points_awarded: a.points_awarded ?? null,
        country_name: a.countries?.name ?? '',
        country_code: a.countries?.code ?? '',
      }))
      setAdvPicks(adv)

      const savedR32 = adv.filter(a => a.stage === 'round_of_32').map(a => a.country_id)
      if (savedR32.length === 32) setR32Selected(new Set(savedR32))

      const r32Rows = (r32Res.data ?? []) as { home_country_id: string; away_country_id: string }[]
      const r32Ids = r32Rows.flatMap(r => [r.home_country_id, r.away_country_id])
      setR32ParticipantIds(r32Ids)

    } catch (e) {
      console.error('Predictions fetch error', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { fetchData() }, [session])

  async function handlePick(matchId: string, value: string) {
    if (!session?.user?.id || tournamentStarted) return
    const prev = picks[matchId]
    if (prev === value) return
    setPicks(p => ({ ...p, [matchId]: value }))
    try {
      await supabase.from('match_predictions').upsert({
        user_id: session.user.id,
        match_id: matchId,
        predicted_winner_id: value === 'draw' ? null : value,
      }, { onConflict: 'user_id,match_id' })
    } catch {
      setPicks(p => ({ ...p, [matchId]: prev ?? '' }))
    }
  }

  async function handleR32Toggle(teamId: string) {
    if (!session?.user?.id) return
    const nowSelected = !r32Selected.has(teamId)
    if (nowSelected && r32Selected.size >= 32) return
    setR32Selected(prev => {
      const next = new Set(prev)
      nowSelected ? next.add(teamId) : next.delete(teamId)
      return next
    })
    setR32Saving(true)
    try {
      if (nowSelected) {
        await supabase.from('advancement_predictions').upsert(
          { user_id: session.user.id, country_id: teamId, stage: 'round_of_32' },
          { onConflict: 'user_id,country_id,stage' }
        )
      } else {
        await supabase.from('advancement_predictions').delete()
          .eq('user_id', session.user.id).eq('country_id', teamId).eq('stage', 'round_of_32')
      }
    } catch (e) {
      console.error('R32 toggle error', e)
    } finally {
      setR32Saving(false)
    }
  }

  function scrollTo(key: string) {
    const y = sectionY.current[key]
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true })
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  // Group matches by group letter
  const byGroup = new Map<string, MatchRow[]>()
  for (const m of matches) {
    const g = (m.home as any)?.group_name ?? '?'
    if (!byGroup.has(g)) byGroup.set(g, [])
    byGroup.get(g)!.push(m)
  }

  // Group advancement picks by stage
  const advByStage = new Map<string, AdvPick[]>()
  for (const p of advPicks) {
    if (!advByStage.has(p.stage)) advByStage.set(p.stage, [])
    advByStage.get(p.stage)!.push(p)
  }

  const r32Set = new Set(r32ParticipantIds)
  const isGsEliminated = (id: string) => r32ParticipantIds.length > 0 && !r32Set.has(id)

  // Pre-tournament: group standings from picks
  const allGroupPicksDone = matches.length > 0 && matches.every(m => m.id in picks)
  const groupStandings = allGroupPicksDone ? computeStandings(matches, picks) : []
  const p3SelectedCount = Math.max(0, r32Selected.size - 24)

  const predicted = Object.keys(picks).length

  return (
    <View style={{ flex: 1 }}>
      {/* Sticky navigation row */}
      <View style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, flexDirection: 'row' }}>
          {NAV_ITEMS.map(item => (
            <Pressable
              key={item.key}
              onPress={() => scrollTo(item.key)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#374151' }}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1 bg-gray-50"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} />}
      >
      <View className="flex flex-col gap-4 p-4">

        {/* ── Group stage ─────────────────────────────────── */}
        <View
          onLayout={e => { sectionY.current['group'] = e.nativeEvent.layout.y }}
          className="flex flex-col gap-4"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text className="text-sm font-semibold uppercase tracking-wide text-gray-700">Group Stage Predictions</Text>
            {!tournamentStarted && (
              <Text style={{ fontSize: 12, color: '#9ca3af' }}>{predicted} / {matches.length}</Text>
            )}
          </View>

          {GROUPS.map(g => {
            const gMatches = byGroup.get(g)
            if (!gMatches) return null
            return (
              <View key={g} className="flex flex-col gap-2">
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>Group {g}</Text>
                <View style={{ overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
                  {gMatches.map((m, i) => {
                    const home = m.home
                    const away = m.away
                    const dt = new Date(m.match_date)
                    const day = dt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
                    const time = dt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
                    const pick = picks[m.id] ?? ''
                    const isCompleted = m.status === 'completed'
                    const isLive = m.status === 'live'
                    const hasScore = isCompleted && m.home_score !== null
                    const isLocked = tournamentStarted || isLive || isCompleted
                    const matchPtVal = points[m.id]

                    const predictionLabel = pick === 'draw' ? 'Draw'
                      : pick === home?.id ? home?.code
                      : pick === away?.id ? away?.code
                      : null

                    return (
                      <View
                        key={m.id}
                        style={{ borderBottomWidth: i < gMatches.length - 1 ? 1 : 0, borderBottomColor: '#f9fafb', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, gap: 6 }}
                      >
                        {/* Date */}
                        <View style={{ width: 38 }}>
                          <Text style={{ fontSize: 9.5, fontWeight: '500', color: '#374151', lineHeight: 13 }}>{day}</Text>
                          <Text style={{ fontSize: 9.5, color: '#9ca3af', lineHeight: 13 }}>{time}</Text>
                        </View>

                        {/* Teams */}
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                          {/* Home */}
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                            <Text style={{ fontSize: 12, fontWeight: '500', color: '#1f2937', flexShrink: 1 }} numberOfLines={1}>{home?.name}</Text>
                            {home?.code ? <FlagImage code={home.code} size={11} radius={1} /> : null}
                          </View>
                          {/* Score / vs */}
                          <Text style={{ fontSize: 11, fontWeight: isLive ? '700' : '500', color: isLive ? '#dc2626' : hasScore ? '#1f2937' : '#6b7280', width: 36, textAlign: 'center' }}>
                            {hasScore ? `${m.home_score}–${m.away_score}` : isLive ? 'LIVE' : 'vs'}
                          </Text>
                          {/* Away */}
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            {away?.code ? <FlagImage code={away.code} size={11} radius={1} /> : null}
                            <Text style={{ fontSize: 12, fontWeight: '500', color: '#1f2937', flexShrink: 1 }} numberOfLines={1}>{away?.name}</Text>
                          </View>
                        </View>

                        {/* Pick / Points */}
                        {isCompleted ? (
                          <View style={{ width: 44, alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 9.5, color: '#1f2937' }}>{predictionLabel ?? '—'}</Text>
                            {matchPtVal !== null && matchPtVal !== undefined && (
                              <Text style={{ fontSize: 11, fontWeight: '500', color: matchPtVal === 0 ? '#9ca3af' : '#374151' }}>{matchPtVal} pts</Text>
                            )}
                          </View>
                        ) : isLocked ? (
                          <View style={{ width: 44, alignItems: 'flex-end' }}>
                            {predictionLabel
                              ? <Text style={{ fontSize: 11, fontWeight: '600', color: '#374151' }}>{predictionLabel}</Text>
                              : <Text style={{ fontSize: 11, color: '#d1d5db' }}>—</Text>
                            }
                          </View>
                        ) : (
                          // Interactive pick buttons (pre-tournament only)
                          <View style={{ flexDirection: 'row', gap: 3 }}>
                            {[
                              { value: home?.id ?? '', label: home?.code ?? '?' },
                              { value: 'draw', label: 'D' },
                              { value: away?.id ?? '', label: away?.code ?? '?' },
                            ].map(opt => {
                              const active = pick === opt.value
                              return (
                                <Pressable
                                  key={opt.value}
                                  onPress={() => handlePick(m.id, opt.value)}
                                  style={{
                                    paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6,
                                    backgroundColor: active ? '#4a7c3f' : '#f3f4f6',
                                    borderWidth: 1, borderColor: active ? '#3a6b2f' : '#e5e7eb',
                                  }}
                                >
                                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: active ? '#fff' : '#374151' }}>{opt.label}</Text>
                                </Pressable>
                              )
                            })}
                          </View>
                        )}
                      </View>
                    )
                  })}
                </View>
              </View>
            )
          })}
        </View>

        {/* ── Knockout stages ──────────────────────────────── */}
        {tournamentStarted ? (
          // Read-only lists of advancement picks
          KNOCKOUT_STAGES.map(stage => {
            const stagePicks = advByStage.get(stage.key)
            if (!stagePicks || stagePicks.length === 0) return null
            const sorted = [...stagePicks].sort((a, b) => a.country_name.localeCompare(b.country_name))

            return (
              <View
                key={stage.key}
                onLayout={e => { sectionY.current[stage.key] = e.nativeEvent.layout.y }}
                className="flex flex-col gap-1.5"
              >
                <Text className="text-sm font-semibold uppercase tracking-wide text-gray-700">{stage.label}</Text>

                {stage.grid ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[sorted.slice(0, Math.ceil(sorted.length / 2)), sorted.slice(Math.ceil(sorted.length / 2))].map((col, ci) => (
                      <View key={ci} style={{ flex: 1, overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
                        {col.map((p, i) => {
                          const gsElim = isGsEliminated(p.country_id)
                          const wrong = p.is_correct === false || (p.is_correct === null && gsElim)
                          const scored = p.is_correct !== null || (p.is_correct === null && gsElim)
                          return (
                            <View key={p.country_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: i < col.length - 1 ? 1 : 0, borderBottomColor: '#f9fafb' }}>
                              <FlagImage code={p.country_code} size={12} radius={1} />
                              <Text style={{ flex: 1, fontSize: 12, fontWeight: '500', color: '#1f2937' }} numberOfLines={1}>{p.country_name}</Text>
                              {scored && (
                                <Text style={{ fontSize: 11, fontWeight: '500', color: wrong ? '#9ca3af' : '#374151' }}>
                                  {wrong ? '0' : p.points_awarded} pts
                                </Text>
                              )}
                            </View>
                          )
                        })}
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
                    {sorted.map((p, i) => {
                      const gsElim = isGsEliminated(p.country_id)
                      const wrong = p.is_correct === false || (p.is_correct === null && gsElim)
                      const scored = p.is_correct !== null || (p.is_correct === null && gsElim)
                      return (
                        <View key={p.country_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: i < sorted.length - 1 ? 1 : 0, borderBottomColor: '#f9fafb' }}>
                          <FlagImage code={p.country_code} size={14} radius={2} />
                          <Text style={{ flex: 1, fontSize: 12, fontWeight: '500', color: '#1f2937' }}>{p.country_name}</Text>
                          {scored && (
                            <Text style={{ fontSize: 11, fontWeight: '500', color: wrong ? '#9ca3af' : '#374151' }}>
                              {wrong ? '0' : p.points_awarded} pts
                            </Text>
                          )}
                        </View>
                      )
                    })}
                  </View>
                )}
              </View>
            )
          })
        ) : (
          // Pre-tournament: R32 P3 selection after all group picks done
          <>
            {!allGroupPicksDone && (
              <View style={{ borderRadius: 12, borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb', padding: 14 }}>
                <Text style={{ fontSize: 13, color: '#92400e' }}>
                  Complete all {matches.length} group stage match predictions above ({predicted}/{matches.length} done) to unlock your Round of 32 picks.
                </Text>
              </View>
            )}

            {allGroupPicksDone && (
              <View
                onLayout={e => { sectionY.current['round_of_32'] = e.nativeEvent.layout.y }}
                className="flex flex-col gap-3"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text className="text-sm font-semibold uppercase tracking-wide text-gray-700">To Advance to Round of 32</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {r32Saving && <Text style={{ fontSize: 11, color: '#9ca3af' }}>Saving…</Text>}
                    <Text style={{ fontSize: 12, fontWeight: '700', color: r32Selected.size === 32 ? '#16a34a' : '#9ca3af' }}>
                      {r32Selected.size} / 32
                    </Text>
                  </View>
                </View>

                <View style={{ borderRadius: 12, borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb', padding: 14 }}>
                  <Text style={{ fontSize: 12, color: '#92400e' }}>
                    The top 2 of each group advance automatically. Select 8 best 3rd-placed teams to join them in the Round of 32.
                  </Text>
                </View>

                {groupStandings.map(group => (
                  <View key={group.letter} style={{ overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
                    <View style={{ borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#f9fafb', paddingHorizontal: 12, paddingVertical: 6 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Group {group.letter}</Text>
                    </View>
                    {group.teams.map((team, i) => {
                      const isAutoAdvance = i < 2
                      const isP3 = i === 2
                      const isSelected = r32Selected.has(team.id)
                      return (
                        <View key={team.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: i < group.teams.length - 1 ? 1 : 0, borderBottomColor: '#f9fafb' }}>
                          <Text style={{ width: 16, fontSize: 11, fontWeight: '600', color: '#9ca3af', textAlign: 'center' }}>{i + 1}</Text>
                          <FlagImage code={team.code} size={13} radius={1} />
                          <Text style={{ flex: 1, fontSize: 12, fontWeight: '500', color: '#1f2937' }} numberOfLines={1}>{team.name}</Text>
                          <Text style={{ fontSize: 11, color: '#9ca3af', marginRight: 4 }}>{team.points} pts</Text>
                          {isAutoAdvance ? (
                            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#d1d5db', borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 12, color: '#fff', fontWeight: '700' }}>✓</Text>
                            </View>
                          ) : isP3 ? (
                            <Pressable
                              onPress={() => handleR32Toggle(team.id)}
                              style={{
                                width: 24, height: 24, borderRadius: 12, borderWidth: 2,
                                borderColor: isSelected ? '#16a34a' : '#d1d5db',
                                backgroundColor: isSelected ? '#16a34a' : '#fff',
                                alignItems: 'center', justifyContent: 'center',
                              }}
                            >
                              {isSelected && <Text style={{ fontSize: 12, color: '#fff', fontWeight: '700' }}>✓</Text>}
                            </Pressable>
                          ) : (
                            <View style={{ width: 24, height: 24 }} />
                          )}
                        </View>
                      )
                    })}
                  </View>
                ))}

                <View style={{
                  borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  borderColor: p3SelectedCount === 8 ? '#f3f4f6' : '#fecaca',
                  backgroundColor: p3SelectedCount === 8 ? '#fff' : '#fef2f2',
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: p3SelectedCount === 8 ? '#374151' : '#b91c1c' }}>
                    3rd-place teams selected
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: p3SelectedCount === 8 ? '#16a34a' : '#b91c1c' }}>
                    {p3SelectedCount} / 8
                  </Text>
                </View>

                {r32Selected.size === 32 && (
                  <View style={{ borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#fff', padding: 14 }}>
                    <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                      Knockout bracket picks are available on the website (soccershares.nl/predictions).
                    </Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}

        <Footer />
      </View>
      </ScrollView>
    </View>
  )
}
