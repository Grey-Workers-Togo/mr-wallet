# ADR-0004 — Abandon de l'offline-first

## Statut
Accepté — 2026-07-28
Nuancé par l'[ADR-0008](0008-cache-lecture-seule.md) : un cache de **consultation** hors ligne est ajouté. L'écriture hors ligne reste écartée.

## Contexte
L'offline-first était envisagé pour un contexte d'usage à connectivité irrégulière. Il implique une base locale, un moteur de synchronisation bidirectionnel, un versionnement du schéma local, et surtout une stratégie de résolution de conflits quand deux appareils modifient la même donnée hors ligne. Sur des données financières, un conflit mal résolu produit un solde faux.

## Décision
Application connectée classique (client/serveur). Pas de base locale synchronisée.

## Conséquences
- **Bénéfice** : suppression du chantier le plus complexe du projet, cohérence des données garantie par PostgreSQL, mise sur le marché nettement plus rapide.
- **Coût** : l'application est inutilisable sans connexion. À compenser par une bonne tolérance à la latence : pagination, chargement progressif, états de chargement explicites, réessai automatique.
- **Réversible** : un cache en lecture seule (PWA) reste envisageable sans remettre en cause l'architecture ; l'écriture hors ligne, non. C'est précisément ce qu'a acté l'ADR-0008.
