import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type ShareSourcePillProps = {
  loading: boolean;
  message: string;
};

export function ShareSourcePill({ loading, message }: ShareSourcePillProps) {
  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator color="#111318" size="small" />
      ) : (
        <View style={styles.iconShell}>
          <MaterialCommunityIcons name="lock-check-outline" size={15} color="#111318" />
        </View>
      )}
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#EFF6E8',
    borderColor: '#D5E5CC',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  iconShell: {
    alignItems: 'center',
    backgroundColor: '#B6FF3B',
    borderRadius: 9,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  text: {
    color: '#394034',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
});
