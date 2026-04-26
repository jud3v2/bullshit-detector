export type Language = 'en' | 'fr';

type TranslationKey =
  | 'localNotice'
  | 'sharedEmpty'
  | 'sharedUnavailable'
  | 'sharedReceived'
  | 'ready'
  | 'urlFetched'
  | 'urlLimited'
  | 'manualNotice'
  | 'eyebrow'
  | 'subtitle'
  | 'inputLabel'
  | 'characters'
  | 'placeholder'
  | 'example'
  | 'analyze'
  | 'analyzingUrl'
  | 'reliabilityScore'
  | 'riskLow'
  | 'riskMedium'
  | 'riskHigh'
  | 'comments'
  | 'redFlags'
  | 'suggestion'
  | 'emptyResult'
  | 'privacyTag'
  | 'urlMode'
  | 'combinedMode'
  | 'textMode'
  | 'supportedTargets'
  | 'scoreHint'
  | 'emptyTitle';

export const translations: Record<Language, Record<TranslationKey, string>> = {
  en: {
    localNotice: 'Use Share from TikTok, Instagram, X, Reddit, Leboncoin, or paste a social URL.',
    sharedEmpty: 'Share received, but no usable text or link was found. Use the manual field.',
    sharedUnavailable: 'Native sharing is unavailable here. Paste the text or link manually.',
    sharedReceived: 'via native share. Analysis generated automatically.',
    ready: 'Ready',
    urlFetched: 'public content retrieved. Comments depend on what the platform exposes.',
    urlLimited: 'limited analysis, public content was not automatically accessible.',
    manualNotice: 'Local analysis of the provided text. No user content is stored.',
    eyebrow: 'Local analysis - no user data stored',
    subtitle:
      'Share a suspicious post to the app, or paste only its URL. The score helps evaluate manipulation signals, but it is not definitive proof.',
    inputLabel: 'Text or social URL',
    characters: 'characters',
    placeholder: 'Paste a TikTok, Instagram, X, Reddit, YouTube Shorts, Leboncoin URL... or the text of a post.',
    example: 'Example',
    analyze: 'Analyze',
    analyzingUrl: 'Analyzing URL...',
    reliabilityScore: 'Reliability score',
    riskLow: 'Low risk',
    riskMedium: 'Medium risk',
    riskHigh: 'High risk',
    comments: 'Comments',
    redFlags: 'Red flags',
    suggestion: 'Suggestion',
    emptyResult: 'The analysis will appear here with a score, risk level, and verification suggestions.',
    privacyTag: 'Private by design',
    urlMode: 'URL mode',
    combinedMode: 'Combined mode',
    textMode: 'Text mode',
    supportedTargets: 'TikTok, Instagram, X, Reddit, YouTube Shorts, Leboncoin',
    scoreHint: 'Higher score means fewer suspicious signals.',
    emptyTitle: 'Awaiting signal',
  },
  fr: {
    localNotice: 'Utilisez Partager depuis TikTok, Instagram, X, Reddit, Leboncoin, ou collez une URL sociale.',
    sharedEmpty: 'Partage recu, mais aucun texte ou lien exploitable. Utilisez le champ manuel.',
    sharedUnavailable: 'Le partage natif est indisponible ici. Collez le texte ou le lien manuellement.',
    sharedReceived: 'via partage natif. Analyse generee automatiquement.',
    ready: 'Pret',
    urlFetched: 'contenu public recupere. Les commentaires dependent de ce que la plateforme expose.',
    urlLimited: 'analyse limitee, contenu public non accessible automatiquement.',
    manualNotice: 'Analyse locale du texte fourni. Aucun contenu utilisateur n’est stocke.',
    eyebrow: 'Analyse locale - aucune donnee stockee',
    subtitle:
      'Partagez une publication suspecte vers l’app, ou collez seulement son URL. Le score aide a evaluer les signaux de manipulation, mais ne prouve pas la verite absolue.',
    inputLabel: 'Texte ou URL sociale',
    characters: 'caracteres',
    placeholder: 'Collez une URL TikTok, Instagram, X, Reddit, YouTube Shorts, Leboncoin... ou le texte d’un post.',
    example: 'Exemple',
    analyze: 'Analyser',
    analyzingUrl: 'Analyse de l’URL...',
    reliabilityScore: 'Score de fiabilite',
    riskLow: 'Risque faible',
    riskMedium: 'Risque moyen',
    riskHigh: 'Risque eleve',
    comments: 'Commentaires',
    redFlags: 'Red flags',
    suggestion: 'Suggestion',
    emptyResult: 'L’analyse apparaitra ici avec un score, une categorie de risque et des pistes de verification.',
    privacyTag: 'Prive par defaut',
    urlMode: 'Mode URL',
    combinedMode: 'Mode combine',
    textMode: 'Mode texte',
    supportedTargets: 'TikTok, Instagram, X, Reddit, YouTube Shorts, Leboncoin',
    scoreHint: 'Plus le score est haut, moins les signaux suspects sont forts.',
    emptyTitle: 'Signal en attente',
  },
};

export const examplesByLanguage: Record<Language, string[]> = {
  en: [
    'Your bank account will be blocked in 24h. Click here to confirm your password.',
    'Our method guarantees $10,000 per month with no effort and no risk.',
    'Hi, can you confirm tomorrow’s meeting time? Thanks.',
  ],
  fr: [
    'Votre compte bancaire va etre bloque dans 24h. Cliquez ici pour confirmer votre mot de passe.',
    'Notre methode garantit 10 000 euros par mois sans effort et sans risque.',
    'Salut, peux-tu me confirmer l’heure du rendez-vous demain ?',
  ],
};
