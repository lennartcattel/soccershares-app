import { theme } from '@/constants/theme'
import { StyleSheet, Text, View } from 'react-native'

export default function Predictions() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Predictions</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  title: { fontSize: 22, fontWeight: '600', color: theme.colors.text },
})