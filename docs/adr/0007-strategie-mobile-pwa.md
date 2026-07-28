# ADR-0007 — Mobile par PWA installable, pas d'application native

## Statut
Accepté — 2026-07-28

## Contexte

L'API conçue en ADR-0001 est déjà agnostique du client : REST/JSON, authentification `Bearer` stateless, pagination par curseur, clés d'idempotence, endpoint agrégé pour le tableau de bord. Un client mobile la consommerait sans modification. La question porte donc uniquement sur le **client**.

Trois options étaient sur la table :

1. **PWA installable** — un seul front Next.js, rendu responsive et installable sur l'écran d'accueil.
2. **React Native en V2** — le web reste en Next.js, une application native s'ajoute après le MVP.
3. **Mobile-first** — React Native d'abord, web ensuite.

Le code de présentation React de Next.js n'est **pas** réutilisable en React Native. Seule la logique partagée (`packages/contracts` : schémas Zod, types, kernel `money`) l'est. Une application native est donc un second front à construire et à maintenir, pas une adaptation du premier.

## Décision

**PWA installable.** Un seul front Next.js, conçu en responsive-first (le mobile est la largeur de référence, pas une adaptation après coup), avec manifeste d'application, service worker et installation sur l'écran d'accueil.

Conséquences directes sur la conception :

- Les écrans sont pensés d'abord pour un écran de téléphone, puis élargis.
- La saisie manuelle rapide (UC-02, objectif < 15 s) est le parcours mobile principal ; l'import de fichier est traité comme un usage majoritairement desktop.
- Un service worker fournit un **cache en lecture seule** (voir ADR-0008).
- Les notifications push passent par la Web Push API (voir `04-modules.md § K`).

## Conséquences

**Bénéfices**

- Un seul code base, un seul déploiement, aucun cycle de validation de store.
- Pas de version cliente figée chez l'utilisateur : la correction d'un bug est immédiate, ce qui évite tout le problème de compatibilité ascendante des clients mobiles.
- Coût marginal quasi nul par rapport au web seul.

**Coûts et limites assumés**

- **Pas de présence dans les stores.** L'acquisition passe par le web. Si la distribution en store devient un enjeu, il faudra reconsidérer.
- **Push iOS limité.** Le support du Web Push sur iOS est plus contraint que sur Android : il exige que l'utilisateur ait installé la PWA sur son écran d'accueil, et les capacités restent inférieures à l'APNs natif. Il faut vérifier l'état exact du support au moment d'implémenter le lot correspondant, et ne pas construire de fonctionnalité critique qui en dépende.
- **Pas d'accès aux API natives** (biométrie système, widgets, partage natif avancé). Le verrouillage applicatif reposera sur un PIN plutôt que sur la biométrie système sur une partie des appareils.
- **Perception.** Une PWA reste perçue comme « moins une vraie app » par certains utilisateurs.

**Ce que ça n'interdit pas**

Le passage à React Native reste ouvert. Pour le garder peu coûteux, la règle suivante s'applique dès maintenant : **toute logique métier réutilisable vit dans `packages/contracts` ou dans les dossiers `domain/`, jamais dans les composants React.** Si une application native est décidée plus tard, seule la couche de présentation est à réécrire.

## Réexamen

À reconsidérer si l'un de ces signaux apparaît : demande récurrente de présence en store, besoin de notifications push fiables sur iOS, ou usage mobile dépassant nettement l'usage desktop dans les statistiques réelles.
