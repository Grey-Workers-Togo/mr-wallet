# 00 — Glossaire

Vocabulaire commun au produit, au code et à la base de données. **Les termes anglais entre parenthèses sont les noms utilisés dans le code et le schéma.** Le français est utilisé dans l'interface et la documentation.

---

## Entités de base

**Compte** *(Account)* — Un lieu où se trouve de l'argent : compte bancaire, espèces, mobile money, carte de crédit, portefeuille. Porte un solde et une devise unique.

**Transaction** *(Transaction)* — Un mouvement d'argent sur un compte. Trois natures possibles :
- **Dépense** *(EXPENSE)* — sortie d'argent.
- **Revenu** *(INCOME)* — entrée d'argent.
- **Transfert** *(TRANSFER)* — déplacement entre deux comptes de l'utilisateur ; ne modifie pas le patrimoine net.

**Catégorie** *(Category)* — Classement métier d'une transaction (Alimentation, Transport, Loyer…). Hiérarchique sur deux niveaux maximum (catégorie → sous-catégorie).

**Tag** *(Tag)* — Étiquette libre, transversale aux catégories (« vacances 2026 », « déductible »). Une transaction peut porter plusieurs tags.

## Temps et montants

**Date métier** *(occurredAt)* — Date à laquelle l'opération a réellement eu lieu. C'est elle qui sert à tous les calculs (budgets, rapports, prévisions).

**Date d'enregistrement** *(createdAt)* — Date/heure à laquelle la ligne a été créée dans le système. Sert à l'audit, jamais aux calculs métier.

**Unité mineure** *(minor unit)* — Plus petite unité d'une devise. 1 EUR = 100 unités mineures ; 1 XOF = 1 unité mineure (le franc CFA n'a pas de sous-division en usage). Tous les montants sont stockés en entiers d'unités mineures.

**Devise de référence** *(base currency)* — Devise choisie par l'utilisateur dans laquelle sont consolidés les totaux multi-comptes (patrimoine net, rapports globaux).

## Budget

**Budget** *(Budget)* — Enveloppe de dépense pour une catégorie sur une période donnée. Ex. : « Alimentation, 150 000 XOF, mensuel ».

**Période budgétaire** *(BudgetPeriod)* — Instance datée d'un budget : « Alimentation, juillet 2026 ». C'est sur elle que se calculent la consommation et les alertes.

**Consommation** *(spent)* — Somme des transactions rattachées à la catégorie du budget sur la période.

**Reste à dépenser** *(remaining)* — Montant du budget moins la consommation. Peut être négatif (dépassement).

**Report** *(rollover)* — Option qui reporte le solde non consommé (ou le dépassement) d'une période sur la suivante.

## Dettes

**Dette** *(Debt)* — Somme due par l'utilisateur (prêt, crédit, dette informelle) ou due à l'utilisateur (créance). Le sens est porté par le champ `direction` (`OWED_BY_ME` / `OWED_TO_ME`).

**Capital restant dû** *(outstandingPrincipal)* — Montant du principal non encore remboursé.

**Échéancier** *(AmortizationSchedule)* — Liste des échéances prévues, chacune décomposée en part de capital et part d'intérêts.

**Échéance** *(Installment)* — Une ligne de l'échéancier : date prévue, montant, part capital, part intérêts, statut (prévue / payée / en retard / partielle).

## Objectifs et prévisions

**Objectif d'épargne** *(SavingsGoal)* — Montant cible à atteindre à une date cible, avec suivi de progression et contributions rattachées.

**Patrimoine net** *(Net worth)* — Somme des soldes des comptes (actifs) moins le capital restant dû de toutes les dettes, converti en devise de référence.

**Prévision** *(Forecast)* — Projection du solde et du patrimoine net sur N mois, à partir des transactions récurrentes connues, des échéances de dettes et d'une tendance sur les dépenses non récurrentes.

**Scénario** *(Scenario)* — Variante d'une prévision où l'utilisateur modifie des hypothèses (« si je réduis Transport de 20 % »). Non persisté en V1 : calculé à la volée.

## Import / export

**Source d'import** *(ImportSource)* — Configuration de mapping réutilisable, associée à un format de fichier donné (ex. : « Relevé Ecobank CSV »). Mémorise la correspondance colonnes → champs.

**Lot d'import** *(ImportBatch)* — Une exécution d'import : le fichier, ses métadonnées, le nombre de lignes acceptées / rejetées / marquées en doublon, et l'horodatage. Annulable en bloc.

**Empreinte de transaction** *(fingerprint)* — Hachage déterministe calculé sur (compte, date métier, montant, libellé normalisé), servant à détecter les doublons à l'import.

## Technique

**Module** — Unité de découpage du back-end. Voir `docs/02-architecture.md`.

**Façade** *(Facade)* — Interface publique d'un module, seul point d'entrée autorisé pour les autres modules.

**Journal d'audit** *(AuditLog)* — Table append-only enregistrant qui a fait quoi, quand, sur quelle entité, avec quel avant/après.

**Suppression douce** *(soft delete)* — Une entité supprimée est marquée `deletedAt` mais reste en base ; elle est exclue de toutes les lectures par défaut.
