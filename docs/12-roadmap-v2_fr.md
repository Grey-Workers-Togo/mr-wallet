# 12 — Roadmap V2 (détaillée)

Détail des 10 chantiers V2 listés dans `09-roadmap_fr.md § V2`, dans le même ordre de priorité,
sous forme de lots séquentiels continuant la numérotation du MVP (lots 0–7). Mêmes règles :
chaque lot se termine fonctionnel et testé, definition of done selon `10-conventions-dev.md`, ne
pas sauter de lot.

Ancré sur l'état réel du code (vérifié avant rédaction) :

- Les filtres de liste `transactions` (`listTransactionsSchema`) supportent `accountId`,
  `categoryId`, `type`, `from`/`to`, `minAmountMinor`/`maxAmountMinor`, `q` en valeur unique —
  pas de tableaux multi-valeurs, pas de filtre par tag, pas de filtre `payee`, aucun modèle de
  recherche sauvegardée.
- `forecasting` n'expose que `GET /forecast/cashflow` et `GET /forecast/net-worth`. Aucun
  endpoint `scenario` n'existe encore.
- `debts.service.ts` possède déjà `simulatePayoff()` (projection par dette avec paiement
  supplémentaire) et le moteur d'amortissement complet — aucun classement/répartition
  inter-dettes n'existe encore.
- `NotificationsService` a déjà un champ de préférence `emailEnabled`, mais rien n'envoie
  d'email. `apps/api/src/common/mail/mail.service.ts` (nodemailer, configuré par variables SMTP,
  no-op si `SMTP_HOST` absent) existe déjà et n'est utilisé que par `auth` (vérification/reset).
- L'énumération `ExchangeRate.source` inclut déjà `PROVIDER`, mais `currency.service.ts` écrit
  toujours `MANUAL`. Aucun adaptateur de provider n'existe.
- Aucun modèle Prisma `Attachment` n'existe. `Transaction` n'a pas de relation fichier/pièce
  jointe.
- `import` ne supporte que CSV/TSV et XLSX (`domain/parse-file.ts`, `domain/sniff.ts`). Aucun
  parseur OFX/QIF n'existe.
- Aucune route de tableau de bord authentifié n'existe. Après connexion, l'utilisateur arrive sur
  `/accounts` ; chaque fonctionnalité est une page indépendante, rien n'agrège en widgets.
- `budgets` modélise déjà `Budget` (plafond par catégorie, période, report, seuils d'alerte) et
  `BudgetPeriod` (alloué vs dépensé) — la création se fait un budget à la fois via `POST
  /budgets`. Aucun endpoint de création en masse/plan, et la page front `/budgets` n'a aucune
  saisie de revenu ni reste-à-allouer — chaque budget de catégorie est créé indépendamment, sans
  vue d'ensemble du revenu de la période.

---

## Lot 8 — Recherche avancée (≈ 3 jours)

- `transactions` : étendre `listTransactionsSchema` pour accepter `categoryId[]`, `tagId[]`,
  `accountId[]` en valeurs multiples, plus un filtre `payee` (champ déjà présent sur le modèle,
  non exploité par le filtre actuellement).
- Nouvelle table `SavedSearch` (`userId`, `name`, `filterJson`, `createdAt`/`updatedAt`/
  `deletedAt` standards, auditée comme toute écriture).
- Endpoints : `GET /saved-searches`, `POST /saved-searches`, `DELETE /saved-searches/:id` ;
  `GET /transactions?savedSearchId=` applique un jeu de filtres sauvegardé.
- Front : panneau de filtres multi-sélection, action « sauvegarder cette recherche », liste des
  recherches sauvegardées avec application/suppression.
- Tests : une recherche sauvegardée à 5 critères combinés renvoie exactement les mêmes résultats
  que les mêmes filtres appliqués manuellement ; supprimer une recherche sauvegardée ne touche
  jamais aux transactions qu'elle matchait ; test d'isolation (l'utilisateur A ne peut ni lire ni
  appliquer une recherche de l'utilisateur B).

**Critère de sortie** : une recherche multi-critères sauvegardée reproduit exactement le filtrage
manuel, et reste privée par utilisateur.

---

## Lot 9 — Scénarios de prévision (≈ 4 jours)

- `forecasting` : nouvel endpoint `POST /forecast/scenario`. Réutilise le moteur de projection
  cashflow/patrimoine net existant, mais prend des hypothèses explicites (changement de montant
  d'une récurrence hypothétique, montant ponctuel futur, horizon en mois) au lieu de lire les
  récurrences/budgets réels.
- Reste sans état : le scénario est calculé et renvoyé, jamais persisté. Ne pas inventer de
  modèle `SavedScenario` — hors périmètre sauf demande explicite (voir CLAUDE.md : ne pas
  trancher silencieusement une ambiguïté, la consigner dans `QUESTIONS.md` si le besoin de
  sauvegarde de scénario apparaît).
- Front : entrées d'hypothèses ajustables, courbe résultante affichée à côté de la prévision de
  référence pour comparaison.
- Tests : un scénario modifiant une dépense récurrente produit une courbe de trésorerie qui
  diverge de la référence exactement de l'écart attendu sur 3 mois simulés.

**Critère de sortie** : le résultat d'un scénario est vérifiable à la main contre la prévision de
référence pour un changement à une seule variable.

---

## Lot 10 — Stratégies de désendettement (≈ 3 jours)

- `debts` : nouvelle fonction de domaine pure `rankDebtsForStrategy(debts, strategy)`, à côté de
  `amortization.ts`. Avalanche trie par taux décroissant, boule de neige par solde restant
  croissant ; le paiement supplémentaire s'applique à la dette en tête de classement et cascade
  (effet cascade) vers la suivante une fois une dette soldée.
- Nouvel endpoint `GET /debts/payoff-strategies?extraMinor=&strategy=avalanche|snowball`, construit
  au-dessus de `simulatePayoff()` existant plutôt que de le dupliquer.
- Front : comparaison avalanche vs boule de neige côte à côte (intérêts totaux payés, date de
  solde) dans l'écran simulateur de dettes.
- Tests : un jeu de données de référence (2-3 dettes, taux/soldes fixes) correspond à un calcul
  de contrôle indépendant au centime près ; le total d'intérêts sous chaque stratégie n'est
  jamais pire que le scénario de référence sans paiement supplémentaire.

**Critère de sortie** : la comparaison de stratégies sur un jeu de données de référence
correspond exactement au calcul manuel.

---

## Lot 11 — Notifications par email (≈ 2 jours)

- `notifications` : brancher `NotificationsService` sur le `MailService` existant (déjà utilisé
  par `auth`, déjà configuré SMTP, déjà sans effet si `SMTP_HOST` absent) — aucune nouvelle
  infrastructure d'envoi n'est nécessaire.
- Envoyer un email par type de notification quand la préférence `emailEnabled` de l'utilisateur
  est active pour ce type. Sujet/corps rendus côté serveur au moment de l'envoi à partir de
  `type` + `params`, avec les mêmes clés i18n déjà utilisées pour le rendu in-app (conforme à
  CLAUDE.md : la base/API ne stocke jamais de texte lisible).
- Tests : `emailEnabled=true` sur un type produit un email à l'événement correspondant ;
  `emailEnabled=false` n'en envoie aucun ; le rendu de l'email respecte la locale du destinataire.

**Critère de sortie** : un événement de dépassement de budget avec email activé produit un email
correctement localisé ; désactivé, aucun email.

---

## Lot 12 — Multi-devises avancé (≈ 3 jours)

- `currency` : `ExchangeRate.source = PROVIDER` est déjà modélisé — ajouter une interface
  `ExchangeRateProvider` avec adaptateur branchable, désactivée par défaut (conforme à CLAUDE.md :
  pas de dépendance dure à une API de taux payante dans le cœur ; un provider est optionnel et
  branchable, voir `docs/08-devises.md`).
- Une tâche planifiée rafraîchit uniquement les taux sourcés `PROVIDER`, et seulement si un
  provider est configuré par variable d'environnement ; sans provider configuré, le comportement
  est inchangé par rapport à aujourd'hui (saisie manuelle uniquement).
- `reporting` : rapport de consolidation détaillé montrant le patrimoine net/cashflow décomposé
  par devise d'origine avant conversion, en plus du total converti existant.
- Tests : le comportement sans provider configuré est identique au comportement manuel actuel ;
  avec un provider factice, le rafraîchissement planifié met à jour uniquement les taux
  `PROVIDER`, sans toucher `MANUAL` ni `PEGGED`.

**Critère de sortie** : l'intégration du provider est strictement additive — le comportement
existant en taux manuel n'est pas affecté en l'absence de provider configuré.

---

## Lot 13 — Pièces jointes (≈ 3 jours)

- Nouvelle table `Attachment` : `id`, `userId`, `transactionId`, `storageKey`, `mimeType`,
  `sizeBytes`, horodatages standards + soft delete + audit.
- Adaptateur de stockage derrière une interface (disque local par défaut, compatible S3 optionnel
  par variable d'environnement), sur le même modèle de configuration optionnelle que
  `mail.service.ts` — aucune dépendance cloud dure introduite.
- Limites conservatrices par défaut (types MIME image uniquement, plafond de taille) puisque la
  spécification ne fixe pas de chiffres précis — consigner l'hypothèse dans `docs/QUESTIONS.md`
  selon la règle d'ambiguïté de CLAUDE.md.
- Endpoints : `POST /transactions/:id/attachments` (upload multipart), `GET
  /transactions/:id/attachments/:attachmentId` (diffusion), `DELETE
  /transactions/:id/attachments/:attachmentId`.
- Tests : le cycle upload → récupération → suppression retire bien le fichier sous-jacent ; test
  d'isolation (l'utilisateur B ne peut ni récupérer ni supprimer une pièce jointe de
  l'utilisateur A, même en devinant l'id).

**Critère de sortie** : une photo de reçu survit correctement au cycle upload/récupération/
suppression et n'est jamais visible entre utilisateurs.

---

## Lot 14 — Import OFX/QIF (≈ 3 jours)

- `import` : nouveaux `domain/parse-ofx.ts` et `domain/parse-qif.ts`, alimentant le pipeline
  `mapRow`/`dedupe`/aperçu/commit existant sans le modifier — même forme que le chemin CSV/XLSX
  actuel dans `domain/parse-file.ts`.
- `domain/sniff.ts` : étendre la détection de format par extension de fichier + signature de
  contenu (`<OFX>` / `!Type:`) pour que l'assistant 4 étapes existant détecte automatiquement
  OFX/QIF sans nouveau flux d'interface.
- Tests : de vrais fichiers OFX et QIF s'importent via le même assistant avec un mapping de
  champs correct et le même dédoublonnage à trois niveaux que CSV aujourd'hui (reprend le critère
  de sortie du lot 3, appliqué aux nouveaux formats).

**Critère de sortie** : un fichier OFX et un fichier QIF s'importent proprement via l'assistant
existant, les doublons contre un import CSV antérieur des mêmes données sont correctement
détectés.

---

## Lot 15 — Décision application mobile (≈ 1-2 jours, étude non implémentation)

- Ce lot est une décision, pas une implémentation : évaluer PWA installable seule vs React
  Native selon les retours d'usage réels post-MVP (répartition des appareils, rétention, limites
  de fiabilité du push observées sur iOS au lot 7), conformément à la roadmap (« décision à
  prendre selon les retours »).
- Livrable : un ADR dans `docs/adr/` consignant la décision et sa justification.
- Si React Native est retenu, son implémentation est planifiée comme un chantier séparé, ultérieur
  — hors de ce passage V2.

**Critère de sortie** : ADR fusionné avec une décision claire et sa justification.

---

## Lot 16 — Tableau de bord personnalisable (≈ 3 jours)

- Nouvelle route `apps/web/src/app/[locale]/dashboard/` — aucune n'existe aujourd'hui ;
  l'utilisateur arrive actuellement sur `/accounts` après connexion, sans écran d'accueil agrégé.
- Grille de widgets s'appuyant sur les endpoints déjà existants des lots précédents : patrimoine
  net, budgets en cours, synthèse des dettes, récurrences à venir, progression des objectifs.
  Aucun nouvel endpoint d'agrégation côté back nécessaire — chaque widget appelle son endpoint
  existant indépendamment, un widget retiré/absent ne génère aucune requête.
- Disposition (widgets choisis, ordre) persistée côté client (`localStorage`) par défaut plutôt
  qu'une nouvelle préférence synchronisée côté serveur — garde ce lot additif et évite une
  nouvelle surface de synchronisation ; à remonter dans `docs/QUESTIONS.md` si une persistance
  serveur s'avère nécessaire.
- Tests : réorganiser/retirer des widgets survit à un rechargement ; l'endpoint d'un widget
  retiré n'est pas appelé.

**Critère de sortie** : la disposition du tableau de bord est personnalisable par l'utilisateur
et persiste entre sessions sur le même appareil.

---

## Lot 17 — Constructeur de budget from-scratch (≈ 3 jours)

- `budgets` : nouvel endpoint `POST /budgets/plan` — prend une période (`startsOn`/`endsOn`/
  `period`) et une liste d'allocations `{ categoryId, amountMinor }`, crée un `Budget` (+ son
  premier `BudgetPeriod`) par allocation de façon atomique (une seule transaction DB — un échec
  partiel ne doit jamais laisser un plan à moitié construit). Réutilise le chemin de création
  d'un budget unique déjà existant dans `budgets.service.ts` plutôt que de dupliquer sa
  validation.
- Le revenu total de la période est un nombre saisi par l'utilisateur, pas dérivé de
  `recurrence` — préremplir depuis les occurrences de revenus récurrents est une amélioration
  raisonnable mais non requise pour le critère de sortie ; si ajouté, doit rester modifiable (le
  revenu réel d'une période donnée peut différer du modèle récurrent).
- Front : parcours guidé sur `/budgets/plan` — étape 1, saisir le revenu total de la période ;
  étape 2, une liste de catégories où chaque ligne prend un montant alloué, avec un indicateur
  « alloué / revenu total / reste à allouer » qui se met à jour en direct pendant la saisie ;
  étape 3, confirmer et soumettre. Une sur-allocation (somme > revenu) est un avertissement
  visible, pas un blocage — choix conservateur par défaut selon la règle d'ambiguïté de
  CLAUDE.md (à remonter dans `docs/QUESTIONS.md` si un blocage strict s'avère nécessaire).
- Tests : allouer tout le revenu entre catégories laisse un reste à zéro et crée exactement une
  paire `Budget`/`BudgetPeriod` par catégorie allouée ; un cas d'échec partiel (ex. un
  `categoryId` invalide parmi plusieurs) n'en crée aucun, pas un sous-ensemble ; test d'isolation
  (le plan de l'utilisateur A ne crée jamais de budget visible par l'utilisateur B).

**Critère de sortie** : un revenu total, alloué entre catégories via le parcours guidé, produit
exactement l'ensemble de budgets attendu avec un reste à zéro, ou la soumission échoue en bloc.

---

## Jalons de vérification

| Jalon | Vérification |
|---|---|
| Fin du lot 10 | Comparaison de stratégies conforme au calcul de contrôle indépendant, au centime |
| Fin du lot 12 | Comportement sans provider identique à la référence manuelle pré-lot-12 |
| Fin du lot 13 | Test d'isolation des pièces jointes passant (aucun accès inter-utilisateur) |
| Fin du lot 14 | Fichiers OFX et QIF réels importés sans correction manuelle |
| Fin du lot 16 | Personnalisation de la disposition du tableau de bord couverte de bout en bout |
| Fin du lot 17 | Un plan de budget soumis est tout-ou-rien et laisse un reste à allouer nul |
