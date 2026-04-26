import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

const isIOS = Platform.OS === 'ios';

export default function NativeDashboard() {
  const pulse = useRef(new Animated.Value(0)).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const copy = isIOS ? iosCopy : androidCopy;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 380,
      useNativeDriver: true,
    }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1900,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [entrance, pulse]);

  const islandScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.04],
  });
  const glowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.42],
  });

  return (
    <SafeAreaView style={[styles.safeArea, isIOS ? styles.iosSafeArea : styles.androidSafeArea]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={{
            opacity: entrance,
            transform: [
              {
                translateY: entrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [14, 0],
                }),
              },
            ],
          }}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={[styles.backButton, isIOS ? styles.iosBackButton : styles.androidBackButton]}>
              <MaterialCommunityIcons name="chevron-left" size={22} color={isIOS ? '#FFFFFF' : '#101014'} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, isIOS ? styles.iosEyebrow : styles.androidEyebrow]}>{copy.eyebrow}</Text>
              <Text style={[styles.title, isIOS ? styles.iosTitle : styles.androidTitle]}>{copy.title}</Text>
            </View>
          </View>

          <LinearGradient
            colors={isIOS ? ['#050509', '#111827', '#1D4ED8'] : ['#E9F8EF', '#DDF7FF', '#FFF7ED']}
            style={[styles.hero, isIOS ? styles.iosHero : styles.androidHero]}>
            {isIOS ? (
              <Animated.View style={[styles.islandGlow, { opacity: glowOpacity, transform: [{ scale: islandScale }] }]} />
            ) : null}

            <Animated.View style={[isIOS ? styles.dynamicIsland : styles.androidWidget, { transform: [{ scale: islandScale }] }]}>
              <View style={styles.nativeIcon}>
                <MaterialCommunityIcons name={isIOS ? 'island' : 'widgets-outline'} size={20} color="#FFFFFF" />
              </View>
              <View style={styles.nativeCopy}>
              <Text style={[styles.nativeTitle, isIOS ? styles.iosNativeTitle : styles.androidNativeTitle]}>{copy.previewTitle}</Text>
              <Text style={[styles.nativeSubtitle, isIOS ? styles.iosNativeSubtitle : styles.androidNativeSubtitle]}>{copy.previewSubtitle}</Text>
              </View>
              <Text style={styles.nativeScore}>82</Text>
            </Animated.View>

            <Text style={[styles.heroText, isIOS ? styles.iosHeroText : styles.androidHeroText]}>{copy.hero}</Text>
          </LinearGradient>
        </Animated.View>

        <View style={styles.grid}>
          {copy.features.map((feature) => (
            <View key={feature.title} style={[styles.featureCard, isIOS ? styles.iosCard : styles.androidCard]}>
              <View style={[styles.featureIcon, { backgroundColor: feature.color }]}>
                <MaterialCommunityIcons name={feature.icon} size={20} color="#FFFFFF" />
              </View>
              <Text style={[styles.featureTitle, isIOS ? styles.iosFeatureTitle : styles.androidFeatureTitle]}>{feature.title}</Text>
              <Text style={[styles.featureBody, isIOS ? styles.iosFeatureBody : styles.androidFeatureBody]}>{feature.body}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.implementationPanel, isIOS ? styles.iosPanel : styles.androidPanel]}>
          <Text style={[styles.panelTitle, isIOS ? styles.iosPanelTitle : styles.androidPanelTitle]}>{copy.implementationTitle}</Text>
          {copy.steps.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <View style={styles.stepIndex}>
                <Text style={styles.stepIndexText}>{index + 1}</Text>
              </View>
              <Text style={[styles.stepText, isIOS ? styles.iosStepText : styles.androidStepText]}>{step}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const iosCopy = {
  eyebrow: 'Apple native experience',
  title: 'Widgets & Dynamic Island',
  previewTitle: 'Analyse en cours',
  previewSubtitle: 'Recherche de sources publiques',
  hero:
    'Sur iPhone, la vraie monétisation premium doit passer par Live Activities, Dynamic Island, widgets et une expérience calme proche des apps Apple.',
  implementationTitle: 'Préparation dev build',
  features: [
    {
      icon: 'island' as const,
      title: 'Dynamic Island',
      body: 'Etat interactif pour une analyse IA longue: progression, score final, bouton ouvrir.',
      color: '#111827',
    },
    {
      icon: 'widgets-outline' as const,
      title: 'Home Widgets',
      body: 'Widget “quota restant”, dernier score, et raccourci analyser une URL.',
      color: '#2563EB',
    },
    {
      icon: 'apple-ios' as const,
      title: 'Apple UX',
      body: 'Hiérarchie simple, surfaces translucides, actions natives et textes courts.',
      color: '#7C3AED',
    },
  ],
  steps: [
    'Créer un dev build EAS: Expo Go ne peut pas exécuter les extensions WidgetKit/Live Activities.',
    'Ajouter une extension WidgetKit Swift liée à un App Group partagé.',
    'Brancher ActivityKit pour pousser le statut d’analyse vers Dynamic Island.',
  ],
};

const androidCopy = {
  eyebrow: 'Android native experience',
  title: 'Widgets & Quick Actions',
  previewTitle: 'Bullshit Detector',
  previewSubtitle: 'Dernier score disponible',
  hero:
    'Sur Android, l’expérience doit être plus utilitaire: widgets configurables, raccourcis de partage, notifications d’analyse et surfaces Material.',
  implementationTitle: 'Préparation dev build',
  features: [
    {
      icon: 'widgets-outline' as const,
      title: 'Android Widgets',
      body: 'Widget quota, dernier verdict et raccourci presse-papier.',
      color: '#0F766E',
    },
    {
      icon: 'share-variant-outline' as const,
      title: 'Share Targets',
      body: 'Entrée native depuis réseaux sociaux avec URL ou texte partagé.',
      color: '#2563EB',
    },
    {
      icon: 'bell-ring-outline' as const,
      title: 'Notifications',
      body: 'Retour d’analyse en notification quand le traitement est long.',
      color: '#F59E0B',
    },
  ],
  steps: [
    'Créer un dev build EAS pour activer receivers, widgets et notifications natives.',
    'Ajouter un provider widget Android ou une intégration Glance côté natif.',
    'Relier les actions widget à /analyze avec deep links bullshitdetector://.',
  ],
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  iosSafeArea: {
    backgroundColor: '#050509',
  },
  androidSafeArea: {
    backgroundColor: '#F5FBF7',
  },
  content: {
    gap: 16,
    padding: 18,
    paddingBottom: 42,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: 16,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  iosBackButton: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  androidBackButton: {
    backgroundColor: '#DFF5E8',
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  iosEyebrow: {
    color: '#93C5FD',
  },
  androidEyebrow: {
    color: '#0F766E',
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 36,
  },
  iosTitle: {
    color: '#FFFFFF',
  },
  androidTitle: {
    color: '#102018',
  },
  hero: {
    borderRadius: 28,
    gap: 18,
    minHeight: 250,
    overflow: 'hidden',
    padding: 18,
  },
  iosHero: {
    borderColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
  },
  androidHero: {
    borderColor: '#B7E4C7',
    borderWidth: 1,
  },
  islandGlow: {
    alignSelf: 'center',
    backgroundColor: '#60A5FA',
    borderRadius: 90,
    height: 90,
    position: 'absolute',
    top: 28,
    width: 240,
  },
  dynamicIsland: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#030712',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 34,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 70,
    paddingHorizontal: 14,
    width: '92%',
  },
  androidWidget: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#B7E4C7',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 96,
    padding: 16,
    width: '92%',
  },
  nativeIcon: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 18,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  nativeCopy: {
    flex: 1,
    gap: 2,
  },
  nativeTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  iosNativeTitle: {
    color: '#FFFFFF',
  },
  androidNativeTitle: {
    color: '#102018',
  },
  nativeSubtitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  iosNativeSubtitle: {
    color: '#CBD5E1',
  },
  androidNativeSubtitle: {
    color: '#426455',
  },
  nativeScore: {
    color: '#67E8F9',
    fontSize: 22,
    fontWeight: '900',
  },
  heroText: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 23,
    marginTop: 'auto',
  },
  iosHeroText: {
    color: '#E5E7EB',
  },
  androidHeroText: {
    color: '#164E35',
  },
  grid: {
    gap: 12,
  },
  featureCard: {
    borderRadius: 20,
    gap: 8,
    padding: 16,
  },
  iosCard: {
    backgroundColor: '#111827',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
  },
  androidCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CDEDDD',
    borderWidth: 1,
  },
  featureIcon: {
    alignItems: 'center',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  featureTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  iosFeatureTitle: {
    color: '#FFFFFF',
  },
  androidFeatureTitle: {
    color: '#101014',
  },
  featureBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  iosFeatureBody: {
    color: '#CBD5E1',
  },
  androidFeatureBody: {
    color: '#64748B',
  },
  implementationPanel: {
    borderRadius: 22,
    gap: 12,
    padding: 16,
  },
  iosPanel: {
    backgroundColor: '#0F172A',
  },
  androidPanel: {
    backgroundColor: '#E9F8EF',
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  iosPanelTitle: {
    color: '#FFFFFF',
  },
  androidPanelTitle: {
    color: '#101014',
  },
  stepRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  stepIndex: {
    alignItems: 'center',
    backgroundColor: '#101014',
    borderRadius: 12,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  stepIndexText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  iosStepText: {
    color: '#D1D5DB',
  },
  androidStepText: {
    color: '#334155',
  },
});
