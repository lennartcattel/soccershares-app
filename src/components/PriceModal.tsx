import { FlagImage } from '@/components/FlagImage'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Dimensions, Modal, Pressable, Text, View } from 'react-native'
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg'

type PricePoint = { price: number; floor: number; recorded_at: string }
export type ModalCountry = { id: string; name: string; code: string; current_price: number }

const CW = 280, CH = 120
const PAD = { top: 8, right: 8, bottom: 18, left: 36 }
const iW = CW - PAD.left - PAD.right
const iH = CH - PAD.top - PAD.bottom

function PriceChart({ data, floorMode }: { data: PricePoint[]; floorMode: 'current' | 'historical' }) {
  const n = data.length
  const dataMax = Math.max(...data.map(d => d.price))
  const maxP = dataMax <= 15 ? 15 : dataMax <= 25 ? 25 : dataMax <= 50 ? 50 : dataMax <= 75 ? 75 : 100

  const toX = (i: number) => PAD.left + (n === 1 ? iW / 2 : (i / (n - 1)) * iW)
  const toY = (p: number) => PAD.top + ((maxP - p) / maxP) * iH

  const points = data.map((d, i) => ({ x: toX(i), y: toY(d.price) }))
  const pricePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const currentFloor = data[data.length - 1].floor
  let floorPath: string
  if (floorMode === 'historical') {
    let fp = `M${toX(0).toFixed(1)},${toY(data[0].floor).toFixed(1)}`
    for (let i = 1; i < n; i++) fp += ` H${toX(i).toFixed(1)} V${toY(data[i].floor).toFixed(1)}`
    fp += ` H${(PAD.left + iW).toFixed(1)}`
    floorPath = fp
  } else {
    const y = toY(currentFloor)
    floorPath = `M${PAD.left.toFixed(1)},${y.toFixed(1)} H${(PAD.left + iW).toFixed(1)}`
  }

  const yTicks = maxP === 15 ? [0, 5, 10, 15]
    : maxP === 25 ? [0, 5, 10, 15, 20, 25]
    : maxP === 50 ? [0, 10, 20, 30, 40, 50]
    : maxP === 75 ? [0, 15, 30, 45, 60, 75]
    : [0, 20, 40, 60, 80, 100]

  const maxTicks = Math.min(n, 5)
  const xIdx = n <= 1 ? [0] : Array.from({ length: maxTicks }, (_, i) => Math.round((i / (maxTicks - 1)) * (n - 1)))
  const fmtD = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}` }

  const screenW = Dimensions.get('window').width
  const svgW = screenW - 88
  const svgH = (CH / CW) * svgW

  return (
    <Svg width={svgW} height={svgH} viewBox={`0 0 ${CW} ${CH}`}>
      {yTicks.map(v => <Line key={`yl${v}`} x1={PAD.left} y1={toY(v)} x2={PAD.left + iW} y2={toY(v)} stroke="#e5e7eb" strokeWidth={0.5} />)}
      {yTicks.map(v => <SvgText key={`yt${v}`} x={PAD.left - 4} y={toY(v) + 3} textAnchor="end" fontSize={7.5} fill="#9ca3af">{v}</SvgText>)}
      {xIdx.map((idx, ti) => (
        <SvgText key={`xt${idx}`} x={toX(idx)} y={CH - 2} textAnchor={ti === 0 ? 'start' : ti === maxTicks - 1 ? 'end' : 'middle'} fontSize={8} fill="#9ca3af">
          {fmtD(data[idx].recorded_at)}
        </SvgText>
      ))}
      <Path d={floorPath} fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 2" />
      <Path d={pricePath} fill="none" stroke="#16a34a" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={2} fill="#16a34a" />)}
    </Svg>
  )
}

export default function PriceModal({ country, onClose }: { country: ModalCountry | null; onClose: () => void }) {
  const [prices, setPrices] = useState<PricePoint[]>([])
  const [loading, setLoading] = useState(false)
  const [floorMode, setFloorMode] = useState<'current' | 'historical'>('historical')

  useEffect(() => {
    if (!country) return
    setLoading(true)
    setPrices([])
    supabase
      .from('price_history')
      .select('price, floor, recorded_at')
      .eq('country_id', country.id)
      .order('recorded_at', { ascending: true })
      .then(({ data }) => {
        setPrices((data ?? []) as PricePoint[])
        setLoading(false)
      })
  }, [country?.id])

  if (!country) return null

  const WC_START = new Date('2026-06-11T00:00:00Z')
  const wcAnchorIdx = prices.findIndex(p => new Date(p.recorded_at) >= WC_START)
  const windowStart = prices.length <= 10
    ? 0
    : wcAnchorIdx >= 0
      ? Math.min(prices.length - 10, wcAnchorIdx)
      : prices.length - 10
  const displayed = prices.slice(windowStart)
  const currentFloor = prices.length > 0 ? prices[prices.length - 1].floor : 5
  const prevPrice = prices.length >= 2 ? prices[prices.length - 2].price : null
  const firstPrice = displayed.length > 0 ? displayed[0].price : null
  const delta = prevPrice !== null ? country.current_price - prevPrice : null
  const pctPrev = prevPrice ? ((country.current_price - prevPrice) / prevPrice) * 100 : null
  const pctStart = firstPrice ? ((country.current_price - firstPrice) / firstPrice) * 100 : null

  const fmt = (n: number) => n.toFixed(2).replace('.', ',')
  const fmtPct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')}%`
  const pctColor = (n: number) => n === 0 ? '#9ca3af' : n > 0 ? '#16a34a' : '#dc2626'

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 }} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <FlagImage code={country.code} size={16} radius={2} />
              <Text style={{ fontWeight: '600', fontSize: 15, color: '#1f2937' }}>{country.name}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontWeight: '700', fontSize: 14, color: '#1f2937' }}>{fmt(country.current_price)}</Text>
              {delta !== null && (
                <Text style={{ fontSize: 11, fontWeight: '600', marginLeft: 4, color: pctColor(delta) }}>
                  ({delta >= 0 ? '+' : ''}{fmt(delta)})
                </Text>
              )}
            </View>
          </View>

          {/* % changes */}
          {(pctPrev !== null || pctStart !== null) && (
            <View style={{ marginBottom: 12, gap: 2 }}>
              {pctPrev !== null && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: pctColor(pctPrev) }}>{fmtPct(pctPrev)}</Text>
                  <Text style={{ fontSize: 11, color: '#9ca3af' }}>since last update</Text>
                </View>
              )}
              {pctStart !== null && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: pctColor(pctStart) }}>{fmtPct(pctStart)}</Text>
                  <Text style={{ fontSize: 11, color: '#9ca3af' }}>since start</Text>
                </View>
              )}
            </View>
          )}

          {/* Chart */}
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#f9fafb', paddingHorizontal: 8, paddingVertical: 12, alignItems: 'center' }}>
            {loading ? (
              <View style={{ height: 80, justifyContent: 'center' }}>
                <ActivityIndicator size="small" color="#9ca3af" />
              </View>
            ) : displayed.length < 2 ? (
              <View style={{ height: 80, justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, color: '#9ca3af' }}>Not enough history yet</Text>
              </View>
            ) : (
              <PriceChart data={displayed} floorMode={floorMode} />
            )}
          </View>

          {/* Floor legend */}
          {displayed.length >= 2 && (
            <Pressable
              onPress={() => setFloorMode(m => m === 'current' ? 'historical' : 'current')}
              style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Svg width={18} height={6} viewBox="0 0 18 6">
                <Line x1={0} y1={3} x2={18} y2={3} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 2" />
              </Svg>
              <Text style={{ fontSize: 11, color: '#d97706' }}>
                {floorMode === 'historical'
                  ? `minimum share price (currently ${fmt(currentFloor)})`
                  : `current minimum price (${fmt(currentFloor)})`}
              </Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}
