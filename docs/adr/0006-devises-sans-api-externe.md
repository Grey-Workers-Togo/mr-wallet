# ADR-0006 — Multi-devises sans dépendance à une API de taux

## Statut
Accepté — 2026-07-28

## Contexte
Les API de taux de change fiables sont payantes au-delà de quotas très bas, et les offres gratuites changent ou disparaissent. Faire dépendre la consolidation multi-devises d'un tel service crée une fragilité disproportionnée.

## Décision
Le module `currency` résout les taux en cascade : parités fixes (XOF/XAF ↔ EUR, chargées en seed), puis taux saisis manuellement par l'utilisateur, puis fournisseur externe **optionnel et désactivé par défaut**. Si aucun taux n'est disponible, l'API renvoie une erreur explicite invitant à la saisie — jamais de conversion approximative silencieuse.

## Conséquences
- **Bénéfice** : l'application fonctionne intégralement sans abonnement. Pour les utilisateurs de la zone franc CFA travaillant aussi en euro, les parités fixes couvrent le besoin entièrement.
- **Coût** : l'utilisateur avec des devises hors parité fixe doit saisir ses taux. Acceptable pour quelques transactions par an ; à réévaluer si le multi-devises devient un usage central.
- **Règle associée** : la conversion applique le taux à la date de la transaction, jamais le taux du jour, pour que l'historique consolidé reste stable.
