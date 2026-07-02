import MarketStatus from '@/components/MarketStatus'
import PortfolioBanner from '@/components/PortfolioBanner'
import { theme } from '@/constants/theme'
import { useSession } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useCurrency } from '@/lib/currency'
import { useEffect, useRef, useState } from 'react'
import Footer from '@/components/Footer'
import PriceModal, { type ModalCountry } from '@/components/PriceModal'
import { FlagImage } from '@/components/FlagImage'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View
} from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'

type Country = {
  id: string
  code: string
  name: string
  current_price: number
  group_name: string
  priceChange: 'up' | 'down' | 'same'
  shares: number
}

type Match = {
  id: string
  home: Country
  away: Country
  match_date: string
  stage: string
}

type Transaction = {
  id: string
  type: 'buy' | 'sell'
  shares: number
  price_per_share: number
  total_amount: number
  created_at: string
  country_code: string
  country_name: string
}

const flagUrl = (code: string) =>
  `https://www.soccershares.nl/flags/${code.toLowerCase()}.svg`

const STAGE_ABBR: Record<string, string> = {
  round_of_32: 'R32', round_of_16: 'R16', quarterfinal: 'QF',
  semifinal: 'SF', third_place: '3rd', final: 'F',
}

const KNOCKOUT_NEXT: Record<string, string> = {
  round_of_32: 'round_of_16', round_of_16: 'quarterfinal',
  quarterfinal: 'semifinal', semifinal: 'final', final: 'winner',
}

function TrendIcon({ change }: { change: 'up' | 'down' | 'same' }) {
  if (change === 'up') return <Text className="text-xs text-green-600">▲</Text>
  if (change === 'down') return <Text className="text-xs text-red-600">▼</Text>
  return <Text className="text-xs text-gray-300">=</Text>
}

function GroupBadge({ group }: { group: string }) {
  return (
    <View className="rounded bg-gray-100 px-1 py-0.5">
      <Text className="text-[10px] font-semibold text-gray-500">{group}</Text>
    </View>
  )
}

function TableHeader() {
  return (
    <View className="flex-row border-b border-gray-100 bg-gray-50 px-3 py-2">
      <Text className="flex-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Country</Text>
      <Text style={{ width: 64, textAlign: 'center' }} className="text-xs font-semibold uppercase tracking-wide text-gray-500">Price</Text>
      <View style={{ width: 16 }} />
      <Text style={{ width: 64, textAlign: 'center' }} className="text-xs font-semibold uppercase tracking-wide text-gray-500">Shares</Text>
      <Text style={{ width: 64, textAlign: 'right' }} className="text-xs font-semibold uppercase tracking-wide text-gray-500">Value</Text>
    </View>
  )
}

function CountryRow({
  country, isLast, showVs, editable, sharesText, onChangeShares, onBlurShares, onPressName, fmtValue,
}: {
  country: Country
  isLast: boolean
  showVs?: boolean
  editable?: boolean
  sharesText?: string
  onChangeShares?: (text: string) => void
  onBlurShares?: () => void
  onPressName?: () => void
  fmtValue?: (n: number) => string
}) {
  const { format } = useCurrency()
  const displayFmtValue = fmtValue ?? format
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef<TextInput>(null)
  const displayShares = sharesText ?? String(country.shares)

  const handlePressShares = () => {
    if (!editable) return
    setIsEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleBlur = () => {
    setIsEditing(false)
    onBlurShares?.()
  }

  return (
    <>
      <View className={`flex-row items-center px-3 py-2 ${!isLast ? 'border-b border-gray-100' : ''}`}>
        <Pressable onPress={onPressName} style={{ flex: 1 }} className="flex-row items-center gap-2 min-w-0">
          <FlagImage code={country.code} size={14} radius={2} />
          <Text style={{ flex: 1, fontSize: 12, fontWeight: '500', color: '#1f2937' }} numberOfLines={1}>{country.name}</Text>
        </Pressable>
        <Text style={{ width: 64, textAlign: 'center', fontSize: 11, fontWeight: '500', color: '#1f2937', fontVariant: ['tabular-nums'] }}>{format(country.current_price)}</Text>
        <View className="w-4 items-start">
          <TrendIcon change={country.priceChange} />
        </View>
        {editable && isEditing ? (
          <TextInput
            ref={inputRef}
            style={{ width: 64, textAlign: 'center', fontSize: 12, fontWeight: '500', color: '#1f2937', fontVariant: ['tabular-nums'], padding: 0, margin: 0 }}
            value={displayShares}
            onChangeText={onChangeShares}
            onBlur={handleBlur}
            keyboardType="numeric"
            selectTextOnFocus
            returnKeyType="done"
          />
        ) : (
          <Pressable onPress={handlePressShares} style={{ width: 64, alignItems: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '500', color: '#1f2937', fontVariant: ['tabular-nums'] }}>{displayShares}</Text>
          </Pressable>
        )}
        <Text style={{ width: 64, textAlign: 'right', fontSize: 11, fontWeight: '500', color: '#1f2937', fontVariant: ['tabular-nums'] }}>
          {displayFmtValue(country.shares * country.current_price)}
        </Text>
      </View>
      {showVs && (
        <View className="px-3 py-0">
          <Text className="text-xs font-semibold text-gray-500" style={{ paddingLeft: 22 }}>vs</Text>
        </View>
      )}
    </>
  )
}

export default function Shares() {
  const { session } = useSession()
  const { format, formatInt } = useCurrency()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [myShares, setMyShares] = useState<Country[]>([])
  const [playingNext, setPlayingNext] = useState<Match[]>([])
  const [otherCountries, setOtherCountries] = useState<Country[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [showAllTransactions, setShowAllTransactions] = useState(false)
  const [sortAZ, setSortAZ] = useState(false)
  const [tournamentStarted, setTournamentStarted] = useState(false)
  const [marketOpen, setMarketOpen] = useState(false)
  const [marketUpdated, setMarketUpdated] = useState<string | null>(null)
  const [sharesValue, setSharesValue] = useState(0)
  const [balance, setBalance] = useState(0)
  const [eliminatedCountries, setEliminatedCountries] = useState<Country[]>([])
  const [sharesMap, setSharesMap] = useState<Record<string, string>>({})
  const [isPending, setIsPending] = useState(false)
  const [modalCountry, setModalCountry] = useState<ModalCountry | null>(null)
  const [showNegativeCashAlert, setShowNegativeCashAlert] = useState(false)
  const [matchPredictions, setMatchPredictions] = useState<Record<string, string | null>>({})
  const [advancementPredictions, setAdvancementPredictions] = useState<Record<string, Set<string>>>({})

  const useIntFormat = [...myShares, ...otherCountries, ...eliminatedCountries]
    .some(c => c.shares * c.current_price > 1000)
  const fmtValue = (n: number) => useIntFormat ? formatInt(n) : format(n)

  const openModal = (c: Country) => setModalCountry({ id: c.id, name: c.name, code: c.code, current_price: c.current_price })
  async function fetchData() {
    if (!session?.user?.id) return
    try {
      // Countries with holdings
      const { data: countriesData } = await supabase
        .from('countries')
        .select('id, code, name, current_price, group_name')
        .order('group_name')
        .order('current_price', { ascending: false })

      // Price history for trend and floor price
      const { data: priceHistory } = await supabase
        .from('price_history')
        .select('country_id, price, floor, recorded_at')
        .order('recorded_at', { ascending: false })

      const seenOnce = new Set<string>()
      const prevPriceMap: Record<string, number> = {}
      const currentFloorMap: Record<string, number> = {}
      if (priceHistory) {
        for (const row of priceHistory) {
          if (!seenOnce.has(row.country_id)) {
            seenOnce.add(row.country_id)
            if (row.floor != null) currentFloorMap[row.country_id] = row.floor
          } else if (!prevPriceMap[row.country_id]) {
            prevPriceMap[row.country_id] = row.price
          }
        }
      }

      const isEliminated = (c: { id: string; current_price: number }) => {
        const floor = currentFloorMap[c.id]
        return floor !== undefined && c.current_price <= floor + 0.001
      }

      const getPriceChange = (c: any): 'up' | 'down' | 'same' => {
        const prev = prevPriceMap[c.id]
        if (!prev) return 'same'
        if (c.current_price > prev) return 'up'
        if (c.current_price < prev) return 'down'
        return 'same'
      }

      // Holdings
      const { data: holdingsData } = await supabase
        .from('holdings')
        .select('country_id, shares')
        .eq('user_id', session.user.id)
        .gt('shares', 0)

      const holdingsMap: Record<string, number> = {}
      holdingsData?.forEach(h => { holdingsMap[h.country_id] = h.shares })

      const allCountries: Country[] = (countriesData ?? []).map(c => ({
        ...c,
        shares: holdingsMap[c.id] ?? 0,
        priceChange: getPriceChange(c),
      }))

      const initialSharesMap: Record<string, string> = {}
      allCountries.forEach(c => { initialSharesMap[c.id] = String(c.shares) })
      setSharesMap(initialSharesMap)

      // Playing Next — upcoming matches
const { data: lastRecalc } = await supabase
        .from('recalculations')
        .select('recalc_timestamp')
        .order('recalc_timestamp', { ascending: false })
        .limit(1)
        .maybeSingle()
      const since = (lastRecalc as any)?.recalc_timestamp ?? new Date().toISOString()

      const { data: matchesData } = await supabase
        .from('matches')
        .select('id, home_country_id, away_country_id, match_date, stage')
        .gte('match_date', since)
        .order('match_date')
        .limit(30)

      const countryMap: Record<string, any> = {}
      allCountries.forEach(c => { countryMap[c.id] = c })

      const toMatchDay = (iso: string) =>
        new Date(new Date(iso).getTime() - 8 * 3600_000).toISOString().slice(0, 10)

      const firstMatch = (matchesData ?? []).find(
        m => countryMap[m.home_country_id] && countryMap[m.away_country_id]
      )
      const nextDayStr = firstMatch ? toMatchDay(firstMatch.match_date) : null

      const matches: Match[] = (matchesData ?? [])
        .filter(m =>
          countryMap[m.home_country_id] &&
          countryMap[m.away_country_id] &&
          nextDayStr &&
          toMatchDay(m.match_date) === nextDayStr
        )
        .map(m => ({
          id: m.id,
          home: countryMap[m.home_country_id],
          away: countryMap[m.away_country_id],
          match_date: m.match_date,
          stage: m.stage,
        }))

      setPlayingNext(matches)

      // Predictions for Playing Next matches
      const groupMatchIds = matches.filter(m => m.stage === 'group').map(m => m.id)
      const hasKnockout = matches.some(m => m.stage !== 'group')
      const [matchPredsRes, advPredsRes] = await Promise.all([
        groupMatchIds.length > 0
          ? supabase.from('match_predictions').select('match_id, predicted_winner_id').eq('user_id', session.user.id).in('match_id', groupMatchIds)
          : Promise.resolve({ data: [] }),
        hasKnockout
          ? supabase.from('advancement_predictions').select('country_id, stage').eq('user_id', session.user.id)
          : Promise.resolve({ data: [] }),
      ])
      const predMap: Record<string, string | null> = {}
      for (const p of (matchPredsRes.data ?? []) as any[]) predMap[p.match_id] = p.predicted_winner_id
      setMatchPredictions(predMap)
      const advMap: Record<string, Set<string>> = {}
      for (const p of (advPredsRes.data ?? []) as any[]) {
        if (!advMap[p.country_id]) advMap[p.country_id] = new Set()
        advMap[p.country_id].add(p.stage)
      }
      setAdvancementPredictions(advMap)

const playingNextIds = new Set(matches.flatMap(m => [m.home.id, m.away.id]))
      const mySharesIds = new Set(allCountries.filter(c => c.shares > 0).map(c => c.id))
      setMyShares(allCountries.filter(c => mySharesIds.has(c.id)))
      setOtherCountries(allCountries.filter(c => !mySharesIds.has(c.id) && !playingNextIds.has(c.id) && !isEliminated(c)))
      setEliminatedCountries(allCountries.filter(c => isEliminated(c) && !mySharesIds.has(c.id) && !playingNextIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name)))

      const sv = allCountries.reduce((sum, c) => sum + c.shares * c.current_price, 0)
      setSharesValue(sv)

      // Market open
      const { data: tradingWindow } = await supabase
        .from('active_trading_window')
        .select('*')
        .limit(1)
      setMarketOpen((tradingWindow ?? []).length > 0)

      // Tournament started
      const { data: settingData } = await supabase
        .from('game_settings')
        .select('value')
        .eq('key', 'tournament_started')
        .maybeSingle()
      setTournamentStarted((settingData as { value: number } | null)?.value === 1)

      // User balance
      const { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('id', session.user.id)
        .single()
      setBalance(user?.balance ?? 0)

      // Market last updated
      const { data: latestHistory } = await supabase
        .from('price_history')
        .select('recorded_at')
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single()
      setMarketUpdated(latestHistory?.recorded_at ? new Date(latestHistory.recorded_at).toLocaleString('nl-NL', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }) : null)

      // Recent transactions
      const { data: txData } = await supabase
        .from('transactions')
        .select('id, type, shares, price_per_share, total_amount, created_at, countries(code, name)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(50)

      setTransactions((txData ?? []).map((t: any) => ({
        id: t.id,
        type: t.type,
        shares: t.shares,
        price_per_share: t.price_per_share,
        total_amount: t.total_amount,
        created_at: t.created_at,
        country_code: t.countries?.code ?? '',
        country_name: t.countries?.name ?? '',
      })))

    } catch (e) {
      console.error('Shares fetch error', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function handleSaveShares(countryId: string, currentPrice: number, originalShares: number) {
    if (!session?.user?.id) return
    const newShares = Math.max(0, parseInt(sharesMap[countryId] ?? String(originalShares)) || 0)
    const diff = newShares - originalShares
    if (diff === 0) return

    const totalCost = diff * currentPrice
    if (totalCost > balance + 0.001) {
      setSharesMap(prev => ({ ...prev, [countryId]: String(originalShares) }))
      setShowNegativeCashAlert(true)
      return
    }

    setIsPending(true)
    try {
      if (newShares === 0) {
        await supabase.from('holdings').delete().eq('user_id', session.user.id).eq('country_id', countryId)
      } else {
        await supabase.from('holdings').upsert(
          { user_id: session.user.id, country_id: countryId, shares: newShares, average_cost: currentPrice },
          { onConflict: 'user_id,country_id' }
        )
      }
      await supabase.from('transactions').insert({
        user_id: session.user.id,
        country_id: countryId,
        type: diff > 0 ? 'buy' : 'sell',
        shares: Math.abs(diff),
        price_per_share: currentPrice,
        total_amount: Math.abs(diff * currentPrice),
      })
      await supabase.from('users').update({ balance: balance - totalCost }).eq('id', session.user.id)
      await fetchData()
    } catch (e) {
      console.error('Save shares error', e)
    } finally {
      setIsPending(false)
    }
  }

  function handleSellAll() {
    if (!session?.user?.id || myShares.length === 0) return
    executeSellAll([...myShares])
  }

  async function executeSellAll(snapshot: Country[]) {
    setIsPending(true)
    try {
      const uid = session?.user?.id
      if (!uid) throw new Error('Session expired — please sign out and sign in again.')

      const countryIds = snapshot.map(c => c.id)
      const proceeds = snapshot.reduce((sum, c) => sum + c.shares * c.current_price, 0)

      const { data: userData, error: userErr } = await supabase
        .from('users').select('balance').eq('id', uid).single()
      if (userErr) throw new Error(`Balance fetch failed: ${userErr.message}`)
      const freshBalance = userData?.balance ?? 0

      const { error: delErr } = await supabase
        .from('holdings')
        .delete()
        .eq('user_id', uid)
        .in('country_id', countryIds)
      if (delErr) throw new Error(`Delete failed: ${delErr.message}`)

      const { error: txErr } = await supabase
        .from('transactions')
        .insert(snapshot.map(c => ({
          user_id: uid,
          country_id: c.id,
          type: 'sell' as const,
          shares: c.shares,
          price_per_share: c.current_price,
          total_amount: c.shares * c.current_price,
        })))
      if (txErr) throw new Error(`Transaction insert failed: ${txErr.message}`)

      const { error: balErr } = await supabase
        .from('users')
        .update({ balance: freshBalance + proceeds })
        .eq('id', uid)
      if (balErr) throw new Error(`Balance update failed: ${balErr.message}`)

      setMyShares([])
      setSharesValue(0)
      setBalance(freshBalance + proceeds)
      fetchData()
    } catch (e: any) {
      Alert.alert('Sell failed', e?.message ?? 'Unknown error. Please try again.')
    } finally {
      setIsPending(false)
    }
  }

  useEffect(() => { fetchData() }, [session])
  const sortedOther = (tournamentStarted || sortAZ)
    ? [...otherCountries].sort((a, b) => a.name.localeCompare(b.name))
    : otherCountries

  const visibleTransactions = showAllTransactions
    ? transactions
    : transactions.slice(0, 10)

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

        <PortfolioBanner
          total={balance + sharesValue}
          sharesValue={sharesValue}
          balance={balance}
          showSubtitles={false}
        />
        <MarketStatus marketOpen={marketOpen} lastUpdated={marketUpdated} />

        {/* My Shares */}
        {myShares.length > 0 && (
          <View className="flex flex-col gap-2 mt-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold uppercase tracking-wide text-gray-700">My Shares</Text>
              {marketOpen && (
                <Pressable onPress={handleSellAll} disabled={isPending}>
                  <View className="rounded-lg bg-red-500 px-3 py-1">
                    <Text className="text-xs font-semibold text-white">Sell All</Text>
                  </View>
                </Pressable>
              )}
            </View>
            <View className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
              <TableHeader />
              {myShares.map((c, i) => (
                <CountryRow
                  key={c.id}
                  country={c}
                  isLast={i === myShares.length - 1}
                  editable={marketOpen}
                  sharesText={sharesMap[c.id]}
                  onChangeShares={(t) => setSharesMap(prev => ({ ...prev, [c.id]: t }))}
                  onBlurShares={() => handleSaveShares(c.id, c.current_price, c.shares)}
                  onPressName={() => openModal(c)}
                  fmtValue={fmtValue}
                />
              ))}
            </View>
          </View>
        )}

        {/* Playing Next */}
        {playingNext.length > 0 && (
          <View className="flex flex-col gap-2 mt-2">
            <Text className="text-sm font-semibold uppercase tracking-wide text-gray-700">Playing Next</Text>
            <View className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
              <TableHeader />
              {(() => {
                // Group matches by kick-off time so concurrent matches share one header
                const groups: { key: string; matches: typeof playingNext }[] = []
                const keyIndex = new Map<string, number>()
                for (const match of playingNext) {
                  const k = match.match_date
                  if (!keyIndex.has(k)) {
                    keyIndex.set(k, groups.length)
                    groups.push({ key: k, matches: [match] })
                  } else {
                    groups[keyIndex.get(k)!].matches.push(match)
                  }
                }

                return groups.map((group, gi) => {
                  const first = group.matches[0]
                  const groupIsKnockout = first.stage !== 'group'
                  const d = new Date(first.match_date)
                  const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })
                  const timeStr = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })

                  return (
                    <View key={group.key} style={{ borderBottomWidth: gi < groups.length - 1 ? 1 : 0, borderBottomColor: '#e5e7eb' }}>
                      {/* Header — shown once per kick-off time */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2 }}>
                        {!groupIsKnockout && first.home.group_name ? (
                          <View style={{ backgroundColor: '#f3f4f6', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: '#6b7280' }}>{first.home.group_name}</Text>
                          </View>
                        ) : groupIsKnockout ? (
                          <Text style={{ fontSize: 10, fontWeight: '600', color: '#6b7280' }}>{STAGE_ABBR[first.stage] ?? first.stage}</Text>
                        ) : null}
                        <Text style={{ fontSize: 10, fontWeight: '500', color: '#374151' }}>{dateStr}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '500', color: '#374151' }}>{timeStr}</Text>
                      </View>

                      {group.matches.map((match) => {
                        const isKnockout = match.stage !== 'group'
                        let predLabel: string
                        if (isKnockout) {
                          const nextStage = KNOCKOUT_NEXT[match.stage] ?? match.stage
                          const homePred = advancementPredictions[match.home.id]?.has(nextStage) ?? false
                          const awayPred = advancementPredictions[match.away.id]?.has(nextStage) ?? false
                          if (homePred && awayPred) predLabel = `${match.home.name} & ${match.away.name} to advance`
                          else if (homePred) predLabel = `${match.home.name} to advance`
                          else if (awayPred) predLabel = `${match.away.name} to advance`
                          else predLabel = 'none to advance'
                        } else if (match.id in matchPredictions) {
                          const w = matchPredictions[match.id]
                          predLabel = w === null ? 'Draw'
                            : w === match.home.id ? `${match.home.name} wins`
                            : `${match.away.name} wins`
                        } else {
                          predLabel = 'none yet'
                        }

                        return (
                          <View key={match.id}>
                            <CountryRow
                              country={match.home}
                              isLast={true}
                              showVs={true}
                              editable={marketOpen}
                              sharesText={sharesMap[match.home.id]}
                              onChangeShares={(t) => setSharesMap(prev => ({ ...prev, [match.home.id]: t }))}
                              onBlurShares={() => handleSaveShares(match.home.id, match.home.current_price, match.home.shares)}
                              onPressName={() => openModal(match.home)}
                              fmtValue={fmtValue}
                            />
                            <CountryRow
                              country={match.away}
                              isLast={true}
                              editable={marketOpen}
                              sharesText={sharesMap[match.away.id]}
                              onChangeShares={(t) => setSharesMap(prev => ({ ...prev, [match.away.id]: t }))}
                              onBlurShares={() => handleSaveShares(match.away.id, match.away.current_price, match.away.shares)}
                              onPressName={() => openModal(match.away)}
                              fmtValue={fmtValue}
                            />
                            <Text style={{ fontSize: 10, color: '#9ca3af', paddingHorizontal: 12, paddingTop: 2, paddingBottom: 8 }}>
                              My prediction: {predLabel}
                            </Text>
                          </View>
                        )
                      })}
                    </View>
                  )
                })
              })()}
            </View>
          </View>
        )}

        {/* Other Countries */}
        <View className="flex flex-col gap-2 mt-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold uppercase tracking-wide text-gray-700">Other Countries</Text>
            {!tournamentStarted && (
              <Pressable onPress={() => setSortAZ(!sortAZ)}>
                <Text className="text-xs text-green-700">
                  {sortAZ ? 'Sort default' : 'Sort A>Z'}
                </Text>
              </Pressable>
            )}
          </View>
          <View className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <TableHeader />
            {sortedOther.map((c, i) => (
              <CountryRow
                key={c.id}
                country={c}
                isLast={i === sortedOther.length - 1}
                editable={marketOpen}
                sharesText={sharesMap[c.id]}
                onChangeShares={(t) => setSharesMap(prev => ({ ...prev, [c.id]: t }))}
                onBlurShares={() => handleSaveShares(c.id, c.current_price, c.shares)}
                onPressName={() => openModal(c)}
                fmtValue={fmtValue}
              />
            ))}
          </View>
        </View>

        {/* Eliminated */}
        {eliminatedCountries.length > 0 && (
          <View className="flex flex-col gap-2 mt-2">
            <Text className="text-sm font-semibold uppercase tracking-wide text-gray-700">Eliminated</Text>
            <View className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm" style={{ opacity: 0.5 }}>
              <TableHeader />
              {eliminatedCountries.map((c, i) => (
                <CountryRow
                  key={c.id}
                  country={c}
                  isLast={i === eliminatedCountries.length - 1}
                  editable={false}
                  onPressName={() => openModal(c)}
                  fmtValue={fmtValue}
                />
              ))}
            </View>
          </View>
        )}

        {/* Recent Transactions */}
        <View className="flex flex-col gap-2 mt-2">
          <Text className="text-sm font-semibold uppercase tracking-wide text-gray-700">Recent Transactions</Text>
          <View className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <View className="flex-row border-b border-gray-100 bg-gray-50 px-3 py-2">
              <Text className="flex-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Country</Text>
              <Text className="w-12 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Type</Text>
              <Text className="w-10 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Shares</Text>
              <Text className="w-16 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Price</Text>
              <Text className="w-20 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Total</Text>
            </View>
            {visibleTransactions.map((t, i) => (
              <View key={t.id} className={`flex-row items-center px-3 py-2 ${i < visibleTransactions.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <View className="flex-1 flex-row items-center gap-2">
                  <FlagImage code={t.country_code} size={14} radius={2} />
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#1f2937' }} numberOfLines={1}>{t.country_name}</Text>
                </View>
                <View className="w-12 items-center">
                  <View className={`rounded-full px-2 py-0.5 ${t.type === 'buy' ? 'bg-green-100' : 'bg-red-100'}`}>
                    <Text className={`text-xs font-semibold ${t.type === 'buy' ? 'text-green-800' : 'text-red-700'}`}>
                      {t.type === 'buy' ? 'Buy' : 'Sell'}
                    </Text>
                  </View>
                </View>
                <Text className="w-10 text-center text-sm tabular-nums text-gray-700">{t.shares}</Text>
                <Text className="w-16 text-right text-sm tabular-nums text-gray-600">{format(t.price_per_share)}</Text>
                <Text className="w-20 text-right text-sm tabular-nums font-semibold text-gray-800">{format(t.total_amount)}</Text>
              </View>
            ))}
          </View>
          {transactions.length > 10 && (
            <Pressable onPress={() => setShowAllTransactions(!showAllTransactions)}>
              <Text className="text-xs text-center text-green-700 mt-1">
                {showAllTransactions ? 'Show less' : 'Show all transactions'}
              </Text>
            </Pressable>
          )}
        </View>

        <Footer />
      </View>
    </ScrollView>

    <PriceModal country={modalCountry} onClose={() => setModalCountry(null)} />

    <Modal visible={showNegativeCashAlert} transparent animationType="fade" onRequestClose={() => setShowNegativeCashAlert(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <View style={{ backgroundColor: '#111827', borderRadius: 16, padding: 28, alignItems: 'center', width: '100%', maxWidth: 320 }}>
          <Svg width={48} height={48} viewBox="0 0 24 24">
            <Path d="M12 2L1 21h22L12 2z" fill="none" stroke="#f59e0b" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
            <Line x1={12} y1={9} x2={12} y2={14} stroke="#f59e0b" strokeWidth={1.8} strokeLinecap="round" />
            <Circle cx={12} cy={17.5} r={0.8} fill="#f59e0b" />
          </Svg>
          <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 16, marginTop: 16, textAlign: 'center' }}>
            You cannot have negative cash
          </Text>
          <Pressable
            onPress={() => setShowNegativeCashAlert(false)}
            style={{ marginTop: 24, backgroundColor: '#4a7c3f', borderRadius: 8, paddingHorizontal: 32, paddingVertical: 11 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 15 }}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  </>
  )
}