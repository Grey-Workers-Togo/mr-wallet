# Budget Manager

Application de gestion de finances personnelles : suivi des dépenses, budgets, dettes, objectifs d'épargne et prévisions.

> **Statut : Lot 0 (fondations) en cours d'implémentation.** Monorepo, kernel `money`, schéma Prisma, socle NestJS (audit, erreurs, i18n) posés. Voir [docs/09-roadmap.md](docs/09-roadmap.md).

---

## En une phrase

Une application web permettant à un particulier de centraliser ses comptes, d'importer ses relevés (CSV/Excel), de piloter ses budgets et ses dettes, de projeter sa situation financière future, et d'exporter ses données — le tout avec un journal d'audit horodaté de toutes les actions.

## Principes directeurs

| Principe | Ce que ça implique |
|---|---|
| **Modularité** | Le back-end est un monolithe modulaire. Chaque domaine métier (comptes, transactions, budgets, dettes…) est un module isolé, avec ses entités, ses règles et son API. |
| **Pas de connecteurs tiers en V1** | Les données entrent par import CSV/Excel ou saisie manuelle. Aucune dépendance à des API externes (Gozem, Deliveroo, banques) qui nécessiteraient des partenariats commerciaux. |
| **Traçabilité totale** | Toute action utilisateur ou système est horodatée et journalisée dans un journal d'audit immuable. |
| **Pas d'offline-first** | Application connectée classique (client/serveur). Pas de moteur de synchronisation ni de résolution de conflits. Un cache de **consultation** hors ligne, en lecture seule, est prévu — l'écriture exige toujours le réseau. |
| **Un seul front, web et mobile** | PWA installable et responsive-first plutôt qu'une application native. L'API reste agnostique du client. |
| **Bilingue de bout en bout** | Français et anglais dès le MVP. La base et l'API ne contiennent aucun texte lisible par un humain : uniquement des identifiants stables et des paramètres. |
| **Devises découplées** | La conversion multi-devises est un module autonome, avec des taux saisissables manuellement. Aucun abonnement à une API payante n'est requis pour faire tourner l'application. |
| **Exactitude monétaire** | Aucun montant n'est jamais stocké ou calculé en nombre flottant. |

## Documentation

Lire dans cet ordre :

| # | Document | Contenu |
|---|---|---|
| 00 | [Glossaire](docs/00-glossaire.md) | Vocabulaire métier commun |
| 01 | [Vision & périmètre](docs/01-vision-perimetre.md) | Objectifs, non-objectifs, personas, cas d'usage |
| 02 | [Architecture](docs/02-architecture.md) | Stack, découpage modulaire, règles de dépendance, événements |
| 03 | [Modèle de données](docs/03-modele-donnees.md) | Schéma complet, entités, relations, contraintes |
| 04 | [Specs par module](docs/04-modules.md) | Règles métier détaillées de chaque module |
| 05 | [API REST](docs/05-api.md) | Endpoints, conventions, erreurs, pagination |
| 06 | [Import & export](docs/06-import-export.md) | Pipeline d'import CSV/Excel, mapping, dédoublonnage, exports |
| 07 | [Sécurité & audit](docs/07-securite-audit.md) | Authentification, chiffrement, journal d'audit, données personnelles |
| 08 | [Devises](docs/08-devises.md) | Modèle multi-devises et stratégie de taux de change |
| 09 | [Roadmap](docs/09-roadmap.md) | Découpage MVP / V2 / V3, ordre d'implémentation |
| 10 | [Conventions de dev](docs/10-conventions-dev.md) | Style de code, tests, arborescence, CI, definition of done |

Les décisions d'architecture déjà tranchées sont consignées dans [docs/adr/](docs/adr/) :

| ADR | Décision |
|---|---|
| [0001](docs/adr/0001-monolithe-modulaire.md) | Monolithe modulaire plutôt que microservices |
| [0002](docs/adr/0002-montants-en-unites-mineures.md) | Montants en entiers d'unités mineures |
| [0003](docs/adr/0003-solde-stocke.md) | Solde de compte stocké, avec réconciliation |
| [0004](docs/adr/0004-abandon-offline-first.md) | Abandon de l'offline-first |
| [0005](docs/adr/0005-pas-de-connecteurs-tiers.md) | Ingestion par import de fichier, pas par connecteurs tiers |
| [0006](docs/adr/0006-devises-sans-api-externe.md) | Multi-devises sans dépendance à une API de taux |
| [0007](docs/adr/0007-strategie-mobile-pwa.md) | Mobile par PWA installable, pas d'application native |
| [0008](docs/adr/0008-cache-lecture-seule.md) | Cache de consultation hors ligne, en lecture seule |
| [0009](docs/adr/0009-internationalisation.md) | Français et anglais dès le MVP, aucune chaîne rendue en base |

`CLAUDE.md` contient les instructions destinées à l'agent d'implémentation.

## Stack retenue

- **Back-end** : NestJS (TypeScript), PostgreSQL 16, Prisma ORM
- **Front-end** : Next.js (App Router), TypeScript, TailwindCSS, TanStack Query — responsive-first, installable en PWA
- **Auth** : access token JWT en mémoire, refresh token rotatif en cookie `HttpOnly`, Argon2id
- **Push** : Web Push API (VAPID), sans service tiers propriétaire
- **Tests** : Vitest (unitaire), Supertest (API) ; Playwright (e2e) prévu mais pas encore mis en place

Les justifications de ces choix sont dans [docs/02-architecture.md](docs/02-architecture.md).

## Portée fonctionnelle du MVP

Comptes multiples · Transactions & catégories · Transactions récurrentes · Budgets avec alertes · Dettes avec échéancier · Objectifs d'épargne · Import CSV/Excel avec dédoublonnage · Export CSV/Excel · Tableau de bord patrimoine net · Prévisions de trésorerie · Rapports & graphiques · Journal d'audit.

Le détail du séquencement est dans [docs/09-roadmap.md](docs/09-roadmap.md).

## Démarrage local

```bash
npm install
docker compose up -d postgres
cp apps/api/.env.example apps/api/.env   # ajuster JWT_SECRET / IP_HASH_SALT

# Première migration (génère apps/api/prisma/migrations/) :
npm run prisma:migrate -w apps/api -- --name init
# Puis, une fois seulement, ajouter le trigger d'immuabilité de AuditLog :
# npm run prisma:migrate -w apps/api -- --create-only --name add_audit_log_immutability
# et coller le contenu de apps/api/prisma/sql/audit_log_immutable.sql dans le migration.sql généré.

npm run dev:api   # NestJS sur :3000
npm run dev:web   # Next.js sur :3001
npm run test       # money kernel + tests unitaires
npm run lint && npm run typecheck
```
