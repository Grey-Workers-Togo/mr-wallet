# 06 — Import & export

L'import est la principale porte d'entrée des données, et donc **le point de friction n°1 du produit**. Si l'import est pénible, l'utilisateur abandonne. Ce document définit le pipeline et les garanties attendues.

---

## 1. Pipeline d'import

```
1. UPLOAD        fichier → stockage temporaire, hash, détection de format
2. SNIFF         détection du délimiteur, de l'encodage, de la ligne d'en-tête
3. MAPPING       colonnes du fichier → champs de Transaction (assisté ou source enregistrée)
4. PARSE         conversion typée ligne à ligne, collecte des erreurs
5. ENRICH        catégorisation automatique par règles, normalisation des libellés
6. DEDUPE        calcul des empreintes, comparaison à l'existant et au lot lui-même
7. PREVIEW       restitution à l'utilisateur : à importer / doublons / erreurs
8. COMMIT        écriture transactionnelle, mise à jour des soldes, audit
```

Aucune écriture en base avant l'étape 8. Les étapes 1 à 7 ne produisent qu'un `ImportBatch` en statut `AWAITING_REVIEW`.

---

## 2. Étape 1 — Upload

| Contrainte | Valeur |
|---|---|
| Formats acceptés | `.csv`, `.tsv`, `.xlsx`, `.xls` (OFX en V2) |
| Taille max | 10 Mo |
| Lignes max | 20 000 |
| Traitement | Synchrone jusqu'à 1 000 lignes, asynchrone (job en file) au-delà |

Le fichier est haché (SHA-256). Si un `ImportBatch` `COMPLETED` existe déjà avec ce hash pour cet utilisateur, l'API répond **409** avec la date de l'import précédent. L'utilisateur peut forcer avec `?force=true`.

Le fichier brut est conservé 30 jours pour permettre le rejeu et le diagnostic, puis purgé automatiquement.

---

## 3. Étape 2 — Détection automatique

À détecter sans intervention de l'utilisateur :

- **Encodage** : UTF-8, UTF-8 BOM, ISO-8859-1, Windows-1252. Beaucoup de relevés bancaires sont encore en Windows-1252 ; ne pas présumer UTF-8.
- **Délimiteur** : `;` `,` `\t` `|` — par comptage de la régularité du nombre de colonnes.
- **Ligne d'en-tête** : première ligne non numérique dont les cellules sont textuelles et distinctes.
- **Lignes de préambule** : beaucoup de relevés commencent par des lignes de titre ou de solde. Détecter le premier bloc régulier et proposer `skipRows`.
- **Format de date** : par échantillonnage. **En cas d'ambiguïté entre `dd/MM/yyyy` et `MM/dd/yyyy` (jour ≤ 12 sur toutes les lignes), ne pas deviner : demander à l'utilisateur.** Une inversion silencieuse jour/mois corrompt tout l'historique.
- **Séparateur décimal** : `,` ou `.`, et séparateur de milliers (`espace`, `espace insécable`, `.`, `,`).

---

## 4. Étape 3 — Mapping

### Champs cibles

| Champ | Obligatoire | Notes |
|---|---|---|
| `occurredAt` | oui | date métier |
| `amount` | oui | selon `amountStrategy` |
| `description` | oui | |
| `payee` | non | |
| `categoryName` | non | rapproché par nom, créé si absent et si l'utilisateur l'accepte |
| `externalRef` | non | référence de l'opération |
| `notes` | non | |
| `accountName` | non | permet un fichier multi-comptes |

### Stratégies de montant (`amountStrategy`)

| Stratégie | Description |
|---|---|
| `SIGNED_SINGLE_COLUMN` | Une colonne, négatif = dépense, positif = revenu |
| `DEBIT_CREDIT_COLUMNS` | Deux colonnes ; la colonne non vide détermine le sens |
| `TYPE_COLUMN` | Une colonne de montant toujours positive + une colonne de sens (« débit »/« crédit », « D »/« C »…), avec table de correspondance saisissable |

### Mapping assisté

Proposer automatiquement une correspondance par rapprochement des en-têtes avec un dictionnaire multilingue (`date`, `date opération`, `value date`, `libellé`, `libelle`, `description`, `montant`, `amount`, `débit`, `debit`, `crédit`, `credit`, `solde`, `balance`, `référence`…). L'utilisateur corrige, puis peut **enregistrer le mapping comme `ImportSource` réutilisable**. C'est ce qui rend le deuxième import indolore.

---

## 5. Étape 4 — Parsing

Chaque ligne est validée. Une ligne invalide est **collectée**, pas bloquante :

```json
{ "row": 47, "column": "montant", "raw": "1 250,00 F", "message": "Caractères non numériques après nettoyage" }
```

Nettoyages appliqués avant conversion : suppression des espaces insécables, des symboles de devise, des séparateurs de milliers ; gestion du format comptable `(1 250,00)` = négatif ; suppression des guillemets résiduels.

**Aucun arrondi flottant** : le montant est parsé en chaîne, découpé sur le séparateur décimal, puis converti en unités mineures par arithmétique entière, en tenant compte des `minorUnits` de la devise du compte cible.

Si le nombre de décimales du fichier dépasse `minorUnits`, la ligne est mise en erreur plutôt qu'arrondie silencieusement.

---

## 6. Étape 5 — Enrichissement

1. Calcul de `normalizedLabel` (voir RG-T6).
2. Application des `CategorizationRule` par priorité décroissante, première correspondance retenue.
3. Si aucune règle ne correspond, rapprochement optionnel par similarité avec l'historique : si ≥ 3 transactions passées ont le même `normalizedLabel` et la même catégorie, proposer cette catégorie (marquée « suggérée », modifiable).
4. Les lignes non catégorisées atterrissent dans « Divers » et sont mises en évidence dans l'aperçu.

---

## 7. Étape 6 — Dédoublonnage

Trois niveaux, du plus sûr au plus heuristique :

| Niveau | Critère | Traitement |
|---|---|---|
| 1 — Fichier déjà importé | `fileHash` identique | Blocage en amont (409) |
| 2 — Doublon certain | `fingerprint` identique à une transaction existante non supprimée | Marqué « doublon », **exclu par défaut** |
| 3 — Doublon probable | Même compte, même montant, date à ±3 jours, similarité du libellé ≥ 0,85 (Jaro-Winkler) | Marqué « doublon probable », **exclu par défaut**, mais mis en avant pour arbitrage |

Le dédoublonnage s'applique aussi **à l'intérieur du lot** (un fichier peut contenir deux fois la même ligne).

> **Attention au faux positif.** Deux cafés identiques le même jour au même endroit ne sont pas un doublon. C'est pourquoi rien n'est jamais supprimé ni ignoré silencieusement : les doublons sont présentés, pré-décochés, et l'utilisateur tranche. Le compteur `duplicateRows` du lot conserve la trace de la décision.

---

## 8. Étape 7 — Prévisualisation

L'écran d'aperçu présente trois onglets :

- **À importer** (n lignes) — tableau éditable : date, libellé, montant, catégorie, compte.
- **Doublons** (n lignes) — avec la transaction existante en regard, pour comparaison.
- **Erreurs** (n lignes) — ligne brute + motif, avec possibilité de corriger à la volée.

Actions disponibles : recatégoriser en lot, exclure des lignes, modifier une valeur, changer le compte cible.

---

## 9. Étape 8 — Commit

- Écriture dans **une seule transaction PostgreSQL**. Si une ligne échoue, tout le lot est annulé.
- Chaque transaction créée porte `importBatchId` et `source = IMPORT`.
- Les soldes de comptes sont mis à jour dans la même transaction SQL.
- Une seule entrée d'audit `import.commit` est écrite pour le lot, avec les compteurs — pas une entrée par transaction (sinon le journal devient illisible). Les transactions individuelles restent traçables par `importBatchId`.
- Événement `ImportBatchCompleted` émis.

### Annulation d'un lot

`POST /import/batches/:id/revert` :

- Refusé si une transaction du lot a été modifiée manuellement depuis l'import (`updatedAt > importBatch.completedAt`) — l'API liste alors les transactions concernées.
- Sinon : soft delete de toutes les transactions du lot, recalcul des soldes, `revertedAt` renseigné, entrée d'audit `import.revert`.

---

## 10. Export

### Export ciblé

`POST /export/transactions` avec les mêmes filtres que `GET /transactions`.

Colonnes du CSV de transactions :

```
id, date_operation, date_enregistrement, compte, type, montant_mineur,
montant, devise, categorie, sous_categorie, beneficiaire, description,
tags, notes, statut, source, lot_import, reference_externe, groupe_transfert
```

- `montant_mineur` : entier exact, sans ambiguïté d'arrondi.
- `montant` : valeur décimale formatée, pour lecture humaine et tableur.
- Encodage UTF-8 **avec BOM** (sinon Excel casse les accents).
- Séparateur `;` par défaut (attendu par Excel en locale française), configurable.

### Export intégral

Archive ZIP contenant : `accounts.csv`, `transactions.csv`, `categories.csv`, `tags.csv`, `budgets.csv`, `budget_periods.csv`, `debts.csv`, `debt_installments.csv`, `debt_payments.csv`, `goals.csv`, `goal_contributions.csv`, `recurrences.csv`, `categorization_rules.csv`, `exchange_rates.csv`, `audit_log.csv`, plus :

```json
// manifest.json
{
  "exportedAt": "2026-07-28T14:32:11Z",
  "schemaVersion": "1.0.0",
  "userId": "usr_...",
  "baseCurrency": "XOF",
  "files": [{ "name": "transactions.csv", "rows": 1284, "sha256": "..." }]
}
```

L'archive ne contient **jamais** de mot de passe, de token ni de session.

### Format XLSX

Un onglet par entité, en-têtes figés, montants formatés selon la devise, largeurs de colonnes ajustées. Un onglet « Synthèse » en tête avec les totaux principaux.

---

## 11. Réimport (restauration)

Non prévu en V1, mais le format d'export est conçu pour le permettre : identifiants conservés, `manifest.json` versionné. À documenter avant toute évolution du schéma d'export.
