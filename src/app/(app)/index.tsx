import Footer from '@/components/Footer'
import MarketStatus from '@/components/MarketStatus'
import PortfolioBanner from '@/components/PortfolioBanner'
import PriceModal, { type ModalCountry } from '@/components/PriceModal'
import { theme } from '@/constants/theme'
import { useSession } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { FlagImage } from '@/components/FlagImage'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'

type Country = {
  id: string
  name: string
  code: string
  flag_emoji: string
  group_name: string
  current_price: number
  change_pct: number
}

type UserData = {
  balance: number
  shares_value: number
  investment_pnl: number
  prediction_income: number
}

type UpcomingMatch = {
  id: string
  match_date: string
  stage: string
  home_country_id: string | null
  away_country_id: string | null
  bracket_label: string | null
}

const STAGE_ABBR: Record<string, string> = {
  round_of_32: 'R32', round_of_16: 'R16', quarterfinal: 'QF',
  semifinal: 'SF', third_place: '3rd', final: 'F',
}
const KNOCKOUT_NEXT: Record<string, string> = {
  round_of_32: 'round_of_16', round_of_16: 'quarterfinal',
  quarterfinal: 'semifinal', semifinal: 'final', final: 'winner',
}

export default function Home() {
  const { session } = useSession()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [marketOpen, setMarketOpen] = useState(false)
  const [marketUpdated, setMarketUpdated] = useState<string | null>(null)
  const [countries, setCountries] = useState<Country[]>([])
  const [userData, setUserData] = useState<UserData | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingMatch[]>([])
  const [matchPredictions, setMatchPredictions] = useState<Record<string, string | null>>({})
  const [advancementPredictions, setAdvancementPredictions] = useState<Record<string, Set<string>>>({})
  const [holdingsMap, setHoldingsMap] = useState<Record<string, number>>({})
  const [modalCountry, setModalCountry] = useState<ModalCountry | null>(null)

  async function fetchData() {
    try {
      const { data: windows } = await supabase.from('active_trading_window').select('*').limit(1)
      setMarketOpen((windows?.length ?? 0) > 0)

      const { data: countriesData } = await supabase
        .from('countries')
        .select('id, name, code, flag_emoji, group_name, current_price')
        .order('current_price', { ascending: false })

      const { data: priceHistory } = await supabase
        .from('price_history')
        .select('country_id, price, recorded_at')
        .order('recorded_at', { ascending: false })

      const prevPriceMap: Record<string, number> = {}
      const seenOnce = new Set<string>()
      for (const row of priceHistory ?? []) {
        if (!seenOnce.has(row.country_id)) {
          seenOnce.add(row.country_id)
        } else if (!prevPriceMap[row.country_id]) {
          prevPriceMap[row.country_id] = row.price
        }
      }

      const enriched: Country[] = (countriesData ?? []).map(c => {
        const prev = prevPriceMap[c.id] ?? 0
        return { ...c, change_pct: prev > 0 ? (c.current_price - prev) / prev * 100 : 0 }
      })
      setCountries(enriched)

      const latestUpdate = priceHistory?.[0]?.recorded_at
      setMarketUpdated(latestUpdate ? new Date(latestUpdate).toLocaleString('nl-NL', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      }) : null)

      // Upcoming matches
      const { data: lastRecalc } = await supabase
        .from('recalculations')
        .select('recalc_timestamp')
        .order('recalc_timestamp', { ascending: false })
        .limit(1)
        .maybeSingle()
      const since = (lastRecalc as any)?.recalc_timestamp ?? new Date().toISOString()

      const { data: matchesData } = await supabase
        .from('matches')
        .select('id, bracket_label, stage, match_date, home_country_id, away_country_id')
        .not('home_country_id', 'is', null)
        .not('away_country_id', 'is', null)
        .gte('match_date', since)
        .order('match_date', { ascending: true })
        .limit(8)
      setUpcomingMatches((matchesData ?? []) as UpcomingMatch[])

      if (session?.user?.id) {
        const [userResult, holdingsResult, transactionsResult, snapshotResult] = await Promise.all([
          supabase.from('users').select('balance').eq('id', session.user.id).single(),
          supabase.from('holdings').select('country_id, shares').eq('user_id', session.user.id),
          supabase.from('transactions').select('type, total_amount').eq('user_id', session.user.id),
          supabase
            .from('recalculation_user_snapshots')
            .select('cumulative_prediction_income')
            .eq('user_id', session.user.id)
            .order('recalc_timestamp', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])

        const holdMap: Record<string, number> = {}
        let sharesValue = 0
        for (const h of holdingsResult.data ?? []) {
          holdMap[h.country_id] = h.shares
          const c = (countriesData ?? []).find(c => c.id === h.country_id)
          if (c) sharesValue += h.shares * c.current_price
        }
        setHoldingsMap(holdMap)

        const txRows = (transactionsResult.data ?? []) as Array<{ type: string; total_amount: number }>
        const netInvested = txRows.reduce(
          (sum, t) => sum + (t.type === 'buy' ? Number(t.total_amount) : -Number(t.total_amount)), 0
        )

        setUserData({
          balance: userResult.data?.balance ?? 0,
          shares_value: sharesValue,
          investment_pnl: sharesValue - netInvested,
          prediction_income: snapshotResult.data?.cumulative_prediction_income ?? 0,
        })

        const [{ data: matchPreds }, { data: advPreds }] = await Promise.all([
          supabase.from('match_predictions').select('match_id, predicted_winner_id').eq('user_id', session.user.id),
          supabase.from('advancement_predictions').select('country_id, stage').eq('user_id', session.user.id),
        ])

        const predMap: Record<string, string | null> = {}
        for (const p of matchPreds ?? []) predMap[p.match_id] = p.predicted_winner_id
        setMatchPredictions(predMap)

        const advMap: Record<string, Set<string>> = {}
        for (const p of advPreds ?? []) {
          if (!advMap[p.country_id]) advMap[p.country_id] = new Set()
          advMap[p.country_id].add(p.stage)
        }
        setAdvancementPredictions(advMap)
      }
    } catch (e) {
      console.error('Home fetch error', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useFocusEffect(useCallback(() => { fetchData() }, [session]))

  const countryMap = Object.fromEntries(countries.map(c => [c.id, c]))
  const displayed = showAll ? countries : countries.slice(0, 5)
  const topGainers = [...countries].sort((a, b) => b.change_pct - a.change_pct).slice(0, 3)
  const topLosers = [...countries].sort((a, b) => a.change_pct - b.change_pct).slice(0, 3)
  const fmt = (n: number) => n.toFixed(2).replace('.', ',')
  const fmtPct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')}%`
  const pctColor = (n: number) => n === 0 ? '#9ca3af' : n > 0 ? '#16a34a' : '#dc2626'
  const openModal = (c: Country) => setModalCountry({ id: c.id, name: c.name, code: c.code, current_price: c.current_price })

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  return (
    <>
      <ScrollView
        className="flex-1 bg-gray-50"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} />}
      >
        <View className="flex flex-col gap-4 p-4">
          {userData && (
            <PortfolioBanner
              total={userData.balance + userData.shares_value}
              sharesValue={userData.shares_value}
              balance={userData.balance}
              investmentPnl={userData.investment_pnl}
              predictionIncome={userData.prediction_income}
              showSubtitles={true}
            />
          )}

          <MarketStatus marketOpen={marketOpen} lastUpdated={marketUpdated} />

          {/* Top 5 */}
          <View className="flex flex-col gap-2">
            <Text className="text-sm font-semibold uppercase tracking-wide text-gray-700">Top 5</Text>
            <View className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
              {displayed.map((c, i) => (
                <Pressable
                  key={c.id}
                  onPress={() => openModal(c)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingVertical: 12, paddingHorizontal: 16,
                    borderBottomWidth: i < displayed.length - 1 ? 1 : 0, borderBottomColor: '#f3f4f6',
                  }}
                >
                  <Text style={{ width: 24, fontSize: 10, fontWeight: '600', color: '#9ca3af' }}>{i + 1}</Text>
                  <FlagImage code={c.code} size={14} radius={2} />
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: '500', color: '#1f2937' }} numberOfLines={1}>{c.name}</Text>
                  <Text style={{ width: 60, textAlign: 'right', fontSize: 12, fontWeight: '500', color: '#1f2937' }}>{fmt(c.current_price)}</Text>
                  <Text style={{ width: 68, textAlign: 'right', fontSize: 11, fontWeight: '500', color: pctColor(c.change_pct) }}>
                    {fmtPct(c.change_pct)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setShowAll(v => !v)}>
              <Text className="text-center text-xs text-green-700">{showAll ? 'Show top 5' : 'Show all'}</Text>
            </Pressable>
          </View>

          {/* Gainers + Losers */}
          <View className="flex-row gap-2">
            <View className="flex-1 flex-col gap-2">
              <Text className="text-sm font-semibold uppercase tracking-wide text-gray-700">Top Gainers</Text>
              <View className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                {topGainers.map((c, i) => (
                  <Pressable
                    key={c.id}
                    onPress={() => openModal(c)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingVertical: 10, paddingHorizontal: 12,
                      borderBottomWidth: i < topGainers.length - 1 ? 1 : 0, borderBottomColor: '#f3f4f6',
                    }}
                  >
                    <FlagImage code={c.code} size={14} radius={2} />
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: '500', color: '#1f2937' }} numberOfLines={1}>{c.name}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '500', color: pctColor(c.change_pct) }}>{fmtPct(c.change_pct)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View className="flex-1 flex-col gap-2">
              <Text className="text-sm font-semibold uppercase tracking-wide text-gray-700">Top Losers</Text>
              <View className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                {topLosers.map((c, i) => (
                  <Pressable
                    key={c.id}
                    onPress={() => openModal(c)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingVertical: 10, paddingHorizontal: 12,
                      borderBottomWidth: i < topLosers.length - 1 ? 1 : 0, borderBottomColor: '#f3f4f6',
                    }}
                  >
                    <FlagImage code={c.code} size={14} radius={2} />
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: '500', color: '#1f2937' }} numberOfLines={1}>{c.name}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '500', color: pctColor(c.change_pct) }}>{fmtPct(c.change_pct)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* Upcoming Matches */}
          {upcomingMatches.length > 0 && (
            <View className="flex flex-col gap-2">
              <Text className="text-sm font-semibold uppercase tracking-wide text-gray-700">Upcoming Matches</Text>
              <View className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                {upcomingMatches.map((m, mi) => {
                  const home = m.home_country_id ? countryMap[m.home_country_id] : null
                  const away = m.away_country_id ? countryMap[m.away_country_id] : null
                  const isKnockout = m.stage !== 'group'
                  const hasPred = m.id in matchPredictions
                  const predWinnerId = matchPredictions[m.id]

                  let predLabel: string | null = null
                  if (isKnockout) {
                    const nextStage = KNOCKOUT_NEXT[m.stage] ?? m.stage
                    const homePred = m.home_country_id ? advancementPredictions[m.home_country_id]?.has(nextStage) : false
                    const awayPred = m.away_country_id ? advancementPredictions[m.away_country_id]?.has(nextStage) : false
                    if (homePred && awayPred) predLabel = `${home?.name ?? '?'} & ${away?.name ?? '?'} to advance`
                    else if (homePred) predLabel = `${home?.name ?? '?'} to advance`
                    else if (awayPred) predLabel = `${away?.name ?? '?'} to advance`
                    else predLabel = 'none to advance'
                  } else if (hasPred) {
                    predLabel = predWinnerId === null ? 'Draw'
                      : predWinnerId === m.home_country_id ? `${home?.name ?? '?'} wins`
                      : `${away?.name ?? '?'} wins`
                  }

                  const homeShares = m.home_country_id ? (holdingsMap[m.home_country_id] ?? 0) : 0
                  const awayShares = m.away_country_id ? (holdingsMap[m.away_country_id] ?? 0) : 0
                  const sharesLabel = [
                    homeShares > 0 ? `${homeShares}× ${home?.name ?? ''}` : null,
                    awayShares > 0 ? `${awayShares}× ${away?.name ?? ''}` : null,
                  ].filter(Boolean).join(' · ')

                  const d = new Date(m.match_date)
                  const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })
                  const timeStr = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })

                  return (
                    <View key={m.id} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: mi < upcomingMatches.length - 1 ? 1.5 : 0, borderBottomColor: '#f3f4f6' }}>
                      {/* Stage + date/time */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        {!isKnockout && home?.group_name ? (
                          <View style={{ backgroundColor: '#f3f4f6', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#6b7280' }}>{home.group_name}</Text>
                          </View>
                        ) : isKnockout ? (
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#6b7280' }}>{STAGE_ABBR[m.stage] ?? m.stage}</Text>
                        ) : null}
                        <Text style={{ fontSize: 11, fontWeight: '500', color: '#374151' }}>{dateStr}</Text>
                        <Text style={{ fontSize: 11, fontWeight: '500', color: '#374151' }}>{timeStr}</Text>
                      </View>

                      {/* Teams — 3-column: home right-aligned | vs | away left-aligned */}
                      {isKnockout && !home && m.bracket_label ? (
                        <Text style={{ fontSize: 12, fontWeight: '500', color: '#1f2937' }}>{m.bracket_label}</Text>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                            <Text style={{ flexShrink: 1, fontSize: 12, fontWeight: '500', color: '#1f2937' }} numberOfLines={1}>{home?.name ?? '—'}</Text>
                            {home && <FlagImage code={home.code} size={13} radius={2} />}
                          </View>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#9ca3af', width: 20, textAlign: 'center' }}>vs</Text>
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            {away && <FlagImage code={away.code} size={13} radius={2} />}
                            <Text style={{ flexShrink: 1, fontSize: 12, fontWeight: '500', color: '#1f2937' }} numberOfLines={1}>{away?.name ?? '—'}</Text>
                          </View>
                        </View>
                      )}

                      {/* Prediction + shares */}
                      {session?.user && (
                        <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 8 }}>
                          {predLabel !== null ? `My prediction: ${predLabel}` : 'My prediction: none yet'}
                          {sharesLabel ? ` / My shares: ${sharesLabel}` : ''}
                        </Text>
                      )}
                    </View>
                  )
                })}
              </View>
            </View>
          )}

          <Footer />
        </View>
      </ScrollView>

      <PriceModal country={modalCountry} onClose={() => setModalCountry(null)} />
    </>
  )
}
