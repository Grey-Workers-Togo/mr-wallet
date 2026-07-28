# ADR-0001 — Monolithe modulaire plutôt que microservices

## Statut
Accepté — 2026-07-28

## Contexte
L'exigence initiale était « chaque type sera un module en back ». Cela peut se traduire par des microservices ou par un monolithe à modules stricts. Le produit s'adresse à des particuliers consultant leurs propres données ; les volumes attendus sont de l'ordre de quelques milliers de transactions par utilisateur. Plusieurs opérations métier traversent des domaines et doivent être atomiques (enregistrer un remboursement de dette crée une transaction et met à jour un solde).

## Décision
Un seul déploiement NestJS, découpé en modules à frontières strictes, chacun exposant une façade. Le graphe de dépendances inter-modules est documenté et doit rester acyclique.

## Conséquences
- **Bénéfice** : transactions ACID triviales, déploiement et exploitation simples, un seul dépôt, latence nulle entre modules.
- **Coût** : la discipline modulaire n'est pas imposée par le réseau ; elle doit être vérifiée (revue de code, règle de lint sur les imports croisés).
- **Ouvert** : un module peut être extrait plus tard si un besoin d'échelle apparaît, la façade servant de frontière.
