# ADR-0005 — Ingestion par import de fichier, pas par connecteurs tiers

## Statut
Accepté — 2026-07-28

## Contexte
L'idée initiale était de récupérer automatiquement les données de services tiers (Gozem, Deliveroo, banques) avec l'accord de l'utilisateur. En pratique, ces plateformes n'exposent pas d'API publique permettant à un tiers de lire l'historique de transactions d'un utilisateur ; un tel accès suppose un partenariat commercial, pas un simple flux OAuth. Les agrégateurs bancaires régulés existent mais sont payants et impliquent des obligations de conformité.

## Décision
En V1 et V2, les données entrent uniquement par saisie manuelle ou import CSV/Excel. Le module `import` est conçu comme un pipeline générique (source de mapping réutilisable, parsing tolérant, dédoublonnage), de sorte qu'un connecteur automatique puisse un jour alimenter la même chaîne.

## Conséquences
- **Bénéfice** : aucune dépendance contractuelle ou technique externe ; le produit fonctionne dès le premier jour.
- **Coût** : l'import manuel est le point de friction principal du produit et probablement la première cause d'abandon. C'est pourquoi la qualité de l'assistant d'import est traitée comme une fonctionnalité de premier plan, pas comme un utilitaire.
- **À mesurer** : taux de retour à 30 jours, comme indicateur de l'acceptabilité de l'effort d'import.
