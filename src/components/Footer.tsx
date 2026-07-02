import { Linking, Pressable, Text, View } from 'react-native'

export default function Footer() {
  return (
    <View style={{ paddingVertical: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
      <Text style={{ fontSize: 11, color: '#9ca3af' }}>© SoccerShares 2010 – 2026. All rights reserved.</Text>
      <Text style={{ fontSize: 11, color: '#9ca3af' }}>|</Text>
      <Pressable onPress={() => Linking.openURL('mailto:info@soccershares.nl?subject=SoccerShares')}>
        <Text style={{ fontSize: 11, color: '#9ca3af' }}>Contact us</Text>
      </Pressable>
    </View>
  )
}
