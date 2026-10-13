---
description: Implémente un lot de la feuille de route de l'assistant (A0 à A5), puis s'arrête pour validation
argument-hint: <lot> (ex. A0)
---

Implémente le lot **$ARGUMENTS** de `docs/17-roadmap-assistant.md`.

## 1. Préparer

1. Vérifie que tu es sur la branche `feat/assistant` et que l'arbre de travail est propre. Sinon, arrête-toi et dis-le.
2. Lis, dans cet ordre :
   - `CLAUDE.md`, en particulier la section « Assistant et capture SMS » ;
   - la section du lot $ARGUMENTS dans `docs/17-roadmap-assistant.md` ;
   - les ADR qu'elle cite, parmi `docs/adr/0016` à `0022` ;
   - `docs/10-conventions-dev.md`, sections 3 à 8.
3. Vérifie que le lot précédent est terminé : son critère de sortie est rempli dans le code. Sinon, arrête-toi et dis-le.
4. Étudie le code existant que le lot touche : façades, `env.schema.ts`, `ZodValidationPipe`, noyau `money`, structure d'un module existant comme `reporting` ou `rules`. Reproduis ses conventions, n'en invente pas d'autres.
5. Établis la liste des tâches du lot dans ta liste de suivi. Chaque tâche cite la ou les règles `RG-xx` qu'elle couvre.

## 2. Réaliser

- Avance tâche par tâche. Écris les fonctions pures (`domain/`) avec leurs tests avant le code qui les utilise.
- Tous les tests passent par l'adaptateur LLM `fake` : aucun appel réseau, aucun coût.
- Chaque outil, chaque point d'accès a son test d'isolation : l'utilisateur A ne voit jamais les données de B.
- Montants en `bigint`, en unités mineures, jamais en `number`. Pas de texte lisible dans la base ni dans les codes d'erreur de l'API (seule exception : le texte des gabarits de l'ADR-0018).
- Les changements de schéma et de protocole sont additifs. Les migrations sont nommées et réversibles.
- Fais un commit par changement cohérent, au format Conventional Commits, en anglais (ADR-0014). Exemple : `feat(llm): add LlmProvider port and fake adapter`.
- Mets à jour `docs/03` (modèle), `docs/05` (API) ou `docs/14` (synchronisation) si le lot les touche.
- Si un point est ambigu ou contredit une ADR, ne tranche pas en silence. Ajoute la question dans `docs/QUESTIONS.md`, implémente le comportement le plus prudent et signale-le.

## 3. Terminer

1. Lance `npm run lint && npm run typecheck && npm run test`. Tout doit passer.
2. Vérifie le critère de sortie du lot, point par point.
3. Écris un résumé :
   - ce qui a été fait, par tâche, avec les règles `RG-xx` couvertes ;
   - les commits ;
   - les écarts aux ADR et leur raison ;
   - les questions ouvertes ;
   - ce qu'il faut vérifier à la main.
4. **Arrête-toi et attends la validation.** Ne commence pas le lot suivant.
