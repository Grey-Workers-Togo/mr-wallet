# 04 — Spécifications fonctionnelles par module

Chaque section décrit : le rôle du module, ses règles métier, et les cas limites à traiter. Les règles numérotées (`RG-xx`) sont contraignantes et doivent être couvertes par des tests.

---

## A. Kernel `money`

Aucune dépendance. Toute arithmétique monétaire de l'application passe par ici.

```ts
type Money = { amountMinor: bigint; currency: string };
```

| Règle | Énoncé |
|---|---|
| RG-M1 | Toute opération entre deux `Money` de devises différentes lève une erreur. La conversion doit être explicite via le module `currency`. |
| RG-M2 | `add`, `subtract`, `multiply(scalar)`, `negate`, `compare`, `isZero`, `abs` opèrent sur `bigint` uniquement. |
| RG-M3 | La division et l'application d'un pourcentage utilisent un arrondi **banker's rounding** (au pair le plus proche) et retournent le reste, pour permettre une répartition sans perte de centimes. |
| RG-M4 | `allocate(money, ratios[])` répartit un montant en respectant `Σ parts = montant exact`. Les unités mineures restantes sont distribuées une par une aux premières parts. |
| RG-M5 | Le formatage lit `minorUnits` depuis la table `Currency`. Jamais de constante `100` dans le code. |

**Cas limites :** montant nul, montants négatifs (autorisés en interne pour les soldes, jamais sur `Transaction.amountMinor`), très grands montants (le `bigint` couvre au-delà des besoins réels).

---

## B. Module `accounts`

### Rôle
Gérer les comptes et maintenir leur solde.

### Règles

| Règle | Énoncé |
|---|---|
| RG-A1 | La devise d'un compte est **immuable** après création si le compte porte au moins une transaction. |
| RG-A2 | Le solde d'ouverture est daté (`openingBalanceAt`). Toute transaction antérieure à cette date est refusée avec un message explicite. |
| RG-A3 | `currentBalanceMinor` est mis à jour dans la **même transaction SQL** que la création/modification/suppression d'une transaction. Jamais après coup. |
| RG-A4 | Un compte ne peut pas être supprimé s'il porte des transactions non supprimées. L'API propose l'archivage à la place. |
| RG-A5 | Archiver un compte le retire des sélecteurs de saisie mais conserve son historique et son poids dans les rapports historiques. |
| RG-A6 | Pour un `CREDIT_CARD`, le solde est négatif quand de l'argent est dû. `creditLimitMinor` sert à afficher le crédit disponible, sans blocage. |
| RG-A7 | `includeInNetWorth = false` exclut le compte du patrimoine net mais pas des budgets ni des rapports de dépenses. |

### Cas limites
Suppression d'une transaction ancienne (le solde doit être recalculé, pas seulement décrémenté si des ajustements ont eu lieu) ; compte à solde d'ouverture négatif ; réconciliation détectant un écart (voir `BalanceCheck`).

---

## C. Module `categories`

| Règle | Énoncé |
|---|---|
| RG-C1 | Profondeur maximale : 2 niveaux. Une sous-catégorie ne peut pas avoir d'enfant. |
| RG-C2 | Une catégorie et son parent ont forcément le même `kind`. |
| RG-C3 | Une catégorie `isSystem` peut être renommée, recolorée ou archivée, jamais supprimée. |
| RG-C6 | Le nom affiché est `name` s'il est renseigné, sinon la traduction de `i18nKey` dans la langue courante. `i18nKey` est conservé après renommage, ce qui permet de revenir au libellé par défaut. |
| RG-C7 | L'unicité du nom est vérifiée sur le **nom résolu**, dans la langue de l'utilisateur, au sein d'un même parent. Elle ne peut pas être une contrainte SQL puisque le libellé système n'est pas en base. |
| RG-C8 | Renommer une catégorie système ne change pas `isSystem` : elle reste non supprimable. |
| RG-C4 | Supprimer une catégorie utilisée exige une catégorie de réaffectation. L'opération est atomique et journalisée comme une seule action d'audit avec le nombre de transactions déplacées. |
| RG-C5 | Un budget sur une catégorie parente englobe les dépenses de ses sous-catégories. |

---

## D. Module `transactions`

### Règles

| Règle | Énoncé |
|---|---|
| RG-T1 | `amountMinor > 0` toujours. Un montant nul ou négatif est rejeté. |
| RG-T2 | `currency` doit être égale à la devise du compte. |
| RG-T3 | `occurredAt` ne peut pas être antérieure à `account.openingBalanceAt`, ni postérieure à J+1 an (garde-fou contre les fautes de frappe de date). |
| RG-T4 | Un transfert crée exactement deux lignes partageant un `transferGroupId`. Modifier ou supprimer l'une agit sur les deux. |
| RG-T5 | Les transferts sont exclus : des totaux de dépenses, des totaux de revenus, des budgets, et du calcul du patrimoine net. |
| RG-T6 | `normalizedLabel` = description en minuscules, sans accents, sans ponctuation, espaces normalisés, chiffres de plus de 4 caractères remplacés par `#` (masque les numéros de référence variables). |
| RG-T7 | `fingerprint` = SHA-256 de `accountId|occurredAt(date)|type|amountMinor|normalizedLabel`. |
| RG-T8 | À la création, les `CategorizationRule` actives sont évaluées par priorité décroissante ; **la première qui correspond gagne**. Si l'utilisateur a fourni une `categoryId`, aucune règle ne s'applique. |
| RG-T9 | La modification d'une transaction émet `TransactionUpdated` avec l'état avant et après, pour que `budgets` puisse décrémenter l'ancienne période et incrémenter la nouvelle (cas d'un changement de date ou de catégorie). |
| RG-T10 | Une transaction issue d'un remboursement de dette (`source = DEBT_PAYMENT`) ne peut pas être supprimée directement : il faut supprimer le `DebtPayment`, qui supprime la transaction en cascade. |

### Cas limites
Changement de compte d'une transaction (impacte deux soldes) ; changement de date franchissant une frontière de mois (impacte deux périodes budgétaires) ; transaction dans une devise différente du compte (rejet) ; suppression d'une jambe de transfert seule (interdite).

---

## E. Module `recurrence`

### Règles

| Règle | Énoncé |
|---|---|
| RG-R1 | Le calcul de la prochaine occurrence tient compte du fuseau de l'utilisateur. |
| RG-R2 | Récurrence mensuelle au jour N > nombre de jours du mois → dernier jour du mois. Jamais de report au mois suivant. |
| RG-R3 | `autoCreate = false` par défaut : l'occurrence est projetée et notifiée, mais aucune transaction n'est créée sans action de l'utilisateur. |
| RG-R4 | `autoCreate = true` : une tâche quotidienne crée les occurrences échues du jour, en marquant `source = RECURRENCE`. Elle est **idempotente** : `lastGeneratedAt` empêche la double génération si la tâche tourne deux fois. |
| RG-R5 | Modifier une règle n'affecte jamais les transactions déjà créées. |
| RG-R6 | Une occurrence peut être ignorée ponctuellement (« skip ») sans désactiver la règle. |

### Détection automatique de récurrences

Analyse de l'historique pour proposer des règles : regrouper les transactions par (compte, `normalizedLabel`, montant à ±10 %) et détecter un intervalle régulier sur au moins 3 occurrences (tolérance ±3 jours). Le résultat est une **suggestion** présentée à l'utilisateur, jamais une création automatique.

---

## F. Module `budgets`

### Règles

| Règle | Énoncé |
|---|---|
| RG-B1 | Les bornes de période sont calculées dans le fuseau de l'utilisateur, en tenant compte de `user.monthStartDay`. Un `monthStartDay = 25` donne des périodes du 25 au 24. |
| RG-B2 | Un budget sur une catégorie parente compte les dépenses de toutes ses sous-catégories. |
| RG-B3 | Seules les transactions `EXPENSE` non supprimées, sur la période, dans la catégorie visée, alimentent `spentMinor`. Les transferts et les revenus sont exclus. |
| RG-B4 | Deux budgets actifs ne peuvent pas viser la même catégorie sur des périodes qui se chevauchent. |
| RG-B5 | `rollover = true` : `allocatedMinor(n) = amountMinor + (allocatedMinor(n-1) − spentMinor(n-1))`. Le report peut être négatif (le dépassement se reporte). |
| RG-B6 | Les alertes se déclenchent au **franchissement** d'un seuil, une seule fois par période et par seuil (`lastAlertPct`). Repasser sous le seuil puis le refranchir ne re-notifie pas dans la même période. |
| RG-B7 | Un budget en devise différente d'une transaction convertit au taux à la date de la transaction (`occurredAt`), pas au taux du jour. |
| RG-B8 | Les périodes budgétaires sont générées d'avance sur 12 mois glissants par une tâche quotidienne. |

### Modèles de budget proposés à la création

- **50/30/20** : 50 % besoins, 30 % envies, 20 % épargne et remboursement de dettes. Répartition des catégories système pré-affectée.
- **Base zéro** : chaque unité de revenu prévu est affectée à une catégorie ; l'écran affiche « reste à affecter » et vise zéro.
- **Personnalisé** : montants libres par catégorie.

Ces modèles ne sont qu'un point de départ : ils génèrent des `Budget` normaux, modifiables ensuite.

---

## G. Module `debts`

Le module le plus délicat. Toutes les formules ci-dessous doivent être testées avec des jeux de valeurs de référence.

### Génération de l'échéancier

**Prêt amortissable à mensualité constante** — mensualité :

```
i = annualRatePct / 100 / périodes_par_an
M = P × i / (1 − (1 + i)^(−n))      si i > 0
M = P / n                            si i = 0
```

Pour chaque échéance k :

```
intérêts_k  = capital_restant_{k−1} × i
capital_k   = M − intérêts_k
capital_restant_k = capital_restant_{k−1} − capital_k
```

| Règle | Énoncé |
|---|---|
| RG-D1 | Tous les calculs se font en unités mineures entières. L'arrondi de chaque échéance se fait à l'unité mineure ; **l'écart cumulé d'arrondi est absorbé par la dernière échéance**, de sorte que `Σ capital_k = principal` exactement. |
| RG-D2 | `balanceAfterMinor` de la dernière échéance vaut exactement 0. C'est un test obligatoire. |
| RG-D3 | Une dette à taux 0 (`RateType.ZERO`) ou informelle sans échéancier reste valide : `installments` peut être vide, seul `outstandingPrincipalMinor` est suivi. |
| RG-D4 | Un remboursement anticipé (`isExtraPayment`) s'impute **intégralement au capital** et déclenche la régénération de l'échéancier restant. L'utilisateur choisit : réduire la mensualité, ou réduire la durée (défaut : réduire la durée, plus avantageux). |
| RG-D5 | La régénération d'un échéancier ne modifie **jamais** les échéances déjà payées. Elle ne touche que les échéances `SCHEDULED` futures. |
| RG-D6 | Un paiement partiel s'impute d'abord aux frais, puis aux intérêts, puis au capital. L'échéance passe en `PARTIAL`. |
| RG-D7 | Une échéance `SCHEDULED` dont `dueOn < aujourd'hui` passe en `LATE` par tâche quotidienne, et déclenche une notification. |
| RG-D8 | Quand `outstandingPrincipalMinor` atteint 0, la dette passe en `PAID_OFF`, `closedAt` est renseigné, et `DebtPaidOff` est notifié. |
| RG-D9 | Enregistrer un `DebtPayment` avec un `linkedAccountId` émet `DebtPaymentRecorded`, qui crée une transaction `EXPENSE` (ou `INCOME` si `OWED_TO_ME`) sur ce compte. Supprimer le paiement supprime la transaction. |
| RG-D10 | Une dette `OWED_TO_ME` (créance) compte comme **actif** dans le patrimoine net ; une dette `OWED_BY_ME` comme **passif**. |

### Vues à fournir

- Échéancier complet avec décomposition capital/intérêts par ligne.
- Coût total du crédit : `Σ intérêts` sur toute la durée.
- Impact d'un remboursement anticipé : intérêts économisés, nouvelle date de fin.
- Stratégies de désendettement (V2) : ordre « avalanche » (taux le plus élevé d'abord) et « boule de neige » (plus petit solde d'abord), avec comparaison du coût total.

### Cas limites
Taux variable (V2 : on stocke un historique de taux et on régénère à chaque changement) ; échéance sautée ; dette en devise étrangère ; dette sans date de fin ; remboursement supérieur au capital restant (rejet ou solde de la dette avec surplus signalé).

---

## H. Module `goals`

| Règle | Énoncé |
|---|---|
| RG-G1 | `currentMinor` = Σ des contributions non supprimées. Recalculé, jamais dérivé d'un compteur seul. |
| RG-G2 | Si `linkedAccountId` est renseigné, l'objectif peut suivre le solde du compte plutôt que des contributions explicites. Le mode est un choix à la création et n'est pas modifiable ensuite. |
| RG-G3 | L'épargne mensuelle requise = `(targetMinor − currentMinor) / mois restants`, arrondie au supérieur. Si `targetDate` est dépassée et l'objectif non atteint, afficher le retard, pas une valeur négative. |
| RG-G4 | Atteindre la cible passe le statut en `COMPLETED` et émet `GoalReached`. Une contribution ultérieure est acceptée (dépassement autorisé). |
| RG-G5 | Une contribution peut générer un transfert réel vers un compte d'épargne, ou rester un simple marquage. Le comportement est explicite à la saisie. |

---

## I. Module `forecasting`

### Méthode de projection (V1)

Pour chaque mois futur du mois M+1 à M+N (N = 6 par défaut, 24 max) :

```
solde_projeté(m) = solde_projeté(m−1)
                 + revenus_récurrents(m)
                 − dépenses_récurrentes(m)
                 − échéances_de_dettes(m)
                 − dépenses_non_récurrentes_estimées(m)
                 + contributions_objectifs_planifiées(m)
```

`dépenses_non_récurrentes_estimées` = moyenne des 3 derniers mois complets des dépenses non rattachées à une récurrence, par catégorie. Une médiane sur 6 mois est utilisée si la variance est forte (écart-type > 40 % de la moyenne), pour limiter l'effet des mois atypiques.

| Règle | Énoncé |
|---|---|
| RG-F1 | La projection ne persiste rien. Résultat mis en cache (TTL 1 h), invalidé par tout événement de transaction, budget ou dette. |
| RG-F2 | Chaque point de projection expose sa **composition** (part récurrente, part estimée, part dette) pour que l'utilisateur comprenne d'où vient le chiffre. |
| RG-F3 | Avec moins de 2 mois d'historique, la partie « estimée » n'est pas calculée ; l'application affiche explicitement que la projection est incomplète plutôt que d'extrapoler sur des données insuffisantes. |
| RG-F4 | La projection signale les mois où le solde projeté passe sous zéro (alerte de trésorerie). |
| RG-F5 | Les projections sont des estimations basées sur l'historique. L'interface ne doit pas les présenter comme des prédictions certaines ni en tirer de recommandation financière. |

### Scénarios (V2)
Paramètres applicables sans persistance : variation en % d'une catégorie, ajout/suppression d'une récurrence hypothétique, remboursement anticipé d'une dette, changement de revenu. Résultat : deux courbes superposées (référence vs scénario) et le delta à l'horizon.

---

## J. Module `reporting`

Rapports à fournir (tous filtrables par période, comptes, catégories, tags) :

1. **Dépenses par catégorie** — camembert + tableau, avec % du total et évolution vs période précédente.
2. **Évolution mensuelle** — barres revenus/dépenses, ligne du solde net.
3. **Patrimoine net dans le temps** — courbe sur 12/24/60 mois, décomposée actifs/passifs.
4. **Flux de trésorerie** — entrées, sorties, net, par mois.
5. **Comparaison de périodes** — mois vs mois−1, mois vs même mois année−1.
6. **Top dépenses** — plus grosses transactions de la période.
7. **Budget vs réel** — écart par catégorie.
8. **Dettes** — capital restant total, intérêts payés cumulés, date de sortie de dette projetée.

| Règle | Énoncé |
|---|---|
| RG-RP1 | Tous les agrégats sont calculés en SQL, jamais par chargement en mémoire. |
| RG-RP2 | La conversion multi-devises utilise le taux à la date de chaque transaction, pas le taux du jour. Le rapport indique la devise de consolidation et la méthode. |
| RG-RP3 | Le patrimoine net = Σ(soldes des comptes avec `includeInNetWorth`) + Σ(créances `OWED_TO_ME`) − Σ(capital restant dû `OWED_BY_ME`). |
| RG-RP4 | Le patrimoine net historique est reconstruit à partir des transactions, pas d'un instantané stocké — sinon toute correction rétroactive fausserait l'historique. |

---

## K. Module `notifications`

| Règle | Énoncé |
|---|---|
| RG-N1 | Une notification est créée une seule fois par (type, entité, période). Pas de doublon si la tâche tourne plusieurs fois. |
| RG-N2 | Deux canaux en V1 : **in-app** (toujours) et **push web** (opt-in). L'email est V2. |
| RG-N3 | L'utilisateur peut activer ou désactiver chaque canal pour chaque type de notification. |

### Push web

Le push repose sur la Web Push API et la table `DeviceToken` (voir `03-modele-donnees.md § 17`). Il complète le canal in-app, il ne le remplace pas : une notification est **toujours** créée en base, le push n'est qu'une tentative de livraison immédiate.

| Règle | Énoncé |
|---|---|
| RG-N4 | L'échec d'un envoi push ne fait jamais échouer l'opération métier qui l'a déclenché. L'envoi est asynchrone et hors transaction SQL. |
| RG-N5 | Le contenu d'un push ne contient **ni montant, ni libellé de transaction, ni nom de bénéficiaire**. Une notification de dépassement dit « Budget Alimentation dépassé », pas « Budget Alimentation dépassé de 12 500 XOF ». Un push transite par un service tiers et peut s'afficher sur un écran verrouillé. |
| RG-N6 | Un `endpoint` renvoyant une erreur définitive (410 Gone, 404) est immédiatement désactivé. Une erreur transitoire incrémente `failureCount` ; à 5, l'abonnement est désactivé. |
| RG-N7 | La demande d'autorisation de notification n'est jamais présentée au premier lancement, mais au moment où l'utilisateur crée son premier budget ou sa première dette — c'est-à-dire quand l'intérêt est explicite. Une demande prématurée est refusée, et un refus navigateur est difficilement réversible. |
| RG-N8 | Le push est **désactivé par défaut** pour tous les types. C'est un opt-in explicite, par type. |
| RG-N9 | Une notification stocke `type` + `params`, **jamais de texte rendu** (ADR-0009). Le rendu se fait à l'affichage, dans la langue courante ; l'historique se traduit donc avec le changement de langue. |
| RG-N10 | Le contenu d'un push est rendu **côté serveur** au moment de l'envoi, dans la langue de l'utilisateur (`user.locale`) — un service worker inactif ne peut pas traduire. C'est la seule exception au principe « pas de rendu serveur », et elle ne stocke rien. |
| RG-N11 | Un `type` inconnu du client (version antérieure) affiche un libellé de repli générique, jamais une ligne vide. |

**Limite iOS assumée** : le support du Web Push sur iOS impose que la PWA soit installée sur l'écran d'accueil et reste plus restreint qu'un push natif. Aucune fonctionnalité critique ne doit dépendre du push — il reste un confort, jamais le seul moyen d'apprendre une information. L'état exact du support est à vérifier au moment d'implémenter le lot 7.

---

## L. Module `import`

Voir le détail complet dans `06-import-export.md`. Règles clés :

| Règle | Énoncé |
|---|---|
| RG-I1 | Aucun import n'écrit en base sans une étape de **prévisualisation validée** par l'utilisateur. |
| RG-I2 | Les lignes en doublon probable sont présentées à part, pré-cochées comme « à ignorer », mais l'utilisateur peut forcer l'import. |
| RG-I3 | Un lot d'import est annulable en bloc tant qu'aucune transaction du lot n'a été modifiée manuellement. |
| RG-I4 | Une ligne en erreur n'interrompt pas l'import : elle est collectée dans `errors` avec son numéro de ligne et le motif. |

---

## M. Module `export`

| Règle | Énoncé |
|---|---|
| RG-E1 | L'export intégral (« toutes mes données ») produit une archive contenant un fichier par entité, en CSV UTF-8 avec BOM, plus un `manifest.json` indiquant la date d'export, les versions de schéma et le nombre de lignes par fichier. |
| RG-E2 | Les montants exportés le sont à la fois en unité mineure (colonne exacte) et en valeur décimale formatée (colonne lisible), pour éviter toute ambiguïté. |
| RG-E3 | L'export est journalisé dans l'audit (qui, quand, quel périmètre). |
| RG-E4 | Un export ne contient jamais de `passwordHash`, de token ni de session. |
