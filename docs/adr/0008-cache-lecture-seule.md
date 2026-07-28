# ADR-0008 — Cache de consultation hors ligne, en lecture seule

## Statut
Accepté — 2026-07-28
Nuance l'[ADR-0004](0004-abandon-offline-first.md), qui reste en vigueur.

## Contexte

L'ADR-0004 écarte l'offline-first : pas de base locale synchronisée, pas de résolution de conflits. La raison tient toujours — c'est l'**écriture** hors ligne qui crée la complexité (deux appareils modifient la même transaction, quel solde fait foi ?).

Mais avec le choix d'une PWA installable (ADR-0007), l'usage mobile devient central, et l'attente change : ouvrir son application de budget dans un transport souterrain pour vérifier un solde est un cas d'usage banal. Un écran vide dans cette situation est perçu comme une panne.

La distinction utile n'est donc pas « en ligne / hors ligne » mais **« lecture / écriture »**. La lecture hors ligne coûte une fraction d'un offline-first et couvre l'essentiel de la frustration.

## Décision

Un service worker met en cache un **sous-ensemble borné de données, en lecture seule**.

### Périmètre du cache

| Donnée | Mise en cache |
|---|---|
| Comptes et soldes courants | Oui |
| 90 derniers jours de transactions | Oui |
| Catégories, tags | Oui |
| Périodes budgétaires en cours | Oui |
| Dettes : synthèse et prochaine échéance | Oui |
| Objectifs et progression | Oui |
| Rapports et prévisions | **Non** — calculés serveur, potentiellement lourds |
| Journal d'audit | **Non** |
| Historique au-delà de 90 jours | **Non** |

### Comportement en l'absence de réseau

- Les écrans de consultation s'affichent depuis le cache, avec un bandeau permanent indiquant **« Hors ligne — données du <date/heure de dernière synchronisation> »**.
- Toute action d'écriture est **désactivée**, pas mise en file. Les boutons sont grisés avec une explication, jamais une erreur après coup.
- Au retour du réseau, le cache est rafraîchi et le bandeau disparaît.

### Règles

| Règle | Énoncé |
|---|---|
| RG-OF1 | Aucune écriture n'est jamais bufferisée localement. Pas de file d'attente d'opérations, pas de synchronisation différée. C'est ce qui distingue ce cache d'un offline-first. |
| RG-OF2 | Toute donnée servie depuis le cache est visuellement marquée comme telle, avec sa date de fraîcheur. Un solde périmé affiché comme un solde à jour est pire que pas de solde du tout. |
| RG-OF3 | Le cache est chiffré au repos et **purgé à la déconnexion**, ainsi qu'à l'expiration du refresh token. |
| RG-OF4 | Le cache expire au bout de 7 jours sans rafraîchissement. Au-delà, l'application affiche un écran « données trop anciennes » plutôt que des chiffres douteux. |
| RG-OF5 | Le verrouillage applicatif (PIN) s'applique aussi à l'accès aux données en cache. |

## Conséquences

**Bénéfices** — L'application reste utile sans réseau pour ce qui compte le plus (« combien il me reste »). Aucune complexité de résolution de conflits : le serveur reste la seule source de vérité, en permanence.

**Coûts** — Un service worker à maintenir, une stratégie d'invalidation, et des données financières stockées sur l'appareil (d'où le chiffrement et la purge à la déconnexion). L'interface doit gérer proprement trois états au lieu de deux : en ligne, hors ligne avec cache valide, hors ligne avec cache périmé.

**Position** — Cette décision ne rouvre pas l'offline-first. Si un besoin d'écriture hors ligne apparaît, il fera l'objet d'une ADR distincte, avec le chantier de synchronisation que cela suppose.

## Séquencement

Implémenté au **lot 7** (finition MVP), pas avant. Le cache s'ajoute à une application qui fonctionne ; l'introduire trop tôt complique le débogage de tout le reste.
