import { SvgUri } from 'react-native-svg'
import { View } from 'react-native'

export function FlagImage({ code, size = 14, radius = 2 }: { code: string; size?: number; radius?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', flexShrink: 0 }}>
      <SvgUri
        uri={`https://www.soccershares.nl/flags/${code.toLowerCase()}.svg`}
        width={size}
        height={size}
      />
    </View>
  )
}
