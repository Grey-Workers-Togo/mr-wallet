# Questions ouvertes

## RG-RP2 — conversion multi-devises dans les rapports (lot 6)

RG-RP2 (docs/04-modules.md §J) demande que la conversion utilise **le taux à la date de chaque transaction**. Une
implémentation exacte suppose soit une jointure SQL par ligne sur l'historique de taux, soit un chargement en
mémoire des transactions à convertir — ce qui entre en tension avec RG-RP1 (« tous les agrégats en SQL, jamais
de chargement mémoire »).

**Comportement implémenté (conservateur) :** les totaux sont d'abord agrégés en SQL par devise, puis chaque
total par devise est converti vers la devise de consolidation avec **le taux applicable à la date de fin de
période du rapport** (ou à la date du jour pour les rapports instantanés), plutôt qu'un taux par transaction.
Le rapport indique la devise de consolidation ; la méthode de conversion n'est pas encore affichée à l'écran.

Impact : négligeable pour un utilisateur mono-devise (cas XOF/EUR fixe le plus courant) ; peut introduire un
écart pour un historique multi-devises avec des taux modifiés entre deux dates. À corriger si des utilisateurs
multi-devises signalent un écart perceptible.

## Intercepteur d'audit — comportement quand l'écriture d'audit échoue

Les règles exigent une entrée d'audit par mutation (docs/10-conventions-dev.md §6), mais quand l'INSERT dans
`audit_log` échoue après la validation de la mutation métier (perte de connexion, erreur de contrainte),
l'intercepteur ne peut pas annuler la mutation.

**Comportement implémenté (conservateur) :** l'intercepteur attend l'écriture dans le flux de réponse et
relance l'erreur après l'avoir journalisée (`audit_write_failed code=… message=…`, jamais de payload). Le
client reçoit une erreur alors que le changement est appliqué ; le compromis inverse (répondre 200 avec un
trou dans la piste d'audit) violerait silencieusement la règle « une entrée par mutation ».

Impact : les rares échecs transitoires remontent comme des erreurs sur des mutations déjà appliquées ; les
clients qui rejouent doivent tolérer des écritures dupliquées (le rejeu idempotent des POST est déjà exigé
par docs/10 §6). À revoir si la disponibilité de la table d'audit devient un sujet opérationnel.
