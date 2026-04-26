import type { Language } from './i18n';

export type RiskLevel = 'faible' | 'moyen' | 'eleve';

type LocalizedText = Record<Language, string>;

export type DetectionSignal = {
  id: string;
  label: LocalizedText;
  details: LocalizedText;
  weight: number;
  pattern: RegExp;
};

export type DetectionResult = {
  score: number;
  risk: RiskLevel;
  explanation: string;
  redFlags: string[];
  suggestion: string;
  debug: DetectionDebug;
};

export type DetectionDebug = {
  analyzedCharacters: number;
  matchedSignals: {
    id: string;
    label: string;
    weight: number;
    matchedText: string;
  }[];
  penalties: {
    matchedSignals: number;
    urlOnly: number;
    upperCasePressure: number;
    excessivePunctuation: number;
    lengthAdjustment: number;
    total: number;
  };
  inputPreview: string;
};

const MAX_ANALYSIS_LENGTH = 5000;
const URL_ONLY_PATTERN = /^(https?:\/\/[^\s]+|www\.[^\s]+)$/i;

const signals: DetectionSignal[] = [
  {
    id: 'urgency',
    label: { en: 'Artificial urgency or pressure', fr: 'Pression ou urgence artificielle' },
    details: {
      en: 'The text pushes the user to act quickly, which reduces time for verification.',
      fr: 'Le texte pousse a agir vite, ce qui reduit le temps de verification.',
    },
    weight: 18,
    pattern: /\b(urgent|quick|immediately|last chance|expires?|24h|48h|now|act now|limited time|vite|immediatement|dernier(?:e)? chance|expire|maintenant|ne ratez pas|avant minuit)\b/i,
  },
  {
    id: 'money',
    label: { en: 'Very strong financial promise', fr: 'Promesse financiere tres forte' },
    details: {
      en: 'Easy, guaranteed, or risk-free income promises are often exaggerated.',
      fr: 'Les promesses de gains faciles ou garantis sont souvent surestimees.',
    },
    weight: 25,
    pattern: /\b(earn|passive income|x\d+|100 ?%|guaranteed income|no risk|double your|easy money|profit|gagnez|revenu passif|revenu garanti|garanti sans risque|doublez|argent facile)\b/i,
  },
  {
    id: 'credentials',
    label: { en: 'Sensitive information request', fr: "Demande d'informations sensibles" },
    details: {
      en: 'The text asks for personal, banking, or login information.',
      fr: 'Le texte demande des donnees personnelles, bancaires ou de connexion.',
    },
    weight: 28,
    pattern: /\b(password|bank code|iban|credit card|credentials?|verify your account|confirm your account|login|account security|mot de passe|code bancaire|carte bancaire|identifiants?|verification de compte|confirmez votre compte|securite de votre compte)\b/i,
  },
  {
    id: 'link',
    label: { en: 'External link or action to verify', fr: 'Lien ou action externe a verifier' },
    details: {
      en: 'A short link or unknown URL should be checked separately.',
      fr: 'Un lien court ou une URL inconnue merite une verification separee.',
    },
    weight: 14,
    pattern: /\b(bit\.ly|t\.co|tinyurl|click here|cliquez ici|lien en bio|link in bio)\b/i,
  },
  {
    id: 'absolute',
    label: { en: 'Absolute claims', fr: 'Affirmations absolues' },
    details: {
      en: 'Extreme wording can hide missing nuance or missing evidence.',
      fr: 'Les formulations extremes peuvent masquer un manque de nuance ou de preuves.',
    },
    weight: 12,
    pattern: /\b(always|never|100 ?% proven|secret|truth nobody tells|miracle solution|revolutionary|toujours|jamais|prouve a 100 ?%|la verite que personne ne dit|solution miracle|revolutionnaire)\b/i,
  },
  {
    id: 'fear',
    label: { en: 'Fear or anger manipulation', fr: 'Manipulation par la peur ou la colere' },
    details: {
      en: 'The text tries to trigger a strong emotional reaction.',
      fr: 'Le texte cherche a provoquer une reaction emotionnelle forte.',
    },
    weight: 16,
    pattern: /\b(scandal|betrayal|imminent danger|deadly danger|threat|disaster|they are lying|wake up|shameful|enemy|scandale|trahison|danger imminent|danger mortel|menace|catastrophe|ils vous mentent|reveil|honteux|ennemi)\b/i,
  },
  {
    id: 'proof',
    label: { en: 'Weak evidence', fr: 'Peu de preuves concretes' },
    details: {
      en: 'The text makes a claim without a verifiable source, number, or context.',
      fr: 'Le texte avance une conclusion sans source, chiffre verifiable ou contexte.',
    },
    weight: 12,
    pattern: /\b(experts say|sources say|everyone knows|trust me|hidden proof|selon des experts|des sources disent|tout le monde sait|on m'a dit|croyez-moi|preuve cachee)\b/i,
  },
  {
    id: 'sales',
    label: { en: 'Exaggerated commercial promise', fr: 'Promesse commerciale exageree' },
    details: {
      en: 'The message sells a strong result with few conditions or limits.',
      fr: 'Le message vend un resultat fort avec peu de conditions ou de limites.',
    },
    weight: 14,
    pattern: /\b(guaranteed results|no effort|exclusive offer|limited spots|transform your life|secret formula|best on the market|resultats garantis|sans effort|offre exclusive|places limitees|transformez votre vie|formule secrete|meilleur du marche)\b/i,
  },
  {
    id: 'sensational',
    label: { en: 'Sensational framing', fr: 'Formulation sensationnaliste' },
    details: {
      en: 'The post uses attention-grabbing wording; this is not proof of falsehood, but it deserves context.',
      fr: 'Le post utilise une formulation tres accrocheuse; ce n’est pas une preuve de faussete, mais cela demande du contexte.',
    },
    weight: 8,
    pattern: /\b(incredible|unbelievable|shocking|insane|you won't believe|incroyable|hallucinant|choquant|dingue|vous n'allez pas croire)\b/i,
  },
  {
    id: 'missing-public-context',
    label: { en: 'Insufficient public context', fr: 'Contexte public insuffisant' },
    details: {
      en: 'The post or comments are not accessible enough to make a strong conclusion.',
      fr: 'Le contenu du post ou des commentaires n’est pas assez accessible pour conclure fortement.',
    },
    weight: 8,
    pattern: /\b(public content was not|no usable public content|could not retrieve|comments unavailable|contenu public non accessible|aucun contenu public exploitable|impossible de recuperer|commentaires non accessibles)\b/i,
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getRisk(score: number): RiskLevel {
  if (score >= 75) {
    return 'faible';
  }

  if (score >= 45) {
    return 'moyen';
  }

  return 'eleve';
}

function getSuggestion(risk: RiskLevel, hasLinks: boolean, language: Language) {
  if (language === 'fr') {
    if (risk === 'faible') {
      return 'Le texte semble plutot fiable, mais verifiez la source si une decision importante depend de ce message.';
    }

    if (risk === 'moyen') {
      return hasLinks
        ? 'Ne cliquez pas tout de suite. Cherchez la source officielle, comparez les informations et demandez une preuve claire.'
        : 'Demandez une source, un exemple verifiable ou des conditions precises avant de croire ou de repondre.';
    }

    return 'Ne donnez aucune information personnelle. Verifiez via un canal officiel et repondez seulement apres confirmation independante.';
  }

  if (risk === 'faible') {
    return 'The text looks relatively reliable, but verify the source if an important decision depends on it.';
  }

  if (risk === 'moyen') {
    return hasLinks
      ? 'Do not click immediately. Find the official source, compare the information, and ask for clear evidence.'
      : 'Ask for a source, a verifiable example, or precise conditions before trusting or replying.';
  }

  return 'Do not share personal information. Verify through an official channel and reply only after independent confirmation.';
}

export function analyzeBullshit(input: string, language: Language = 'en'): DetectionResult {
  const text = input.trim().slice(0, MAX_ANALYSIS_LENGTH);

  if (!text) {
    return {
      score: 50,
      risk: 'moyen',
      explanation:
        language === 'fr'
          ? "Aucun contenu n'a ete fourni. L'app ne peut pas evaluer la fiabilite sans texte a analyser."
          : 'No content was provided. The app cannot evaluate reliability without text to analyze.',
      redFlags: [
        language === 'fr'
          ? "Texte vide ou uniquement compose d'espaces."
          : 'Empty text or whitespace-only content.',
      ],
      suggestion:
        language === 'fr'
          ? "Collez le message complet, avec le contexte si possible, puis relancez l'analyse."
          : 'Paste the full message, with context if possible, then run the analysis again.',
      debug: {
        analyzedCharacters: 0,
        matchedSignals: [],
        penalties: {
          matchedSignals: 0,
          urlOnly: 0,
          upperCasePressure: 0,
          excessivePunctuation: 0,
          lengthAdjustment: 0,
          total: 0,
        },
        inputPreview: '',
      },
    };
  }

  const matchedSignals = signals.filter((signal) => signal.pattern.test(text));
  const urlOnly = URL_ONLY_PATTERN.test(text);
  const upperCasePressure =
    text.length > 80 && text.replace(/[^A-Z]/g, '').length / Math.max(text.replace(/[^A-Za-z]/g, '').length, 1) > 0.28;
  const excessivePunctuation = /(!{2,}|\?{2,})/.test(text);

  const matchedSignalsPenalty = matchedSignals.reduce((total, signal) => total + signal.weight, 0);
  const urlOnlyPenalty = urlOnly ? 28 : 0;
  const upperCasePressurePenalty = upperCasePressure ? 8 : 0;
  const excessivePunctuationPenalty = excessivePunctuation ? 6 : 0;
  const lengthAdjustment = text.length < 60 ? 6 : 0;
  const penalty =
    matchedSignalsPenalty +
    urlOnlyPenalty +
    upperCasePressurePenalty +
    excessivePunctuationPenalty +
    lengthAdjustment;
  const score = clamp(100 - penalty, 0, 100);
  const risk = getRisk(score);

  const redFlags = matchedSignals.map((signal) => `${signal.label[language]}: ${signal.details[language]}`);

  if (upperCasePressure) {
    redFlags.push(
      language === 'fr'
        ? 'Ton tres appuye: beaucoup de majuscules peuvent signaler une pression emotionnelle.'
        : 'Very intense tone: many capital letters can signal emotional pressure.',
    );
  }

  if (excessivePunctuation) {
    redFlags.push(
      language === 'fr'
        ? "Ponctuation insistante: le texte utilise plusieurs points d'exclamation ou d'interrogation."
        : 'Insistent punctuation: the text uses repeated exclamation or question marks.',
    );
  }

  if (urlOnly) {
    redFlags.push(
      language === 'fr'
        ? 'URL seule: le lien peut etre utile, mais il ne suffit pas a verifier le contexte ou la fiabilite.'
        : 'URL only: the link may help, but it is not enough to verify context or reliability.',
    );
  }

  if (redFlags.length === 0) {
    redFlags.push(
      language === 'fr'
        ? 'Aucun signal fort detecte dans ce texte. La source reste a verifier si le sujet est important.'
        : 'No strong signal detected in this text. The source should still be checked if the topic matters.',
    );
  }

  return {
    score,
    risk,
    explanation:
      language === 'fr'
        ? risk === 'faible'
          ? 'Le message contient peu de signaux suspects. Il reste prudent de verifier la source et le contexte.'
          : risk === 'moyen'
            ? 'Le message contient plusieurs signaux qui meritent une verification avant de faire confiance.'
            : "Le message accumule des signaux de manipulation, d'arnaque ou de promesse difficile a prouver."
        : risk === 'faible'
          ? 'The message contains few suspicious signals. It is still worth checking the source and context.'
          : risk === 'moyen'
            ? 'The message contains several signals that should be verified before trusting it.'
            : 'The message combines signals of manipulation, scam risk, or hard-to-prove promises.',
    redFlags,
    suggestion: getSuggestion(risk, matchedSignals.some((signal) => signal.id === 'link'), language),
    debug: {
      analyzedCharacters: text.length,
      matchedSignals: matchedSignals.map((signal) => ({
        id: signal.id,
        label: signal.label[language],
        weight: signal.weight,
        matchedText: text.match(signal.pattern)?.[0] ?? '',
      })),
      penalties: {
        matchedSignals: matchedSignalsPenalty,
        urlOnly: urlOnlyPenalty,
        upperCasePressure: upperCasePressurePenalty,
        excessivePunctuation: excessivePunctuationPenalty,
        lengthAdjustment,
        total: penalty,
      },
      inputPreview: text.slice(0, 900),
    },
  };
}
