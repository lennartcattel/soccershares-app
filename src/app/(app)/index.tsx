import { theme } from '@/constants/theme'
import { useSession } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  Image as RNImage, ScrollView, StyleSheet,
  Text,
  View
} from 'react-native'

type Country = {
  id: string
  name: string
  code: string
  flag_emoji: string
  current_price: number
  change_pct: number
}

type UserData = {
  display_name: string
  balance: number
  shares_value: number
  investment_pnl: number
  prediction_income: number
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

  async function fetchData() {
    try {
      const { data: windows } = await supabase
        .from('active_trading_window')
        .select('closes_at')
        .limit(1)
      setMarketOpen((windows?.length ?? 0) > 0)

      const { data: countriesData } = await supabase
        .from('countries')
        .select('id, name, code, flag_emoji, current_price')
        .order('current_price', { ascending: false })

      const { data: priceHistory } = await supabase
        .from('price_history')
        .select('country_id, price, recorded_at')
        .order('recorded_at', { ascending: false })

      const prevPriceMap: Record<string, number> = {}
      const seenOnce = new Set<string>()
      if (priceHistory) {
        for (const row of priceHistory) {
          if (!seenOnce.has(row.country_id)) {
            seenOnce.add(row.country_id)
          } else if (!prevPriceMap[row.country_id]) {
            prevPriceMap[row.country_id] = row.price
          }
        }
      }

      const enriched: Country[] = (countriesData ?? []).map((c) => {
        const prev = prevPriceMap[c.id] ?? 0
        const change_pct = prev > 0 ? (c.current_price - prev) / prev * 100 : 0
        return { ...c, change_pct }
      })

      setCountries(enriched)
      const latestUpdate = priceHistory?.[0]?.recorded_at
      setMarketUpdated(latestUpdate ? new Date(latestUpdate).toLocaleString('nl-NL', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }) : null)

      if (session?.user?.id) {
        const { data: user } = await supabase
          .from('users')
          .select('display_name, balance')
          .eq('id', session.user.id)
          .single()

        const { data: holdings } = await supabase
          .from('holdings')
          .select('shares, country_id')
          .eq('user_id', session.user.id)

        let sharesValue = 0
        if (holdings && countriesData) {
          for (const h of holdings) {
            const country = countriesData.find(c => c.id === h.country_id)
            if (country) sharesValue += h.shares * country.current_price
          }
        }

        const { data: snapshot } = await supabase
          .from('recalculation_user_snapshots')
          .select('investment_pnl, cumulative_prediction_income')
          .eq('user_id', session.user.id)
          .order('recalc_timestamp', { ascending: false })
          .limit(1)
          .single()

        setUserData({
          display_name: user?.display_name ?? '',
          balance: user?.balance ?? 0,
          shares_value: sharesValue,
          investment_pnl: snapshot?.investment_pnl ?? 0,
          prediction_income: snapshot?.cumulative_prediction_income ?? 0,
        })
      }
    } catch (e) {
      console.error('Home fetch error', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { fetchData() }, [])
  const top5 = showAll ? countries : countries.slice(0, 5)
  const topGainers = [...countries].sort((a, b) => b.change_pct - a.change_pct).slice(0, 3)
  const topLosers = [...countries].sort((a, b) => a.change_pct - b.change_pct).slice(0, 3)

  const fmt = (n: number) => `€${n.toFixed(2).replace('.', ',')}`
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')}%`

if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} />}
    >
{userData && (
        <LinearGradient
          colors={['#3a6b1c', '#6baa28']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        >
          <View style={styles.bannerCol}>
            <Text style={styles.bannerLabel}>Total</Text>
            <Text style={styles.bannerValue}>{fmt(userData.balance + userData.shares_value)}</Text>
          </View>
          <View style={styles.bannerDivider} />
          <View style={styles.bannerCol}>
            <Text style={styles.bannerLabel}>Shares</Text>
            <Text style={styles.bannerValue}>{fmt(userData.shares_value)}</Text>
            <Text style={styles.bannerSub}>
              {fmt(Math.abs(userData.investment_pnl))} {userData.investment_pnl >= 0 ? 'profit' : 'loss'} on shares
            </Text>
          </View>
          <View style={styles.bannerDivider} />
          <View style={styles.bannerCol}>
            <Text style={styles.bannerLabel}>Cash</Text>
            <Text style={styles.bannerValue}>{fmt(userData.balance)}</Text>
            <Text style={styles.bannerSub}>
              €{Math.round(userData.prediction_income)} earned with predictions
            </Text>
          </View>
        </LinearGradient>
      )}

      <View style={styles.section}>
        <View style={styles.marketRow}>
          <Text style={styles.marketLabel}>MARKET STATUS: </Text>
          <Text style={[styles.marketStatus, { color: marketOpen ? theme.colors.gain : theme.colors.loss }]}>
            {marketOpen ? 'OPEN' : 'CLOSED'}
          </Text>
        </View>
        {marketUpdated && (
          <Text style={styles.marketUpdated}>Last update: {marketUpdated}</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TOP 5</Text>
        <View style={styles.card}>
          {top5.map((c, i) => (
            <View key={c.id} style={[styles.row, i < top5.length - 1 && styles.rowBorder]}>
              <Text style={styles.rank}>{i + 1}</Text>
              <RNImage
                source={{ uri: `https://www.soccershares.nl/flags/${c.code.toLowerCase().trim()}.svg` }}
                style={styles.flagImg}
              />
              <Text style={styles.countryName}>{c.name}</Text>
              <Text style={styles.price}>{fmt(c.current_price)}</Text>
              <Text style={[styles.pct, { color: c.change_pct >= 0 ? theme.colors.gain : theme.colors.loss }]}>
                {fmtPct(c.change_pct)}
              </Text>
            </View>
          ))}
        </View>
        <Pressable onPress={() => setShowAll(!showAll)}>
          <Text style={styles.showAll}>{showAll ? 'Show top 5' : 'Show all'}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <View style={styles.twoCol}>
          <View style={styles.halfCol}>
            <Text style={styles.sectionTitle}>TOP GAINERS</Text>
            <View style={styles.card}>
              {topGainers.map((c, i) => (
                <View key={c.id} style={[styles.row, i < topGainers.length - 1 && styles.rowBorder]}>
                  <RNImage
                    source={{ uri: `https://www.soccershares.nl/flags/${c.code.toLowerCase().trim()}.svg` }}
                    style={styles.flagImg}
                  />
                  <Text style={styles.countryNameSm}>{c.name}</Text>
                  <Text style={[styles.pct, { color: theme.colors.gain }]}>
                    {fmtPct(c.change_pct)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.halfCol}>
            <Text style={styles.sectionTitle}>TOP LOSERS</Text>
            <View style={styles.card}>
              {topLosers.map((c, i) => (
                <View key={c.id} style={[styles.row, i < topLosers.length - 1 && styles.rowBorder]}>
                  <RNImage
                    source={{ uri: `https://www.soccershares.nl/flags/${c.code.toLowerCase().trim()}.svg` }}
                    style={styles.flagImg}
                  />
                  <Text style={styles.countryNameSm}>{c.name}</Text>
                  <Text style={[styles.pct, { color: theme.colors.loss }]}>
                    {fmtPct(c.change_pct)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  banner: {
    flexDirection: 'row',
    margin: theme.spacing.md,
    borderRadius: 12,
    overflow: 'hidden',
  },
  bannerCol: { flex: 1, alignItems: 'center', padding: 16 },
  bannerDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center' },
  bannerLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 4 },
  bannerValue: { color: '#ffffff', fontSize: 20, fontWeight: '700', marginTop: 4 },
  section: { paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.md },
  marketRow: { flexDirection: 'row', alignItems: 'center' },
  marketStatus: { fontSize: 14, fontWeight: '700' },
  marketUpdated: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#1f2937', marginBottom: theme.spacing.sm, letterSpacing: 0.8, textTransform: 'uppercase' },
  marketLabel: { fontSize: 14, fontWeight: '600', color: '#1f2937', letterSpacing: 0.8, textTransform: 'uppercase' },
  bannerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2, textAlign: 'center' },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
    row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: theme.spacing.sm,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  rank: { width: 16, color: theme.colors.textSecondary, fontSize: 14 },
  flagImg: { width: 14, height: 14, borderRadius: 10 },
  countryName: { flex: 1, fontSize: 15, color: theme.colors.text },
  countryNameSm: { flex: 1, fontSize: 13, color: theme.colors.text },
  price: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  pct: { width: 56, textAlign: 'right', fontSize: 14, fontWeight: '600' },
  showAll: { color: '#15803d', textAlign: 'center', marginTop: 6, fontSize: 12 },
  twoCol: { flexDirection: 'row', gap: theme.spacing.sm },
  halfCol: { flex: 1 },
})  