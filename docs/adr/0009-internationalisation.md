# ADR-0009 — Français et anglais dès le MVP, aucune chaîne rendue en base

## Statut
Accepté — 2026-07-28

## Contexte

La conception initiale prévoyait une interface en français, avec l'internationalisation « prévue » mais repoussée. En pratique, trois endroits figeaient déjà le français dans la **donnée**, pas seulement dans l'affichage :

1. `Notification.title` et `Notification.body` stockaient du texte rendu. Une notification créée en français le restait pour toujours, même après changement de langue.
2. Les catégories système du seed portaient des noms français en dur (`Alimentation`, `Transport`…), hérités par tout nouvel utilisateur.
3. Le format d'erreur de l'API renvoyait un `message` en français depuis le serveur.

Ces trois points sont des décisions de **schéma et de contrat**, pas de présentation. Les corriger avant qu'il n'existe des données de production coûte quelques heures ; après, il faut une migration de données sur du texte libre, ce qui n'est jamais propre.

Par ailleurs, l'expérience courante est qu'une application développée en une seule langue accumule des chaînes en dur, quelle que soit la discipline affichée : c'est la deuxième langue qui révèle les oublis, pas la relecture.

## Décision

**Deux locales complètes dès le MVP : `fr` et `en`.**

Principe directeur, applicable partout :

> La base de données et l'API ne contiennent **jamais** de texte destiné à être lu par un humain dans une langue donnée. Elles transportent des identifiants stables et des paramètres. Le rendu dans une langue est fait au dernier moment, côté client.

Trois conséquences structurelles :

| Domaine | Avant | Après |
|---|---|---|
| Notifications | `title` et `body` en texte français | `type` + `params` (JSON), rendus à l'affichage |
| Catégories système | Nom français en dur | `i18nKey` stable + `name` optionnel si l'utilisateur renomme |
| Erreurs API | `message` en français | `code` stable + `params`, traduits côté client |

### Ce qui reste explicitement en une seule langue

- **Le code, les identifiants, les noms de tables et de champs** : anglais, toujours.
- **La documentation technique et les commits** : français.
- **Les données saisies par l'utilisateur** (libellés de transaction, noms de comptes, notes) : elles sont dans la langue de l'utilisateur et ne sont jamais traduites. Ce sont ses données, pas de l'interface.

### Séparation langue / devise / fuseau

Ces trois dimensions restent indépendantes, comme elles l'étaient déjà : `user.locale`, `user.baseCurrency`, `user.timezone`. Un utilisateur peut lire l'interface en anglais, compter en XOF et vivre à Cotonou. Les lier serait une erreur fréquente et coûteuse.

## Conséquences

**Bénéfices**

- Changer de langue met à jour l'intégralité de l'interface, y compris l'historique des notifications.
- Ajouter une troisième langue devient un travail de traduction pur, sans toucher au schéma ni à l'API.
- Le format d'erreur par code est de toute façon une meilleure pratique d'API : il rend les erreurs testables et interprétables par un client, ce qu'un message en langue naturelle n'est pas.

**Coûts**

- Deux fichiers de traduction à maintenir en parallèle dès le premier écran. Un contrôle automatisé de parité des clés est nécessaire (voir `10-conventions-dev.md`).
- Le rendu des notifications côté client suppose que le client connaisse tous les types. Une notification d'un type inconnu (client non à jour) doit avoir un rendu de repli, jamais un écran vide.
- La pluralisation et l'ordre des mots diffèrent entre langues : les messages doivent être des phrases complètes paramétrées, jamais des fragments concaténés.

**Deux dettes connues, assumées**

Elles ne sont pas corrigées maintenant parce qu'elles ne touchent pas au schéma et restent réparables à tout moment :

1. **En-têtes des fichiers d'export** (`date_operation`, `compte`…) — figés en français dans `06-import-export.md`. Un utilisateur anglophone recevra un CSV à en-têtes françaises. Corrigeable en suivant `user.locale` au moment de la génération, sans migration.
2. **`Currency.name`** — stocke un libellé lisible (« Franc CFA »). Le code ISO étant lui-même la clé, le client peut résoudre le nom via son dictionnaire et ignorer le champ. Aucune donnée à migrer.

Les signaler ici évite qu'elles soient découvertes comme des incohérences plus tard.

**Hors périmètre pour l'instant**

Le RTL (arabe, hébreu) n'est pas au programme. Si une telle langue arrive un jour, l'usage de propriétés CSS logiques (`margin-inline-start` plutôt que `margin-left`) dès maintenant limitera le coût — c'est une convention gratuite à adopter, pas un chantier.

## Réexamen

Une troisième langue ne nécessitera pas de nouvelle ADR tant qu'elle est LTR. Une langue RTL, oui.
