# 06 — Import & export

Import is the main entry point for data, and therefore **friction point #1 of the product**. If import is painful, the user gives up. This document defines the pipeline and the guarantees expected.

---

## 1. Import pipeline

```
1. UPLOAD        file → temporary storage, hash, format detection
2. SNIFF         detection of delimiter, encoding, header line
3. MAPPING       file columns → Transaction fields (assisted or saved source)
4. PARSE         typed row-by-row conversion, error collection
5. ENRICH        automatic categorization by rules, label normalization
6. DEDUPE        fingerprint computation, comparison against existing data and the batch itself
7. PREVIEW       feedback to the user: to import / duplicates / errors
8. COMMIT        transactional write, balance update, audit
```

No database write before step 8. Steps 1 to 7 only produce an `ImportBatch` with status `AWAITING_REVIEW`.

---

## 2. Step 1 — Upload

| Constraint | Value |
|---|---|
| Accepted formats | `.csv`, `.tsv`, `.xlsx`, `.xls` (OFX in V2) |
| Max size | 10 MB |
| Max rows | 20,000 |
| Processing | Synchronous up to 1,000 rows, asynchronous (queued job) beyond |

The file is hashed (SHA-256). If a `COMPLETED` `ImportBatch` already exists with this hash for this user, the API responds **409** with the date of the previous import. The user can force with `?force=true`.

The raw file is kept for 30 days to allow replay and diagnostics, then automatically purged.

---

## 3. Step 2 — Automatic detection

To be detected without user intervention:

- **Encoding**: UTF-8, UTF-8 BOM, ISO-8859-1, Windows-1252. Many bank statements are still in Windows-1252; do not assume UTF-8.
- **Delimiter**: `;` `,` `\t` `|` — by counting the regularity of the number of columns.
- **Header line**: first non-numeric line whose cells are textual and distinct.
- **Preamble lines**: many statements start with title or balance lines. Detect the first regular block and propose `skipRows`.
- **Date format**: by sampling. **In case of ambiguity between `dd/MM/yyyy` and `MM/dd/yyyy` (day ≤ 12 on all rows), do not guess: ask the user.** A silent day/month swap corrupts the entire history.
- **Decimal separator**: `,` or `.`, and thousands separator (`space`, `non-breaking space`, `.`, `,`).

---

## 4. Step 3 — Mapping

### Target fields

| Field | Required | Notes |
|---|---|---|
| `occurredAt` | yes | business date |
| `amount` | yes | depends on `amountStrategy` |
| `description` | yes | |
| `payee` | no | |
| `categoryName` | no | matched by name, created if absent and if the user accepts |
| `externalRef` | no | operation reference |
| `notes` | no | |
| `accountName` | no | allows a multi-account file |

### Amount strategies (`amountStrategy`)

| Strategy | Description |
|---|---|
| `SIGNED_SINGLE_COLUMN` | One column, negative = expense, positive = income |
| `DEBIT_CREDIT_COLUMNS` | Two columns; the non-empty column determines the direction |
| `TYPE_COLUMN` | One always-positive amount column + one direction column ("debit"/"credit", "D"/"C"…), with an editable mapping table |

### Assisted mapping

Automatically propose a mapping by matching headers against a multilingual dictionary (`date`, `date opération`, `value date`, `libellé`, `libelle`, `description`, `montant`, `amount`, `débit`, `debit`, `crédit`, `credit`, `solde`, `balance`, `référence`…). The user corrects it, then can **save the mapping as a reusable `ImportSource`**. This is what makes the second import painless.

---

## 5. Step 4 — Parsing

Each row is validated. An invalid row is **collected**, not blocking:

```json
{ "row": 47, "column": "montant", "raw": "1 250,00 F", "message": "Non-numeric characters after cleanup" }
```

Cleanups applied before conversion: removal of non-breaking spaces, currency symbols, thousands separators; handling of the accounting format `(1 250,00)` = negative; removal of residual quotes.

**No floating-point rounding**: the amount is parsed as a string, split on the decimal separator, then converted to minor units by integer arithmetic, taking into account the `minorUnits` of the target account's currency.

If the number of decimals in the file exceeds `minorUnits`, the row is marked as an error rather than being silently rounded.

---

## 6. Step 5 — Enrichment

1. Computation of `normalizedLabel` (see RG-T6).
2. Application of `CategorizationRule` in descending priority order, first match retained.
3. If no rule matches, optional matching by similarity with history: if ≥ 3 past transactions have the same `normalizedLabel` and the same category, propose that category (marked "suggested", editable).
4. Uncategorized rows land in "Miscellaneous" and are highlighted in the preview.

---

## 7. Step 6 — Deduplication

Three levels, from most reliable to most heuristic:

| Level | Criterion | Handling |
|---|---|---|
| 1 — File already imported | Identical `fileHash` | Blocked upstream (409) |
| 2 — Certain duplicate | `fingerprint` identical to an existing non-deleted transaction | Marked "duplicate", **excluded by default** |
| 3 — Probable duplicate | Same account, same amount, date within ±3 days, label similarity ≥ 0.85 (Jaro-Winkler) | Marked "probable duplicate", **excluded by default**, but highlighted for arbitration |

Deduplication also applies **within the batch itself** (a file may contain the same row twice).

> **Beware of false positives.** Two identical coffees on the same day at the same place are not a duplicate. This is why nothing is ever silently deleted or ignored: duplicates are presented, pre-unchecked, and the user decides. The batch's `duplicateRows` counter keeps track of the decision.

---

## 8. Step 7 — Preview

The preview screen presents three tabs:

- **To import** (n rows) — editable table: date, label, amount, category, account.
- **Duplicates** (n rows) — with the existing transaction shown alongside, for comparison.
- **Errors** (n rows) — raw row + reason, with the ability to fix on the fly.

Available actions: bulk recategorize, exclude rows, edit a value, change the target account.

---

## 9. Step 8 — Commit

- Write in **a single PostgreSQL transaction**. If one row fails, the whole batch is rolled back.
- Each created transaction carries `importBatchId` and `source = IMPORT`.
- Account balances are updated within the same SQL transaction.
- A single `import.commit` audit entry is written for the batch, with the counters — not one entry per transaction (otherwise the log becomes unreadable). Individual transactions remain traceable via `importBatchId`.
- `ImportBatchCompleted` event emitted.

### Reverting a batch

`POST /import/batches/:id/revert`:

- Refused if a transaction from the batch has been manually modified since the import (`updatedAt > importBatch.completedAt`) — the API then lists the transactions concerned.
- Otherwise: soft delete of all transactions in the batch, balance recalculation, `revertedAt` set, `import.revert` audit entry.

---

## 10. Export

### Targeted export

`POST /export/transactions` with the same filters as `GET /transactions`.

Transaction CSV columns:

```
id, date_operation, date_enregistrement, compte, type, montant_mineur,
montant, devise, categorie, sous_categorie, beneficiaire, description,
tags, notes, statut, source, lot_import, reference_externe, groupe_transfert
```

- `montant_mineur`: exact integer, no rounding ambiguity.
- `montant`: formatted decimal value, for human and spreadsheet reading.
- UTF-8 encoding **with BOM** (otherwise Excel breaks accented characters).
- `;` delimiter by default (expected by Excel in French locale), configurable.

### Full export

ZIP archive containing: `accounts.csv`, `transactions.csv`, `categories.csv`, `tags.csv`, `budgets.csv`, `budget_periods.csv`, `debts.csv`, `debt_installments.csv`, `debt_payments.csv`, `goals.csv`, `goal_contributions.csv`, `recurrences.csv`, `categorization_rules.csv`, `exchange_rates.csv`, `audit_log.csv`, plus:

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

The archive **never** contains a password, token, or session.

### XLSX format

One tab per entity, frozen headers, amounts formatted according to currency, adjusted column widths. A "Summary" tab at the front with the main totals.

---

## 11. Reimport (restoration)

Not planned for V1, but the export format is designed to allow it: identifiers preserved, versioned `manifest.json`. To be documented before any change to the export schema.
