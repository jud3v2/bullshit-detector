# Billing Strategy

Bullshit Detector vend des fonctionnalites numeriques consommees dans l'app: analyses IA premium, credits, limites plus hautes et outils avances.

## Recommandation MVP

Utiliser les abonnements natifs Apple / Google pour l'application mobile.

Stripe reste utile pour:

- une future offre web;
- les comptes B2B ou factures manuelles;
- les webhooks internes et la reconciliation;
- les plans admin/pro hors achat in-app si l'achat n'est pas initie dans l'app mobile.

## Pourquoi

Apple demande l'in-app purchase pour debloquer des fonctionnalites ou contenus dans l'app. Google Play demande aussi son systeme de billing pour les achats in-app de biens ou services numeriques, sauf exceptions/reglementations locales.

Le modele le plus robuste:

1. L'app mobile achete via Apple/Google.
2. Un backend ou une Edge Function valide le recu.
3. Supabase stocke l'abonnement et les droits.
4. L'app lit uniquement les droits utilisateur et les credits visibles.
5. Les couts internes IA restent cote admin.

## Plans proposes

- Free: analyses manuelles limitees, pas d'IA avancee.
- Plus 2,99 EUR: credits IA visibles sous forme de pourcentage/credits.
- Max 4,99 EUR: plus de credits, historique enrichi, analyses plus detaillees.
- Pro 20 EUR: limite environ 20x le plan entree, priorite et outils avancés.

## Principe important

Ne jamais baser l'acces premium uniquement sur un etat local. L'app peut afficher un etat optimiste, mais Supabase doit rester la source de verite apres validation store.
