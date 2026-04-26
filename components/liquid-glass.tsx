import { type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type GlassTone = 'light' | 'dark' | 'danger' | 'success' | 'warning';

type LiquidGlassProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  tone?: GlassTone;
  intensity?: number;
};

type LiquidGlassButtonProps = PressableProps & {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  subtitle?: string;
  tone?: GlassTone;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const toneColors: Record<GlassTone, { edge: string; fill: string; icon: string; text: string }> = {
  light: {
    edge: 'rgba(255,255,255,0.62)',
    fill: 'rgba(255,255,255,0.28)',
    icon: '#0F172A',
    text: '#101014',
  },
  dark: {
    edge: 'rgba(255,255,255,0.26)',
    fill: 'rgba(15,23,42,0.42)',
    icon: '#FFFFFF',
    text: '#FFFFFF',
  },
  danger: {
    edge: 'rgba(255,255,255,0.52)',
    fill: 'rgba(229,72,77,0.20)',
    icon: '#E5484D',
    text: '#101014',
  },
  success: {
    edge: 'rgba(255,255,255,0.52)',
    fill: 'rgba(17,163,106,0.18)',
    icon: '#11A36A',
    text: '#101014',
  },
  warning: {
    edge: 'rgba(255,255,255,0.52)',
    fill: 'rgba(245,158,11,0.18)',
    icon: '#D97706',
    text: '#101014',
  },
};

export function LiquidGlass({ children, contentStyle, intensity = 58, style, tone = 'light' }: LiquidGlassProps) {
  const colors = toneColors[tone];

  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={intensity} tint={tone === 'dark' ? 'dark' : 'light'} style={[styles.glass, style]}>
        <LinearGradient
          pointerEvents="none"
          colors={[
            tone === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.72)',
            colors.fill,
            tone === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.20)',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={[styles.glassHairline, { borderColor: colors.edge }]} />
        <View style={[styles.glassContent, contentStyle]}>{children}</View>
      </BlurView>
    );
  }

  return (
    <View
      style={[
        styles.androidSurface,
        {
          backgroundColor: tone === 'dark' ? '#111827' : '#FFFFFF',
          borderColor: tone === 'dark' ? 'rgba(148,163,184,0.28)' : '#D8E0EB',
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function LiquidGlassButton({
  disabled,
  icon,
  label,
  subtitle,
  style,
  textStyle,
  tone = 'light',
  ...props
}: LiquidGlassButtonProps) {
  const colors = toneColors[tone];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        Platform.OS === 'android' && styles.androidButton,
        {
          opacity: disabled ? 0.55 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
      {...props}>
      <LiquidGlass tone={tone} intensity={42} style={StyleSheet.absoluteFill} />
      <View style={styles.buttonContent}>
        {icon ? (
          <View style={[styles.buttonIcon, { backgroundColor: colors.fill }]}>
            <MaterialCommunityIcons name={icon} size={19} color={colors.icon} />
          </View>
        ) : null}
        <View style={styles.buttonCopy}>
          <Text style={[styles.buttonLabel, { color: colors.text }, textStyle]}>{label}</Text>
          {subtitle ? <Text style={[styles.buttonSubtitle, { color: tone === 'dark' ? '#CBD5E1' : '#64748B' }]}>{subtitle}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

export function LiquidMetric({ label, value, tone = 'light' }: { label: string; value: string; tone?: GlassTone }) {
  const colors = toneColors[tone];

  return (
    <LiquidGlass tone={tone} intensity={36} style={styles.metric}>
      <Text style={[styles.metricLabel, { color: tone === 'dark' ? '#CBD5E1' : '#64748B' }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
    </LiquidGlass>
  );
}

export function isLiquidGlassPlatform() {
  return Platform.OS === 'ios';
}

const styles = StyleSheet.create({
  glass: {
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
  },
  glassHairline: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    borderWidth: 1,
  },
  glassContent: {
    flex: 1,
  },
  androidSurface: {
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  button: {
    borderRadius: 20,
    minHeight: 58,
    overflow: 'hidden',
  },
  androidButton: {
    backgroundColor: '#FFFFFF',
  },
  buttonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonIcon: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.34)',
    borderRadius: 14,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  buttonCopy: {
    flex: 1,
    gap: 2,
  },
  buttonLabel: {
    fontSize: 14,
    fontWeight: '900',
  },
  buttonSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  metric: {
    flex: 1,
    minHeight: 64,
    padding: 10,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
});
