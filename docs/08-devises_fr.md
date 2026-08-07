# 08 — Devises et taux de change

## 1. Le problème posé

Les API de taux de change fiables sont payantes au-delà de quotas très bas, et les offres gratuites sont instables (arrêt du service, changement de conditions, quotas revus à la baisse). Faire dépendre le cœur de l'application d'un tel service crée une fragilité disproportionnée par rapport au bénéfice.

**Décision : le multi-devises fonctionne sans aucune API externe.** Un fournisseur de taux est branchable, mais reste strictement optionnel.

---

## 2. Architecture retenue

Le module `currency` expose une interface unique de résolution de taux, alimentée par plusieurs sources en cascade :

```
                    ┌─────────────────────────┐
   demande de taux  │  CurrencyService        │
   (from, to, date) │  .getRate()             │
                    └───────────┬─────────────┘
                                │  résolution en cascade
        ┌───────────────┬───────┴────────┬──────────────────┐
        ▼               ▼                ▼                  ▼
   1. PEGGED       2. MANUAL        3. PROVIDER        4. échec
   parité fixe     saisi par        (optionnel,        → erreur explicite
   (XOF/EUR)       l'utilisateur    désactivé par        + demande de saisie
                                    défaut)              manuelle
```

### Ordre de résolution

1. **Parité fixe** (`PEGGED`) — si le couple est une parité officielle fixe, elle s'applique toujours et prime sur tout le reste.
2. **Taux manuel** (`MANUAL`) — le taux le plus récent dont `validFrom ≤ date demandée`, saisi par l'utilisateur.
3. **Fournisseur externe** (`PROVIDER`) — uniquement si un fournisseur est configuré et activé.
4. **Aucun taux disponible** — l'API renvoie une erreur explicite `EXCHANGE_RATE_UNAVAILABLE` avec le couple et la date. L'interface invite à saisir le taux. **Aucune conversion approximative n'est jamais faite silencieusement.**

---

## 3. Parités fixes

Certaines parités sont fixes par accord monétaire et n'ont pas besoin d'être mises à jour :

| Couple | Taux | Base |
|---|---|---|
| EUR → XOF | 655,957 | Parité fixe franc CFA UEMOA |
| EUR → XAF | 655,957 | Parité fixe franc CFA CEMAC |
| XOF → XAF | 1,0 | Parités identiques à l'euro |

Ces taux sont chargés en seed avec `source = PEGGED` et ne sont pas modifiables par l'utilisateur. Pour une grande partie des utilisateurs cibles (zone franc CFA + Europe), **cela couvre à soi seul le besoin de conversion sans aucune API**.

---

## 4. Saisie manuelle

L'utilisateur peut saisir un taux daté pour n'importe quel couple :

```http
POST /api/v1/currencies/rates
{ "fromCurrency": "USD", "toCurrency": "XOF", "rate": "604.25", "validFrom": "2026-07-01" }
```

- Un taux est valable de `validFrom` jusqu'au `validFrom` du taux suivant.
- L'interface propose de saisir un taux dès qu'une conversion échoue, avec le contexte (« taux USD → XOF au 12/07/2026 »).
- Un rappel mensuel optionnel invite à mettre à jour les taux utilisés.

Ce mode couvre le cas de l'utilisateur qui a quelques transactions en devise étrangère par an : saisir 3 taux dans l'année est moins coûteux qu'un abonnement.

---

## 5. Fournisseur externe (optionnel)

Interface à implémenter côté serveur, **désactivée par défaut** :

```ts
interface ExchangeRateProvider {
  name: string;
  getRate(from: string, to: string, at: Date): Promise<Decimal | null>;
  getSupportedPairs(): Promise<string[]>;
}
```

Contraintes d'implémentation :

| Contrainte | Détail |
|---|---|
| Activation | Variable d'environnement `EXCHANGE_RATE_PROVIDER` non renseignée = désactivé. L'application doit fonctionner intégralement sans. |
| Persistance | Tout taux récupéré est **écrit en base** avec `source = PROVIDER`. On n'appelle jamais deux fois pour la même date et le même couple. |
| Fréquence | Au maximum un appel par couple et par jour, déclenché à la demande, pas en tâche planifiée sur toutes les devises. |
| Défaillance | Une panne du fournisseur ne doit jamais faire échouer une opération métier : on retombe sur le dernier taux connu, en signalant sa date. |
| Isolation | Le fournisseur ne reçoit que des codes devise et des dates. Jamais de montant, jamais d'identifiant utilisateur. |

### Alternative sans abonnement

La Banque centrale européenne publie un flux de taux de référence quotidiens en accès libre. C'est une piste réaliste pour un provider par défaut si le besoin s'en fait sentir, mais elle ne couvre que les devises cotées par la BCE et n'est pas retenue comme dépendance en V1. À évaluer au moment d'implémenter le provider, en vérifiant les conditions d'usage en vigueur.

---

## 6. Règles de conversion

| Règle | Énoncé |
|---|---|
| RG-X1 | Une transaction est **toujours** stockée dans la devise de son compte. Aucune conversion à l'écriture. |
| RG-X2 | La conversion n'intervient qu'à la **consolidation** (patrimoine net, rapports multi-comptes, budgets multi-devises). |
| RG-X3 | Le taux appliqué est celui en vigueur **à la date de la transaction** (`occurredAt`), pas le taux du jour. Sinon l'historique change rétroactivement à chaque variation de change, ce qui rend les rapports incomparables d'un jour à l'autre. |
| RG-X4 | Tout montant converti est affiché avec une mention explicite (« converti au taux du 12/07/2026 ») et la valeur d'origine reste consultable. |
| RG-X5 | Les calculs de conversion utilisent `Decimal(24,12)` pour le taux, puis un arrondi banker's rounding vers les `minorUnits` de la devise cible. |
| RG-X6 | Convertir puis reconvertir n'est jamais garanti sans perte. Ne jamais stocker le résultat d'une conversion comme valeur de référence. |

### Formule

```
montant_cible_mineur = round(
    montant_source_mineur
    × 10^(minorUnits_cible − minorUnits_source)
    × taux
)
```

Le facteur `10^(Δ minorUnits)` est indispensable : convertir 10 EUR (`amountMinor = 1000`, 2 décimales) en XOF (0 décimale) ne peut pas se contenter de multiplier par le taux.

**Test de référence obligatoire** : 10,00 EUR → XOF au taux 655,957 doit donner exactement 6 560 XOF (`amountMinor = 6560`), et non 655 957 ni 65,60.

---

## 7. Devise de référence

`user.baseCurrency` est la devise de consolidation. La changer :

- ne modifie **aucune** transaction ni aucun solde de compte ;
- invalide tous les rapports en cache ;
- est journalisée dans l'audit ;
- est signalée à l'utilisateur comme une opération pouvant modifier l'apparence de tout l'historique consolidé.

---

## 8. Cas limites

| Cas | Traitement |
|---|---|
| Transfert entre comptes de devises différentes | Les deux jambes portent chacune leur montant réel. Le taux effectif est celui de l'opération réelle, pas un taux de marché. |
| Devise sans taux disponible à une date ancienne | Erreur explicite, invitation à saisir. Pas d'extrapolation. |
| Devise à 3 décimales (TND, BHD, KWD) | Supportée par `minorUnits = 3`. C'est précisément pourquoi la précision n'est jamais codée en dur. |
| Devise supprimée ou redénominée | Hors périmètre V1. À traiter par saisie manuelle d'un taux de conversion daté. |
