# ADR-0003 — Solde de compte stocké, avec réconciliation

## Statut
Accepté — 2026-07-28

## Contexte
Le solde d'un compte peut être recalculé à la demande (solde d'ouverture + somme des transactions) ou stocké et maintenu de façon incrémentale. Le recalcul est toujours juste mais devient lent au-delà de quelques milliers de transactions, sur des écrans consultés en permanence. Le solde stocké est rapide mais peut dériver silencieusement si une écriture échoue partiellement.

## Décision
Solde stocké sur `Account.currentBalanceMinor`, mis à jour dans la **même transaction SQL** que toute création, modification ou suppression de transaction. Une tâche nocturne recalcule le solde de chaque compte et journalise tout écart dans `BalanceCheck`, en notifiant l'utilisateur.

## Conséquences
- **Bénéfice** : lecture instantanée sur tous les écrans.
- **Coût** : une tâche de réconciliation à maintenir, et un mécanisme d'alerte.
- **Règle** : un écart détecté n'est **jamais** corrigé silencieusement — il signale un bug qu'il faut voir.
