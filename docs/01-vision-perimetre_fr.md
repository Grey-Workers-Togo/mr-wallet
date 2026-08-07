# 01 — Vision & périmètre

## 1. Problème

Les particuliers qui veulent piloter leurs finances se heurtent à trois obstacles :

1. **La donnée est éclatée** : plusieurs comptes bancaires, du mobile money, des espèces, une carte de crédit. Aucune vue consolidée.
2. **Les outils existants sont soit trop simples, soit trop lourds** : les applications de suivi de dépenses ignorent les dettes et le patrimoine ; les tableurs personnels deviennent ingérables au bout de quelques mois.
3. **Les dettes sont mal modélisées** : la plupart des applications traitent un crédit comme une dépense récurrente, ce qui empêche de voir le capital restant dû, le coût total des intérêts, ou l'effet d'un remboursement anticipé.

## 2. Proposition de valeur

Une application qui répond à quatre questions, dans cet ordre :

1. **Où va mon argent ?** — suivi et catégorisation des dépenses, sur tous les comptes.
2. **Est-ce que je respecte mon plan ?** — budgets par catégorie, alertes de dépassement.
3. **Où j'en suis vraiment ?** — patrimoine net = ce que je possède moins ce que je dois.
4. **Où je vais ?** — prévisions de trésorerie et simulation de scénarios.

## 3. Objectifs produit

| Objectif | Mesure de succès |
|---|---|
| Saisir ou importer un mois de transactions en moins de 10 minutes | Import d'un relevé de 200 lignes en < 2 min, dont mapping |
| Savoir en un coup d'œil si le mois dérape | Tableau de bord lisible sans scroll sur la question « reste à dépenser » |
| Ne jamais perdre une donnée saisie | Soft delete + journal d'audit + export intégral à tout moment |
| Faire confiance aux chiffres | Aucune erreur d'arrondi ; totaux réconciliables ligne à ligne |
| Sortir de l'application sans friction | Export CSV/Excel complet, sans perte d'information |

## 4. Non-objectifs (explicites)

Ces points sont **hors périmètre**, et ce n'est pas un oubli :

- **Offline-first.** Application connectée. Décision prise pour éviter le chantier du moteur de synchronisation et de la résolution de conflits multi-appareils.
- **Connecteurs vers des services tiers** (banques, Gozem, Deliveroo, agrégateurs). Ces accès nécessitent des partenariats commerciaux, pas un simple flux OAuth. L'ingestion passe par import de fichier.
- **API de taux de change payante en dépendance dure.** Voir `08-devises.md`.
- **Comptabilité d'entreprise** : pas de TVA, pas de plan comptable, pas de facturation, pas de rapprochement bancaire réglementaire.
- **Investissements et portefeuille titres** (cours en temps réel, plus-values). Envisageable en V3, hors MVP.
- **Conseil financier automatisé.** L'application montre des chiffres et des projections ; elle ne recommande pas de placements ni de décisions financières.
- **Multi-utilisateur collaboratif** (budget de foyer partagé). Envisagé en V3 ; le modèle de données doit le rendre possible sans refonte, mais rien n'est implémenté avant.

## 5. Personas

### Persona A — « Awa », 29 ans, salariée, Cotonou

Compte bancaire + mobile money + espèces. Reçoit un salaire mensuel fixe, rembourse un crédit auto. Veut arrêter de finir le mois à découvert et savoir quand son crédit sera soldé.

**Besoins clés :** comptes multiples, budget mensuel avec alertes, échéancier de dette, transactions récurrentes.

### Persona B — « Marc », 41 ans, indépendant, revenus irréguliers

Revenus variables d'un mois sur l'autre, plusieurs devises (EUR et XOF), doit lisser sa trésorerie et provisionner. Exporte tout vers son comptable une fois par an.

**Besoins clés :** prévisions de trésorerie, multi-devises, export complet, catégorisation fine.

### Persona C — « Fatou », 24 ans, étudiante

Peu de transactions, principalement en espèces et mobile money. Objectif : épargner pour un projet précis.

**Besoins clés :** saisie manuelle rapide, objectif d'épargne avec progression, simplicité.

## 6. Cas d'usage principaux

| ID | Cas d'usage | Persona | Priorité |
|---|---|---|---|
| UC-01 | Créer ses comptes et saisir les soldes d'ouverture | Tous | MVP |
| UC-02 | Saisir manuellement une dépense en moins de 15 secondes | C | MVP |
| UC-03 | Importer un relevé CSV/Excel et mapper ses colonnes | A, B | MVP |
| UC-04 | Réimporter un relevé chevauchant sans créer de doublons | A, B | MVP |
| UC-05 | Définir un budget mensuel par catégorie et être alerté à 80 % et 100 % | A | MVP |
| UC-06 | Déclarer une dette avec taux et durée, voir l'échéancier généré | A | MVP |
| UC-07 | Enregistrer un remboursement et voir le capital restant dû baisser | A | MVP |
| UC-08 | Consulter le patrimoine net et son évolution sur 12 mois | Tous | MVP |
| UC-09 | Déclarer une transaction récurrente et la voir se refléter dans les prévisions | A, B | MVP |
| UC-10 | Voir la projection de trésorerie sur 6 mois | B | MVP |
| UC-11 | Créer un objectif d'épargne et suivre sa progression | C | MVP |
| UC-12 | Exporter toutes ses données en CSV/Excel | B | MVP |
| UC-13 | Consulter le journal des actions effectuées sur son compte | Tous | MVP |
| UC-14 | Simuler « et si je réduis Transport de 20 % ? » | B | V2 |
| UC-15 | Gérer des comptes en devises différentes et consolider | B | V2 |
| UC-16 | Annuler un lot d'import entier | A, B | V2 |
| UC-17 | Recherche avancée multi-critères sur les transactions | B | V2 |

## 7. Contraintes

- **Contexte d'usage principal Afrique de l'Ouest et Europe** : le XOF (0 décimale) et l'EUR (2 décimales) doivent tous deux fonctionner correctement. Le code ne doit jamais présumer de 2 décimales.
- **Connexion parfois lente** : l'application n'est pas offline-first, mais les écrans doivent rester utilisables sur une connexion à latence élevée (pagination, chargement progressif, pas de requête bloquant l'affichage entier).
- **Données financières personnelles** : chiffrement en transit et au repos, isolation stricte par utilisateur, minimisation des logs. Voir `07-securite-audit.md`.
- **Un seul développeur/agent d'implémentation au départ** : privilégier une stack unifiée (TypeScript de bout en bout) et un monolithe modulaire plutôt que des microservices.

## 8. Hypothèses à valider

Ces points ne sont pas tranchés et devront être confirmés en usage réel :

1. Les utilisateurs acceptent-ils l'effort d'import manuel mensuel, ou est-ce le point d'abandon principal ? *(À mesurer : taux de retour à J+30.)*
2. Le format des relevés disponibles chez les banques et opérateurs mobile money cibles est-il exploitable en CSV/Excel ? *(À vérifier sur échantillons réels avant de figer le pipeline d'import.)*
3. La granularité de catégorisation par défaut est-elle suffisante, ou les utilisateurs créent-ils immédiatement leurs propres catégories ?
