import { Text, View } from 'react-native'

type Props = {
  marketOpen: boolean
  lastUpdated: string | null
}

export default function MarketStatus({ marketOpen, lastUpdated }: Props) {
  return (
    <View className="flex flex-col gap-1">
      <View className="flex-row items-center gap-1">
        <Text className="text-sm font-semibold uppercase tracking-wide text-gray-700">
          Market status:
        </Text>
        <Text className={`text-sm font-semibold ${marketOpen ? 'text-green-600' : 'text-red-600'}`}>
          {marketOpen ? 'OPEN' : 'CLOSED'}
        </Text>
      </View>
      {lastUpdated && (
        <Text className="text-xs text-gray-400">Last update: {lastUpdated}</Text>
      )}
    </View>
  )
}