import { supabase } from '@/lib/supabase'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function eur(v: number) {
  return `€${v % 1 === 0 ? v : v.toFixed(2)}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: string }) {
  return <Text style={s.sectionHeader}>{children}</Text>
}

function Divider() {
  return <View style={s.divider} />
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>
}

function CardTitle({ children }: { children: string }) {
  return <Text style={s.cardTitle}>{children}</Text>
}

function Body({ children }: { children: React.ReactNode }) {
  return <Text style={s.body}>{children}</Text>
}

function Bold({ children }: { children: string }) {
  return <Text style={s.bold}>{children}</Text>
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.bullet}>
      <Text style={s.body}>{'• '}</Text>
      <Text style={[s.body, { flex: 1 }]}>{children}</Text>
    </View>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────

type TableRow = (string | number)[]

function RulesTable({ headers, rows, colAligns }: { headers: string[]; rows: TableRow[]; colAligns?: ('left' | 'center')[] }) {
  const aligns = colAligns ?? headers.map((_, i) => i === 0 ? 'left' : 'center')
  return (
    <View style={s.table}>
      {/* Header */}
      <View style={[s.tableRow, s.tableHeaderRow]}>
        {headers.map((h, i) => (
          <Text key={i} style={[s.tableHeader, { flex: i === 0 ? 2 : 1, textAlign: aligns[i] }]}>{h}</Text>
        ))}
      </View>
      {/* Rows */}
      {rows.map((row, ri) => (
        <View key={ri} style={[s.tableRow, ri < rows.length - 1 && s.tableRowBorder]}>
          {row.map((cell, ci) => (
            <Text key={ci} style={[s.tableCell, { flex: ci === 0 ? 2 : 1, textAlign: aligns[ci], fontWeight: ci > 0 && ri >= 0 ? '500' : '400' }]}>
              {String(cell)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PredictionIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#4a7c3f" strokeWidth={1.5}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </Svg>
  )
}

function InvestmentIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#4a7c3f" strokeWidth={1.5}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </Svg>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function Rules() {
  const [settings, setSettings] = useState<Record<string, number> | null>(null)
  const [bannerSize, setBannerSize] = useState({ width: 1, height: 1 })

  useEffect(() => {
    supabase.from('game_settings').select('key, value').then(({ data }) => {
      const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, Number(r.value)]))
      setSettings(map)
    })
  }, [])

  if (!settings) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' }}>
        <ActivityIndicator color="#4a7c3f" />
      </View>
    )
  }

  const g = (key: string, fallback: number) => settings[key] ?? fallback

  const startingBalance = g('starting_balance', 200)
  const matchPayout     = g('match_prediction_payout', 10)
  const r32Payout       = g('round_of_32_payout', 20)
  const r16Payout       = g('round_of_16_payout', 30)
  const qfPayout        = g('quarterfinal_payout', 50)
  const sfPayout        = g('semifinal_payout', 100)
  const finalPayout     = g('final_payout', 200)
  const winnerPayout    = g('winner_payout', 500)

  const ptGS     = g('floor_starting', 5)
  const ptR32    = g('floor_group_stage', 5)
  const ptR16    = g('floor_round_of_16', 5)
  const ptQF     = g('floor_quarterfinal', 10)
  const ptSF     = g('floor_semifinal', 15)
  const ptFinal  = g('floor_final', 20)
  const ptWinner = g('floor_winner', 40)

  const minGS     = ptGS
  const minR32    = minGS + ptR32
  const minR16    = minR32 + ptR16
  const minQF     = minR16 + ptQF
  const minSF     = minQF + ptSF
  const minFinal  = minSF + ptFinal
  const minWinner = minFinal + ptWinner

  // to-br gradient end point
  const bw = bannerSize.width, bh = bannerSize.height
  const bs = bw + bh
  const gradientEnd = { x: bs / (2 * bw), y: bs / (2 * bh) }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f9fafb' }} contentContainerStyle={s.page}>

      {/* ── Summary banner ── */}
      <LinearGradient
        colors={['#3a6b1c', '#6baa28']}
        start={{ x: 0, y: 0 }}
        end={gradientEnd}
        style={s.banner}
        onLayout={e => setBannerSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        <Text style={s.bannerTitle}>SoccerShares Summary</Text>
        <Text style={s.bannerBody}>
          SoccerShares is a game built around the 2026 FIFA World Cup. The game has two parts that work together — a{' '}
          <Text style={{ fontWeight: '600' }}>prediction game</Text> and an{' '}
          <Text style={{ fontWeight: '600' }}>investment game</Text>.
        </Text>

        <View style={s.twoCol}>
          <View style={s.summaryCard}>
            <View style={s.summaryCardHeader}>
              <PredictionIcon />
              <Text style={s.summaryCardTitle}>Prediction Game</Text>
            </View>
            <Text style={s.summaryCardBody}>Before the World Cup, predict match results and tournament advancement.</Text>
          </View>
          <View style={s.summaryCard}>
            <View style={s.summaryCardHeader}>
              <InvestmentIcon />
              <Text style={s.summaryCardTitle}>Investment Game</Text>
            </View>
            <Text style={s.summaryCardBody}>During the World Cup, buy and sell country shares that rise and fall with results.</Text>
          </View>
        </View>

        <Text style={s.bannerBody}>
          Cash earned from correct predictions can be invested into shares (with play money).
        </Text>
      </LinearGradient>

      <Divider />

      {/* ── Prediction Game ── */}
      <View style={s.section}>
        <SectionHeader>The Prediction Game</SectionHeader>

        <Body>
          All predictions must be submitted before the start of the 2026 FIFA World Cup and cannot be changed afterwards.
        </Body>

        <Card>
          <CardTitle>Group stage match results</CardTitle>
          <Body>
            Predict <Bold>Home Win / Draw / Away Win</Bold> for all 72 group stage matches. Each correct prediction earns <Bold>{eur(matchPayout)}</Bold>.
          </Body>
        </Card>

        <Card>
          <CardTitle>Knock-out round advancement</CardTitle>
          <Body>Predict which countries reach each knock-out round.</Body>
          <RulesTable
            headers={['Round', 'Countries', 'Per country']}
            rows={[
              ['Group advancement', 32, eur(r32Payout)],
              ['Round of 16',       16, eur(r16Payout)],
              ['Quarter-Finals',     8, eur(qfPayout)],
              ['Semi-Finals',        4, eur(sfPayout)],
              ['Final',              2, eur(finalPayout)],
              ['Winner',             1, eur(winnerPayout)],
            ]}
          />
        </Card>
      </View>

      <Divider />

      {/* ── Investment Game ── */}
      <View style={s.section}>
        <SectionHeader>The Investment Game</SectionHeader>

        <Body>
          Each of the 48 participating countries has a share whose price rises and falls based on their World Cup performance. Share prices are recalculated daily based on bookmaker quotes — stronger performing countries will see their prices rise, while eliminated or underperforming countries will fall.
        </Body>

        {/* Share pricing */}
        <View style={s.subSection}>
          <Text style={s.subHeader}>Share pricing</Text>
          <Bullet>Each share has a minimum value of <Bold>{eur(minGS)}</Bold>.</Bullet>
          <Bullet>A country's share price reflects the bookmaker's probabilities of how likely the country will advance to each stage. Each stage advanced means that the points for that stage will be locked in.</Bullet>
          <Bullet>The country that wins the World Cup will finish at <Bold>{eur(minWinner)}</Bold>.</Bullet>
          <Bullet>Eliminated countries will drop to the minimum price of the stage their World Cup ends (for example, each country that lost their quarter-final match will drop to <Bold>{eur(minQF)}</Bold>).</Bullet>
        </View>

        <Card>
          <RulesTable
            headers={['Round', 'Pts/stage', 'Min. price']}
            rows={[
              ['Group Stage',    ptGS,     eur(minGS)],
              ['Round of 32',    ptR32,    eur(minR32)],
              ['Round of 16',    ptR16,    eur(minR16)],
              ['Quarter-Final',  ptQF,     eur(minQF)],
              ['Semi-Final',     ptSF,     eur(minSF)],
              ['Runner-up',      ptFinal,  eur(minFinal)],
              ['Winner',         ptWinner, eur(minWinner)],
            ]}
          />
        </Card>

        {/* Trading windows */}
        <View style={s.subSection}>
          <Text style={s.subHeader}>Trading windows</Text>
          <Body>
            On match days the market will be <Bold>closed from the start of the first match</Bold> until share prices have been recalculated after the last match of the day. Due to the time difference with North America, recalculation may not happen until the following morning European time and depends on timing of updated bookmaker quotes.
          </Body>
          <Body>
            Share prices will also be updated occasionally before the start of the World Cup, which will already create certain changes in players' total points before the first match starts. However, those price fluctuations will be minimal compared to changes during the World Cup.
          </Body>
        </View>

        {/* Trading rules */}
        <View style={s.subSection}>
          <Text style={s.subHeader}>Trading rules</Text>
          <Bullet>Every user starts with <Bold>{eur(startingBalance)} in virtual cash</Bold>.</Bullet>
          <Bullet>You can buy and sell <Bold>whole shares</Bold> at the current price.</Bullet>
          <Bullet>Short-selling is <Bold>not allowed</Bold> — you cannot sell shares you don't own.</Bullet>
          <Bullet>You cannot go into <Bold>negative cash</Bold>.</Bullet>
        </View>
      </View>

    </ScrollView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { padding: 16, gap: 24, paddingBottom: 40 },
  divider: { height: 1, backgroundColor: '#e5e7eb' },
  section: { gap: 14 },
  subSection: { gap: 8 },
  sectionHeader: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: '#374151' },
  subHeader: { fontSize: 13, fontWeight: '600', color: '#111827' },
  body: { fontSize: 13, color: '#4b5563', lineHeight: 20 },
  bold: { fontWeight: '600', color: '#374151' },
  bullet: { flexDirection: 'row', alignItems: 'flex-start' },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 8,
    borderWidth: 1, borderColor: '#e5e7eb',
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  // Banner
  banner: { borderRadius: 12, padding: 16, gap: 12 },
  bannerTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: '#fff' },
  bannerBody: { fontSize: 13, color: '#fff', lineHeight: 20 },
  twoCol: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12, gap: 6, borderWidth: 1, borderColor: '#e5e7eb' },
  summaryCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryCardTitle: { fontSize: 12, fontWeight: '600', color: '#111827' },
  summaryCardBody: { fontSize: 12, color: '#6b7280', lineHeight: 17 },
  // Table
  table: { gap: 0 },
  tableHeaderRow: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 6, marginBottom: 2 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  tableHeader: { fontSize: 12, fontWeight: '600', color: '#374151' },
  tableCell: { fontSize: 12, color: '#4b5563' },
})
