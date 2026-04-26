const appJson = require('./app.json');

const sharingPluginName = 'expo-sharing';

function isSharingPlugin(plugin) {
  return plugin === sharingPluginName || (Array.isArray(plugin) && plugin[0] === sharingPluginName);
}

module.exports = () => {
  const config = appJson.expo;
  const rawBackendUrl = process.env.EXPO_PUBLIC_BD_BACKEND_URL ?? process.env.BD_BACKEND_URL ?? '';
  const directGatewayEnabled = process.env.EXPO_PUBLIC_AI_GATEWAY_DIRECT === '1';
  const extra = {
    ...config.extra,
    backendUrl: directGatewayEnabled ? '' : rawBackendUrl,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey:
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    aiGatewayDirect: directGatewayEnabled,
    aiGatewayApiKey: directGatewayEnabled ? process.env.EXPO_PUBLIC_AI_GATEWAY_API_KEY ?? '' : '',
    aiGatewayResearchModel:
      process.env.EXPO_PUBLIC_AI_GATEWAY_RESEARCH_MODEL ?? 'google/gemini-2.5-flash-lite',
    aiGatewayAnalysisModel:
      process.env.EXPO_PUBLIC_AI_GATEWAY_ANALYSIS_MODEL ?? 'google/gemini-2.5-flash-lite',
  };

  if (process.env.EXPO_GO_PREVIEW === '1') {
    return {
      ...config,
      extra,
      plugins: config.plugins.filter((plugin) => plugin === 'expo-router' && !isSharingPlugin(plugin)),
      experiments: {
        ...config.experiments,
        reactCompiler: false,
      },
    };
  }

  return {
    ...config,
    extra,
  };
};
