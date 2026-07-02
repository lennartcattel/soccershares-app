import { LinearGradient } from 'expo-linear-gradient'
import { useState } from 'react'
import { LayoutChangeEvent, Text, View } from 'react-native'
import { useCurrency } from '@/lib/currency'

type Props = {
  total: number
  sharesValue: number
  balance: number
  investmentPnl?: number
  predictionIncome?: number
  showSubtitles?: boolean
}

export default function PortfolioBanner({
  total, sharesValue, balance, investmentPnl = 0, predictionIncome = 0, showSubtitles = false
}: Props) {
  const { format } = useCurrency()
  const [dims, setDims] = useState({ w: 343, h: 70 })

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width > 0 && height > 0) setDims({ w: width, h: height })
  }

  // Match CSS bg-gradient-to-br: end point at ((W+H)/2, (W+H)/2) in pixel space
  // gives top-right=W/(W+H) and bottom-left=H/(W+H) — same as the CSS magic-corner algorithm
  const s = dims.w + dims.h
  const endX = s / (2 * dims.w)
  const endY = s / (2 * dims.h)

  return (
    <View
      onLayout={onLayout}
      style={{ borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 1, elevation: 1 }}
    >
      <LinearGradient
        colors={['#3a6b1c', '#6baa28']}
        start={{ x: 0, y: 0 }}
        end={{ x: endX, y: endY }}
        style={{ borderRadius: 12, overflow: 'hidden' }}
      >
        <View className="flex-row">
          <View className="flex-1 items-center p-4">
            <Text className="text-xs opacity-70 text-white">Total</Text>
            <Text className="mt-1 text-lg font-bold text-white">{format(total)}</Text>
          </View>
          <View className="self-center w-px h-10 bg-white/20" />
          <View className="flex-1 items-center p-4">
            <Text className="text-xs opacity-70 text-white">Shares</Text>
            <Text className="mt-1 text-lg font-bold text-white">{format(sharesValue)}</Text>
            {showSubtitles && (
              <Text className="mt-0.5 text-xs opacity-60 text-white text-center">
                {format(Math.abs(investmentPnl))} {investmentPnl >= 0 ? 'profit' : 'loss'} on shares
              </Text>
            )}
          </View>
          <View className="self-center w-px h-10 bg-white/20" />
          <View className="flex-1 items-center p-4">
            <Text className="text-xs opacity-70 text-white">Cash</Text>
            <Text className="mt-1 text-lg font-bold text-white">{format(balance)}</Text>
            {showSubtitles && (
              <Text className="mt-0.5 text-xs opacity-60 text-white text-center">
                {Math.round(predictionIncome).toLocaleString('nl-NL')} earned with predictions
              </Text>
            )}
          </View>
        </View>
      </LinearGradient>
    </View>
  )
}
