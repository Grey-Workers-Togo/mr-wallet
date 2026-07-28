# ADR-0002 — Montants en entiers d'unités mineures

## Statut
Accepté — 2026-07-28

## Contexte
Les nombres flottants introduisent des erreurs d'arrondi inacceptables sur des données financières. Par ailleurs, les devises cibles n'ont pas toutes deux décimales : le XOF en a zéro, certaines devises en ont trois.

## Décision
Tout montant est un entier (`BigInt`) exprimé en unité mineure, accompagné d'un code devise ISO 4217. La précision (`minorUnits`) est portée par la table `Currency` et lue au moment du formatage. Un kernel `money` sans dépendance centralise toute l'arithmétique.

## Conséquences
- **Bénéfice** : exactitude garantie, support natif des devises à 0 ou 3 décimales, agrégations SQL exactes.
- **Coût** : `BigInt` n'est pas sérialisable en JSON — les montants transitent en chaîne dans l'API. Le front doit convertir explicitement.
- **Interdit** : toute constante `100` dans le code, tout `Number` appliqué à un montant.
