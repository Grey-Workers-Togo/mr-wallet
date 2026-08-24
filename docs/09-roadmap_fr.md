# 09 — Roadmap et ordre d'implémentation

Les lots sont **séquentiels**. Chacun se termine par une version fonctionnelle et testée. Ne pas commencer un lot tant que le précédent n'est pas terminé au sens de la definition of done (`10-conventions-dev.md`).

Les estimations sont indicatives, pour un développeur à temps plein.

---

## Lot 0 — Fondations (≈ 1 semaine)

Rien de fonctionnel, mais tout le reste en dépend.

- Monorepo (`apps/api`, `apps/web`, `packages/contracts`), TypeScript strict, ESLint, Prettier.
- NestJS + Prisma + PostgreSQL en local (Docker Compose).
- **Kernel `money`** avec sa suite de tests complète. C'est le premier code écrit du projet.
- Filtre d'exception global, format d'erreur normalisé (`code` + `params`, sans message), `requestId`.
- **Socle i18n** : `next-intl`, fichiers `fr.json` et `en.json`, contrôle de parité des clés en CI. À poser maintenant : une seule langue au démarrage laisse toujours passer des chaînes en dur.
- Middleware Prisma : soft delete + filtrage `userId`.
- Intercepteur d'audit global + table `AuditLog` + triggers d'immuabilité.
- CI : lint, typecheck, tests, migration.

**Critère de sortie** : une entité de test peut être créée via l'API, produit une entrée d'audit dans la même transaction SQL, et est invisible après soft delete. Le build échoue si une clé de traduction manque dans l'une des deux langues.

---

## Lot 1 — Identité et comptes (≈ 1 semaine)

- `auth` : inscription, connexion, refresh rotatif, sessions, mot de passe oublié.
- `users` : profil, préférences, devise de référence, fuseau.
- `currency` : table `Currency`, parités fixes en seed, saisie manuelle de taux, conversion.
- `accounts` : CRUD, solde d'ouverture, archivage.
- Front : écrans d'authentification, liste et création de comptes.

**Critère de sortie** : un utilisateur s'inscrit, crée trois comptes de types et devises différents, et voit ses soldes d'ouverture. Test d'isolation A/B passant sur tous les endpoints.

---

## Lot 2 — Transactions (≈ 1,5 semaine)

Cœur du produit.

- `categories` : arbre, catégories système en seed, réaffectation à la suppression.
- `tags`.
- `transactions` : CRUD, transferts à deux jambes, `normalizedLabel`, `fingerprint`, maintien incrémental des soldes.
- Liste paginée par curseur, filtres, recherche texte.
- Opérations en lot.
- `BalanceCheck` + tâche de réconciliation nocturne.
- Front : saisie rapide (objectif < 15 s), liste, filtres, édition.

**Critère de sortie** : 500 transactions saisies et importées manuellement laissent les soldes exacts après réconciliation. Suppression et modification recalculent correctement.

---

## Lot 3 — Import et export (≈ 1,5 semaine)

- `import` : upload, sniffing, mapping assisté, `ImportSource` réutilisable, parsing tolérant aux erreurs, dédoublonnage à trois niveaux, prévisualisation, commit transactionnel, annulation de lot.
- `CategorizationRule` : CRUD et application à l'import et à la saisie.
- `export` : CSV et XLSX ciblés, export intégral avec manifeste.
- Front : assistant d'import en 4 étapes, écran d'aperçu à trois onglets.

**Critère de sortie** : un même relevé importé deux fois ne crée aucun doublon ; un fichier avec 10 % de lignes malformées s'importe en isolant les erreurs ; l'annulation d'un lot restaure les soldes exacts.

> Ce lot est le plus risqué du projet. Le tester avec de **vrais** relevés (banque, mobile money) avant de le considérer terminé — les formats réels sont toujours plus sales que les jeux de test synthétiques.

---

## Lot 4 — Budgets et récurrences (≈ 1,5 semaine)

- `recurrence` : règles, calcul des occurrences, matérialisation, skip, détection de suggestions.
- `budgets` : budgets, périodes matérialisées, consommation incrémentale, report, seuils d'alerte, modèles 50/30/20 et base zéro.
- `notifications` : notifications in-app, préférences par type et par canal, table `DeviceToken` et envoi push web (VAPID).
- Front : écran budgets avec jauges, écran récurrences, centre de notifications, demande d'autorisation push contextuelle (RG-N7).

**Critère de sortie** : un budget mensuel avec report se comporte correctement sur 3 périodes simulées, y compris en cas de dépassement. Une modification de date de transaction déplace bien la consommation d'une période à l'autre.

---

## Lot 5 — Dettes (≈ 1,5 semaine)

- `debts` : CRUD, génération d'échéancier amortissable, paiements, paiements partiels, remboursement anticipé avec régénération, passage en retard, clôture.
- Événement `DebtPaymentRecorded` créant la transaction liée.
- Simulation de remboursement anticipé.
- Front : détail de dette avec échéancier, saisie de paiement, simulateur.

**Critère de sortie** : sur un prêt de référence (montant, taux, durée connus), l'échéancier généré correspond au centime près à un calcul de contrôle indépendant, et la dernière ligne laisse un capital restant dû strictement égal à 0.

---

## Lot 6 — Objectifs, rapports, prévisions (≈ 1,5 semaine)

- `goals` : objectifs, contributions, progression, épargne requise.
- `reporting` : les 8 rapports listés en `04-modules.md § J`, tous en SQL agrégé.
- `forecasting` : projection de trésorerie et de patrimoine net sur 6 à 24 mois, avec décomposition.
- Front : tableau de bord, écrans de rapports avec graphiques, écran de prévisions.

**Critère de sortie** : le patrimoine net calculé correspond à la somme vérifiable manuellement des comptes et dettes ; les rapports restent sous 500 ms sur un jeu de 10 000 transactions.

---

## Lot 7 — Finition MVP (≈ 1 semaine)

- Consultation du journal d'audit (frise par entité).
- Verrouillage PIN côté client (RG-S6 à RG-S9).
- **PWA** : manifeste, icônes, installabilité, service worker.
- **Cache de consultation hors ligne** en lecture seule (ADR-0008) : périmètre borné, bandeau de fraîcheur, écritures désactivées, purge à la déconnexion.
- Vérification du support effectif du Web Push sur iOS et repli documenté.
- Écran de préférences complet, dont le sélecteur de langue.
- **Relecture i18n complète** : parcours intégral de l'application en `en`, chasse aux chaînes oubliées, vérification des pluriels et des formats de date et de montant dans les deux langues.
- Accessibilité (navigation clavier, contrastes, libellés ARIA, cibles tactiles ≥ 44 px).
- Comportement sur connexion lente : états de chargement, gestion des erreurs réseau, réessai.
- Documentation utilisateur minimale.
- Tests e2e Playwright sur les 13 cas d'usage MVP, **dont un parcours mobile et un parcours hors ligne**.

**Fin du MVP.**

---

## V2 — Après retours d'usage (≈ 4 à 6 semaines)

Par ordre de priorité décroissante :

1. **Recherche avancée** multi-critères sauvegardable (UC-17).
2. **Scénarios de prévision** (UC-14) — le simulateur « et si ».
3. **Stratégies de désendettement** : avalanche vs boule de neige avec comparaison chiffrée.
4. **Notifications par email**.
5. **Multi-devises avancé** : provider de taux optionnel, rapports de consolidation détaillés.
6. **Pièces jointes** : photo de reçu attachée à une transaction.
7. **Import OFX/QIF**.
8. **Application mobile** (React Native ou PWA installable) — décision à prendre selon les retours.
9. **Tableau de bord personnalisable** (widgets déplaçables).
10. **Constructeur de budget from-scratch** : saisir le revenu total d'une période, le répartir
    entre catégories avec un reste à allouer en direct, créer les budgets résultants en une étape.

---

## V3 — Extensions structurantes

À n'envisager qu'avec une base d'utilisateurs réelle :

1. **Budget partagé / foyer** : plusieurs utilisateurs sur un espace commun, avec rôles et permissions. Structurant : à anticiper dans le modèle (un `spaceId` en plus du `userId`) sans l'implémenter avant.
2. **Investissements** : comptes titres, valorisation, plus-values.
3. **Connecteurs bancaires** : uniquement via un agrégateur régulé, et seulement si le volume d'utilisateurs justifie le coût et la conformité associée.
4. **API publique** pour intégrations tierces.
5. **Analyses avancées** : détection d'anomalies de dépenses, comparaison à des moyennes anonymisées.

---

## Ce qui reste explicitement hors périmètre

Offline-first · connecteurs directs vers Gozem/Deliveroo/apps de livraison (nécessitent un partenariat commercial, pas une intégration technique) · comptabilité d'entreprise · conseil en investissement · dépendance dure à une API de taux payante.

---

## Jalons de vérification

| Jalon | Vérification |
|---|---|
| Fin lot 0 | Audit écrit dans la transaction métier, soft delete effectif |
| Fin lot 2 | Réconciliation des soldes exacte sur 500 transactions |
| Fin lot 3 | Import de vrais relevés bancaires et mobile money |
| Fin lot 5 | Échéancier validé contre un calcul indépendant |
| Fin lot 7 | 13 cas d'usage MVP couverts en e2e |
