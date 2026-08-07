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
