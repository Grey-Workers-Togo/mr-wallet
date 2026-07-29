# Mr Wallet — Roadmap des tâches

À importer dans GitHub Projects. Chaque lot est clôturé quand sa definition of done est satisfaite (voir `docs/10-conventions-dev.md`).

---

## Lot 1 — Identité et comptes (semaine 1)

- [ ] **Module `auth`**
  - [ ] Endpoints : `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/password/*`
  - [ ] Argon2id, tokens JWT (access 15m + refresh 30j rotatif)
  - [ ] Middleware d'authentification global
  - [ ] Tests unitaires : hash, token rotation, refresh
  - [ ] Tests e2e : chaque endpoint, refus sans token, expiration

- [ ] **Module `users`**
  - [ ] Endpoints : `GET /me`, `PATCH /me`, `PATCH /me/base-currency`, `DELETE /me`
  - [ ] Table `User` : locale, timezone, monthStartDay, baseCurrency
  - [ ] Tests d'isolation : utilisateur A ne voit pas le profil de B

- [ ] **Module `currency`**
  - [ ] Endpoints : `GET /currencies`, `GET /currencies/rates?from&to&at=`, `POST /currencies/rates`, `DELETE /currencies/rates/:id`, `POST /currencies/convert`
  - [ ] Table `Currency` avec `minorUnits` par devise
  - [ ] Parités fixes XOF/EUR en seed
  - [ ] Formule de conversion (voir RG-X5, RG-X6)
  - [ ] Tests : conversion EUR↔XOF exacte, taux à date, devise inconnue

- [ ] **Module `accounts`**
  - [ ] Endpoints : `GET /accounts`, `POST /accounts`, `GET /accounts/:id`, `PATCH /accounts/:id`, `DELETE /accounts/:id`, `POST /accounts/:id/archive`, `GET /accounts/:id/balance-history`, `POST /accounts/:id/reconcile`
  - [ ] Table `Account` : solde d'ouverture, devise, archivage
  - [ ] `BalanceCheck` : réconciliation nocturne
  - [ ] Tests : solde après transaction, archivage, multi-devise

- [ ] **Front — Authentification et comptes**
  - [ ] Pages : `/auth/register`, `/auth/login`, `/auth/forgot-password`, `/me/preferences`
  - [ ] Écran : création et liste des comptes
  - [ ] Access token en mémoire, refresh token en cookie `HttpOnly`
  - [ ] Tests e2e : inscription → création de compte → consultation

- [ ] **i18n (lot 0 + lot 1)**
  - [ ] `next-intl` configuré
  - [ ] `fr.json` et `en.json` avec clés pour erreurs d'auth, labels comptes, devises
  - [ ] CI : vérification de parité des clés avant chaque commit
  - [ ] Tests : affichage devise selon `baseCurrency`, erreurs traduites

- [ ] **Definition of done validée**
  - [ ] `npm run lint && npm run typecheck && npm run test` passe
  - [ ] Un utilisateur s'inscrit, crée trois comptes de devises différentes, voit ses soldes d'ouverture
  - [ ] Isolation multi-utilisateur testée sur tous les endpoints

---

## Lot 2 — Transactions (semaine 1.5)

- [ ] **Module `categories`**
  - [ ] Endpoints : `GET /categories`, `POST /categories`, `PATCH /categories/:id`, `DELETE /categories/:id?reassignTo=`, `POST /categories/reorder`
  - [ ] Arbre 2 niveaux, catégories système avec `i18nKey`, renommage
  - [ ] Seed : 16 dépenses + 8 revenus avec `i18nKey`
  - [ ] Tests : suppression avec réaffectation, unicité du nom résolu

- [ ] **Module `tags`**
  - [ ] Endpoints : `GET /tags`, `POST /tags`, `PATCH /tags/:id`, `DELETE /tags/:id`
  - [ ] Table `TransactionTag` de liaison
  - [ ] Tests : suppression sans cascade, réutilisation dans plusieurs transactions

- [ ] **Module `transactions`**
  - [ ] Endpoints : `GET /transactions` (paginé curseur), `POST /transactions`, `POST /transactions/transfer`, `GET /transactions/:id`, `PATCH /transactions/:id`, `DELETE /transactions/:id`, `POST /transactions/bulk`, `PATCH /transactions/bulk`, `DELETE /transactions/bulk`, `GET /transactions/summary`
  - [ ] `amountMinor` en BigInt, `currency` = devise du compte
  - [ ] `normalizedLabel` et `fingerprint` (RG-T6, RG-T7)
  - [ ] Transferts à deux jambes, même transaction SQL
  - [ ] Maintien du solde du compte en même transaction
  - [ ] Application des `CategorizationRule` à la création
  - [ ] Tests : 500 transactions, solde exact, suppression recalcule, doublon détecté, isolation

- [ ] **Table `BalanceCheck` et tâche de réconciliation**
  - [ ] Tâche nocturne : recalcule solde = solde ouverture + Σ transactions
  - [ ] Notification si écart (voir module `notifications`)
  - [ ] Tests : détection d'écart, pas de correction silencieuse

- [ ] **Module `rules` (CategorizationRule)**
  - [ ] Endpoints : `GET /categorization-rules`, `POST /categorization-rules`, `PATCH /categorization-rules/:id`, `DELETE /categorization-rules/:id`
  - [ ] Application par priorité, première correspondance gagne
  - [ ] Tests : application à l'import et à la saisie manuelle

- [ ] **Front — Transactions**
  - [ ] Saisie rapide (`< 15 sec`)
  - [ ] Liste paginée, filtres (date, montant, catégorie, compte)
  - [ ] Édition, suppression
  - [ ] Transfert entre deux comptes
  - [ ] Tests e2e : saisie → affichage → édition

- [ ] **Definition of done validée**
  - [ ] 500 transactions saisies et importées manuellement → soldes exacts après réconciliation
  - [ ] Suppression et modification recalculent correctement
  - [ ] Aucune fuité entre utilisateurs

---

## Lot 3 — Import et export (semaine 1.5)

**⚠️ À tester avec de vrais relevés bancaires et mobile money avant de clore**

- [ ] **Module `import`**
  - [ ] Endpoints : `GET /import/sources`, `POST /import/sources`, `PATCH /import/sources/:id`, `DELETE /import/sources/:id`, `POST /import/upload`, `POST /import/batches/:id/mapping`, `GET /import/batches/:id/preview`, `POST /import/batches/:id/commit`, `GET /import/batches`, `GET /import/batches/:id`, `POST /import/batches/:id/revert`
  - [ ] Pipeline : upload → sniff → mapping → parse → enrich → dedupe → preview → commit
  - [ ] Formats : CSV, XLSX (TBD : OFX)
  - [ ] Détection : encodage, délimiteur, ligne d'en-tête, format de date
  - [ ] Dédoublonnage : fileHash, fingerprint exact, heuristique (Jaro-Winkler ≥ 0.85)
  - [ ] Annulation de lot : refusée si transactions modifiées après
  - [ ] Tests : doublons détectés et exclus, erreurs collectées, commit transactionnel

- [ ] **Module `export`**
  - [ ] Endpoints : `POST /export/transactions`, `POST /export/full`
  - [ ] Formats : CSV UTF-8 BOM, XLSX avec onglets
  - [ ] Colonnes : id, date, montant en mineur + décimal, devise, catégorie, libellé, tags, notes
  - [ ] Export intégral : manifeste JSON + historique complet
  - [ ] Tests : réconciliation (export → réimport = même données)

- [ ] **Front — Import/Export**
  - [ ] Assistant 4 étapes : fichier → sniff → mapping → aperçu → commit
  - [ ] 3 onglets aperçu : à importer / doublons / erreurs
  - [ ] Édition rapide avant commit
  - [ ] Téléchargement CSV/XLSX

- [ ] **Definition of done validée**
  - [ ] Même relevé importé deux fois → zéro doublon
  - [ ] Fichier avec 10 % de lignes malformées → import OK + erreurs isolées
  - [ ] Annulation de lot restaure soldes exacts
  - [ ] **Vrais relevés testés** : banque locale, opérateur mobile money

---

## Lot 4 — Budgets et récurrences (semaine 1.5)

- [ ] **Module `recurrence`**
  - [ ] Endpoints : `GET /recurrences`, `POST /recurrences`, `GET /recurrences/:id`, `PATCH /recurrences/:id`, `DELETE /recurrences/:id`, `GET /recurrences/:id/occurrences?until=`, `POST /recurrences/:id/skip`, `POST /recurrences/:id/materialize`, `GET /recurrences/suggestions`, `GET /recurrences/upcoming?days=30`
  - [ ] Fréquences : daily, weekly, biweekly, monthly, quarterly, yearly
  - [ ] Règle jour 31 : dernier jour du mois (RG-R2)
  - [ ] `autoCreate` : false par défaut (RG-R3)
  - [ ] Détection de suggestions dans l'historique (3+ occurrences)
  - [ ] Tests : calcul des occurrences, règle jour 31, modification n'affecte pas le passé

- [ ] **Module `budgets`**
  - [ ] Endpoints : `GET /budgets`, `POST /budgets`, `GET /budgets/:id`, `PATCH /budgets/:id`, `DELETE /budgets/:id`, `GET /budgets/current`, `GET /budgets/:id/periods`, `GET /budgets/:id/periods/:periodId`, `POST /budgets/from-template`
  - [ ] Table `BudgetPeriod` matérialisée (pas calculée)
  - [ ] Bornes de période dans le fuseau de l'utilisateur, `monthStartDay`
  - [ ] `spentMinor` incrémental, `rollover`
  - [ ] Alertes seuils (80 %, 100 %) une seule fois par période
  - [ ] Modèles : 50/30/20, base zéro, personnalisé
  - [ ] Tests : budget > parent englobe sous-catégories, report cumulatif, alerte une seule fois

- [ ] **Module `notifications`**
  - [ ] Endpoints : `GET /notifications?unreadOnly=true`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET /notifications/preferences`, `PATCH /notifications/preferences`
  - [ ] Table `Notification` : `type` + `params` JSON, jamais de texte rendu (RG-N9)
  - [ ] Types : `BUDGET_THRESHOLD`, `BUDGET_EXCEEDED`, `DEBT_DUE_SOON`, `DEBT_OVERDUE`, `DEBT_PAID_OFF`, `GOAL_REACHED`, `RECURRENCE_DUE`, `IMPORT_COMPLETED`, `IMPORT_FAILED`, `BALANCE_MISMATCH`
  - [ ] Préférences : in-app activé par défaut, push désactivé, opt-in par type
  - [ ] Tests : notification créée une seule fois par (type, entité, période)

- [ ] **Front — Budgets et récurrences**
  - [ ] Écran budgets : jauges par catégorie, reste à dépenser
  - [ ] Écran récurrences : liste, création, skip ponctuel
  - [ ] Centre de notifications : liste, lecture, préférences
  - [ ] Tests e2e : création budget → dépassement → alerte → notification

- [ ] **Definition of done validée**
  - [ ] Budget mensuel avec report se comporte correctement sur 3 périodes, y compris en dépassement
  - [ ] Modification de date de transaction déplace consommation entre périodes
  - [ ] Notifications renouvelées correctement selon période

---

## Lot 5 — Dettes (semaine 1.5)

**⚠️ Génération d'échéancier validée contre calcul de contrôle indépendant au centime près**

- [ ] **Module `debts`**
  - [ ] Endpoints : `GET /debts`, `POST /debts`, `GET /debts/:id`, `PATCH /debts/:id`, `DELETE /debts/:id`, `GET /debts/:id/schedule`, `POST /debts/:id/schedule/regenerate`, `GET /debts/:id/payments`, `POST /debts/:id/payments`, `DELETE /debts/:id/payments/:paymentId`, `POST /debts/:id/simulate-payoff`, `GET /debts/summary`, `GET /debts/payoff-strategies` (V2)
  - [ ] Table `Debt` : direction, taux, durée, type
  - [ ] Table `DebtInstallment` : séquence, décomposition capital/intérêts/frais
  - [ ] Génération d'échéancier amortissable (formule RG-D1)
  - [ ] Arrondi banker's rounding, écart d'arrondi absorbé par dernière échéance (RG-D1)
  - [ ] Paiement partiel : imputation frais → intérêts → capital (RG-D6)
  - [ ] Remboursement anticipé : régénération des échéances futures (RG-D4)
  - [ ] Tests : `Σ capital = principal` exact, dernier `balanceAfter = 0`, 5+ jeux de paramètres (taux 0, montant non divisible)

- [ ] **Événement `DebtPaymentRecorded`**
  - [ ] Crée une transaction `EXPENSE` / `INCOME` sur le compte lié
  - [ ] Suppression de paiement supprime la transaction
  - [ ] Tests : transaction générée dans la même SQL

- [ ] **Front — Dettes**
  - [ ] Détail de dette avec échéancier complet
  - [ ] Saisie de paiement
  - [ ] Simulateur : remboursement anticipé → intérêts économisés
  - [ ] Tests e2e : création → affichage échéancier → paiement → mise à jour capital

- [ ] **Definition of done validée**
  - [ ] Échéancier généré = calcul de contrôle indépendant (au centime)
  - [ ] Dernière ligne : `balanceAfter = 0` exactement
  - [ ] Tous les entiers (BigInt), zéro erreur d'arrondi

---

## Lot 6 — Objectifs, rapports, prévisions (semaine 1.5)

- [ ] **Module `goals`**
  - [ ] Endpoints : `GET /goals`, `POST /goals`, `GET /goals/:id`, `PATCH /goals/:id`, `DELETE /goals/:id`, `POST /goals/:id/contributions`, `DELETE /goals/:id/contributions/:contributionId`, `GET /goals/:id/progress`
  - [ ] Table `SavingsGoal` : montant cible, date cible, mode (contributions manuelles ou suivi compte)
  - [ ] `currentMinor` recalculé depuis contributions (jamais dérivé d'un compteur)
  - [ ] Épargne requise mensuelle = (cible − current) / mois restants, arrondie supérieur
  - [ ] Atteinte : passage en `COMPLETED`, notification, contributions ultérieures acceptées
  - [ ] Tests : progression, épargne requise, dépassement

- [ ] **Module `reporting`**
  - [ ] Endpoints : `GET /reports/spending-by-category`, `GET /reports/monthly-summary`, `GET /reports/net-worth`, `GET /reports/cashflow`, `GET /reports/comparison`, `GET /reports/top-transactions`, `GET /reports/budget-vs-actual`, `GET /reports/dashboard`
  - [ ] Tous les agrégats en SQL (jamais chargement mémoire)
  - [ ] Conversion multi-devises au taux à la date de chaque transaction
  - [ ] Patrimoine net = Σ comptes (`includeInNetWorth`) + créances − dettes
  - [ ] Réconciliabilité ligne à ligne
  - [ ] Tests : sous 500 ms sur 10k transactions

- [ ] **Module `forecasting`**
  - [ ] Endpoints : `GET /forecast/cashflow?months=6`, `GET /forecast/net-worth?months=12`, `POST /forecast/scenario` (V2)
  - [ ] Projections : revenus récurrents − dépenses récurrentes − dettes − estimées non-récurrentes
  - [ ] Estimée = médiane 6 mois de dépenses non-récurrentes (variance > 40 % → médiane)
  - [ ] Cache invalidé par événement transaction/budget/dette
  - [ ] Composition visible (part récurrente, estimée, dette)
  - [ ] Moins de 2 mois d'historique → partie estimée = vide, message explicite
  - [ ] Alerte trésorerie si solde projeté < 0
  - [ ] Tests : composition détaillée, stabilité sans données

- [ ] **Front — Rapports et prévisions**
  - [ ] Tableau de bord : patrimoine net, cashflow, budgets en cours
  - [ ] Écrans rapports : graphiques (Recharts), comparaisons
  - [ ] Écran prévisions : courbe 6/12/24 mois, décomposition visible
  - [ ] Simulateur (V2) : ajustement hypothèses → nouvelle courbe
  - [ ] Tests e2e : consultation dashboard → rapport détaillé

- [ ] **Definition of done validée**
  - [ ] Patrimoine net calculé = somme manuelle vérifiable
  - [ ] Rapports < 500 ms, multi-utilisateur
  - [ ] Prévisions cohérentes avec historique

---

## Lot 7 — Finition MVP (semaine 1)

- [ ] **PWA et installabilité**
  - [ ] Manifeste web.json
  - [ ] Icônes (favicon, 192x192, 512x512)
  - [ ] Service worker (Workbox)
  - [ ] Meta tags (viewport, theme-color)
  - [ ] Tests : installabilité, shortcut icon visible

- [ ] **Cache hors ligne (lecture seule, ADR-0008)**
  - [ ] Service worker stocke : comptes, 90j de transactions, catégories, budgets en cours, dettes synthèse, objectifs
  - [ ] Bandeau permanent « Hors ligne — données du [date] »
  - [ ] Écritures désactivées avec explication
  - [ ] Cache chiffré, purgé à la déconnexion
  - [ ] Expiration 7 jours → écran « données trop anciennes »
  - [ ] PIN verrouille aussi le cache
  - [ ] Tests : consultation hors ligne, écriture refusée, purge

- [ ] **Web Push (ADR-0007 avec limites iOS)**
  - [ ] Endpoints : `GET /notifications/push/public-key`, `POST /notifications/push/subscribe`, `DELETE /notifications/push/subscribe`, `GET /notifications/push/devices`, `DELETE /notifications/push/devices/:id`, `POST /notifications/push/test`
  - [ ] Table `DeviceToken` : VAPID, endpoint, failureCount
  - [ ] Rendu push côté serveur, contenu sans montant/libellé
  - [ ] Demande d'autorisation à la création du premier budget (pas au lancement)
  - [ ] `failureCount` → désactivation à 5
  - [ ] Vérification du support réel sur iOS, limitation documentée
  - [ ] Tests : souscription, envoi, gestion des erreurs

- [ ] **Verrouillage PIN**
  - [ ] PIN stocké haché (Argon2id, paramètres légers)
  - [ ] Délai d'inactivité 5 min (configurable)
  - [ ] 5 PIN erronés → purge cache local + reconnexion
  - [ ] Tests : verrouillage, déblocage, blocage cache

- [ ] **Écran de préférences complet**
  - [ ] Devise de référence
  - [ ] Locale (FR/EN)
  - [ ] Timezone
  - [ ] Week start day
  - [ ] Month start day
  - [ ] Délai verrouillage PIN
  - [ ] Préférences notifications par type
  - [ ] Appareils push connectés
  - [ ] Export intégral
  - [ ] Suppression de compte

- [ ] **Accessibilité**
  - [ ] Navigation clavier (Tab, Entrée, Échap)
  - [ ] Contrastes WCAG AA minimum
  - [ ] Libellés ARIA, landmarks (`main`, `nav`, `button`)
  - [ ] Cibles tactiles ≥ 44 px
  - [ ] Tests : audit axe, parcours clavier

- [ ] **Consultation journal d'audit**
  - [ ] Endpoints : `GET /audit-log`, `GET /audit-log/:entityType/:entityId`
  - [ ] Frise chronologique par entité
  - [ ] Affichage lisible : « Modifié le 12/07 : montant 12 500 → 15 000 »
  - [ ] Tests : intégrité du journal

- [ ] **Tests e2e complets**
  - [ ] 13 cas d'usage MVP couverts en Playwright
  - [ ] Scénario de parcours complet : inscription → création comptes → saisie transactions → budget alerte → consultation → export
  - [ ] Parcours mobile (écran étroit, tactile)
  - [ ] Parcours hors ligne : consultation → reconnexion → sync
  - [ ] Tests d'isolation multi-utilisateur sur toute la chaîne

- [ ] **Documentation utilisateur minimale**
  - [ ] FAQ : comment saisir, importer, créer budget
  - [ ] Glossaire : termes métier
  - [ ] Lien vers GitHub issues

- [ ] **Definition of done validée**
  - [ ] `npm run lint && npm run typecheck && npm run test` passe
  - [ ] 13 cas d'usage MVP passent en e2e
  - [ ] PWA installable, consultable hors ligne
  - [ ] Parcours complet 5 min : inscription → première prévision
  - [ ] CI automatisée (lint, type, test, build)

---

## V2 — Après retours d'usage (optionnel, hors MVP)

- [ ] Recherche avancée multi-critères sauvegardable
- [ ] Scénarios de prévision
- [ ] Stratégies de désendettement (avalanche vs boule de neige)
- [ ] Notifications par email
- [ ] Multi-devises avancé (provider de taux)
- [ ] Pièces jointes (photo de reçu)
- [ ] Import OFX/QIF
- [ ] Application mobile (React Native)
- [ ] Tableau de bord personnalisable
- [ ] Budget partagé / foyer
- [ ] Investissements

---

## Contrôle de qualité transversal

- [ ] **Chaque lot clôture avec :**
  - [ ] Couverture tests ≥ 80 % (métier du lot)
  - [ ] Migration Prisma versionnée et réversible
  - [ ] Docs (03, 05) mises à jour si schéma/API change
  - [ ] Audit fonctionne (avant/après des mutations)
  - [ ] Isolation multi-utilisateur vérifiée
  - [ ] CI verte

- [ ] **Avant MVP final :**
  - [ ] Relecture i18n complète : parcours entier en FR + EN
  - [ ] Performance : requêtes sous leurs budgets, index sur les clés
  - [ ] Sécurité : audit de token, password reset, CORS, CSP
