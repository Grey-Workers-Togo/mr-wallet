# Déploiement — Mr Wallet

Front (`apps/web`) sur Vercel, API (`apps/api`) + Postgres sur un VPS derrière Caddy (HTTPS auto), base de données optionnellement sur Neon si tu préfères ne pas gérer Postgres toi-même.

---

## 1. Prérequis

- Un nom de domaine (ex. acheté chez LWS, OVH, peu importe le registrar)
- Un VPS (Hetzner CX22 ou moins suffit — 2 vCPU / 4 Go RAM largement assez pour api+postgres seuls ; 2 Go suffit même si Postgres est ailleurs, ex. Neon)
- Ubuntu 24.04 LTS sur le VPS
- Un compte Vercel
- (Optionnel) Un compte Neon si tu ne veux pas héberger Postgres toi-même

---

## 2. DNS

Chez ton registrar, ajoute un enregistrement **A** :

```
api.tondomaine.com  →  <IP du VPS>
```

Propagation : quelques minutes à quelques heures. Vérifie avec `dig api.tondomaine.com` ou `nslookup`.

Le certificat HTTPS (étape 5) échouera tant que ce DNS n'est pas propagé.

---

## 3. Générer les secrets

En local ou sur le VPS :

```bash
openssl rand -base64 48   # → JWT_SECRET
openssl rand -base64 32   # → IP_HASH_SALT
```

Clés VAPID (notifications push, optionnel — laisser vide désactive juste le push) :

```bash
cd apps/api
npx web-push generate-vapid-keys
```

Garde ces valeurs de côté, elles vont dans `.env` à l'étape 6.

---

## 4. Préparer le VPS

```bash
ssh root@<IP-du-VPS>

# Docker
curl -fsSL https://get.docker.com | sh

# Clone du repo
git clone <url-du-repo>
cd budget_manager
```

---

## 5. Configurer `.env`

```bash
cp .env.prod.example .env
nano .env
```

Remplis :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | URL de connexion Neon (variante **unpooled**, pas celle avec PgBouncer) |
| `JWT_SECRET` | valeur générée étape 3 |
| `IP_HASH_SALT` | valeur générée étape 3 |
| `CORS_ORIGIN` | URL Vercel du front, ex. `https://ton-app.vercel.app` |
| `API_DOMAIN` | `api.tondomaine.com` |
| `NEXT_PUBLIC_API_URL` | `https://api.tondomaine.com/api/v1` (sert seulement si tu buildes `web` toi-même — sinon c'est la même valeur à mettre dans Vercel, voir étape 8) |
| `VAPID_*` | valeurs générées étape 3, ou laisser vide |

Si tu préfères héberger Postgres toi-même plutôt que Neon : décommente `POSTGRES_USER/PASSWORD/DB` dans `.env`, mets `DATABASE_URL=postgresql://user:password@postgres:5432/db?schema=public` (host `postgres` = nom du service compose), et lance avec `--profile local-db` (voir étape 6).

---

## 6. Lancer la stack

Front hébergé sur Vercel, DB sur Neon (cas standard) :

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build api caddy
```

Avec Postgres auto-hébergé (au lieu de Neon) :

```bash
docker compose -f docker-compose.prod.yml --env-file .env --profile local-db up -d --build
```

Front auto-hébergé aussi (ajoute `web` à la commande utilisée) :

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build api caddy web
```

Caddy récupère automatiquement le certificat Let's Encrypt pour `API_DOMAIN` au démarrage (le DNS doit déjà pointer sur le VPS, voir étape 2). L'API n'est plus exposée directement sur le port 3000 — uniquement via Caddy en HTTPS.

Au premier démarrage, l'API applique les migrations Prisma automatiquement (`prisma migrate deploy`, voir `apps/api/Dockerfile`).

---

## 7. Vérifier l'API

```bash
curl -i https://api.tondomaine.com/api/v1/currencies
```

Doit répondre `200 OK` avec du JSON (liste vide si la base n'est pas encore seedée — normal, pas de currencies système = pas de comptes créables tant que non seedé, voir étape 7bis).

### 7bis. Seed des devises (une fois)

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec api npm run prisma:seed
```

---

## 8. Déployer le front sur Vercel

1. vercel.com → **Add New Project** → importe le repo GitHub
2. **Root Directory** : `apps/web`
3. **Environment Variables** :
   - `NEXT_PUBLIC_API_URL` = `https://api.tondomaine.com/api/v1`
4. **Deploy**
5. (Optionnel) Ajoute ton propre domaine front dans Project Settings → Domains

Si l'URL Vercel change (nouveau projet, domaine custom différent de la valeur mise dans `CORS_ORIGIN`), reviens sur le VPS et corrige `CORS_ORIGIN` dans `.env`, puis :

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build api
```

---

## 9. Vérification finale

- Ouvre l'app Vercel dans le navigateur
- Crée un compte (`/register`)
- Vérifie que login/logout marche (cookie refresh `secure: true` — ne fonctionne qu'en HTTPS, donc uniquement via l'URL Vercel/domaine, jamais en accédant à l'API en HTTP direct)
- Crée un compte bancaire, une transaction — confirme que les écrans CRUD marchent bout en bout

---

## Mises à jour ultérieures

```bash
cd budget_manager
git pull
docker compose -f docker-compose.prod.yml --env-file .env up -d --build postgres api caddy
```

Les migrations Prisma s'appliquent automatiquement au redémarrage du conteneur `api`. Le front Vercel se redéploie automatiquement sur chaque push (si connecté au repo).

---

## Ce qui n'est pas géré ici

- Sauvegardes Postgres (si tu n'utilises pas Neon, qui les gère nativement) — à mettre en place séparément (`pg_dump` cron, ou passer sur Neon)
- Monitoring/alerting (uptime, logs) — rien de configuré, à ajouter selon besoin
- `npm audit` — vulnérabilités des dépendances non auditées ici, à vérifier avant mise en prod réelle
