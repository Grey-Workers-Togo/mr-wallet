# Mr Wallet — Logo & Branding

Logos minimalistes, sans illustration. Trois options proposées.

---

## 1. Wordmark (Option recommandée)

**Nom** : Mr Wallet  
**Typographie** : Segoe UI / System stack, semibold  
**Taille titre** : text-2xl (24px)  
**Couleur** : Teal-800 (#0F766E)

```
Mr Wallet
```

Simple, lisible, scalable. À utiliser en haut à gauche du header.

**Avantages** :
- Pas d'ambiguïté sur le nom du produit
- Facile à reconnaître
- Fonctionne à toutes les tailles (favicon, header, export)

---

## 2. Symbol + Wordmark (Compact)

**Symbol** : Carré arrondi avec motif

```
┌─────┐
│  {}  │  ← accolades = finances/conteneur
└─────┘
Mr Wallet
```

Ou plus épuré : juste les crochets/chevrons :

```
< >
Mr Wallet
```

Les chevrons/accolades évoquent l'ordre, la structure, le conteneur (portefeuille conceptuel).

**Couleurs** :
- Symbol : Teal-800
- Text : Neutral-900

**Tailles** :
- 24px × 24px symbol + 16px text (header)
- 64px × 64px symbol + 24px text (auth page)
- 192px × 192px symbol (favicon, app icon)

---

## 3. Monogramme (Option minimaliste)

**Initiales** : MW  
**Forme** : Carré arrondi

```
┌─────┐
│ MW  │
└─────┘
```

Compact, fonctionne bien en favicon et app icon. Moins idéal pour le branding à la première visite.

---

## Recommandation finale

**Utilise l'Option 1 + Option 2** :

- **Header** : Symbol teal-800 24×24 + "Mr Wallet" (wordmark)
- **Favicon** : Symbol seul, 192×192
- **Splash screen PWA** : Symbol 512×512 sur fond teal-50
- **Logo email** : Symbol + "Mr Wallet"

```
┌──────┐
│  {}  │  Mr Wallet
└──────┘
```

---

## Implémentation SVG (à créer)

```svg
<!-- apps/web/public/logo-symbol.svg -->
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <!-- Carré arrondi -->
  <rect x="8" y="8" width="48" height="48" rx="8" fill="#0F766E" opacity="0.1" stroke="#0F766E" stroke-width="2"/>
  
  <!-- Symbole : accolades stylistiques -->
  <path d="M 24 20 Q 20 20 20 24 L 20 40 Q 20 44 24 44" 
        stroke="#0F766E" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M 40 20 Q 44 20 44 24 L 44 40 Q 44 44 40 44" 
        stroke="#0F766E" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  
  <!-- Tiret central (trait d'égalité) -->
  <line x1="28" y1="32" x2="36" y2="32" stroke="#0F766E" stroke-width="1.5" opacity="0.6"/>
</svg>

<!-- Usage en composant Next.js -->
<!-- components/shared/Logo.tsx -->
import Image from "next/image";

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Image
        src="/logo-symbol.svg"
        alt="Mr Wallet"
        width={size}
        height={size}
        className="text-primary"
      />
      <span className="hidden sm:inline text-xl font-semibold text-neutral-900">
        Mr Wallet
      </span>
    </div>
  );
}

export function LogoSymbolOnly({ size = 24 }: { size?: number }) {
  return (
    <Image
      src="/logo-symbol.svg"
      alt="Mr Wallet"
      width={size}
      height={size}
    />
  );
}
```

---

## Fichiers à créer

```
public/
├── logo-symbol.svg          (symbol seul)
├── logo-full.svg            (symbol + texte)
├── favicon.ico              (32×32, symbol)
├── icon-192x192.png         (PWA)
├── icon-512x512.png         (PWA splash)
└── apple-touch-icon.png     (iOS)
```

**Génération PNG depuis SVG** :

```bash
# Via sharp (Node.js)
npm install sharp
```

```js
const sharp = require('sharp');

sharp('logo-symbol.svg')
  .png()
  .resize(192, 192)
  .toFile('public/icon-192x192.png');

sharp('logo-symbol.svg')
  .png()
  .resize(512, 512)
  .toFile('public/icon-512x512.png');
```

---

## Palette de couleurs du logo

| Contexte | Couleur | Code |
|---|---|---|
| Symbol primaire | Teal-800 | #0F766E |
| Background symbol | Teal-50 (opt.) | #F0FDFA |
| Neutral (alt.) | Neutral-900 | #111827 |
| Fond inverse (dark mode) | Teal-500 | #14B8A6 |

---

## Cas d'usage

| Lieu | Taille | Format | Couleur |
|---|---|---|---|
| Header | 24×24 | SVG | Teal |
| Favicon | 32×32 | PNG | Teal |
| PWA manifest | 192×192, 512×512 | PNG | Teal |
| Email signature | 64×64 | PNG | Teal |
| Social media | 400×400 | PNG | Teal + fond blanc |
| Print (opt.) | 1000×1000 | PDF vector | Teal |

---

## À faire côté Claude Code

1. Créer le fichier SVG `public/logo-symbol.svg`
2. Générer les PNG (192×192, 512×512)
3. Créer le composant `Logo` et `LogoSymbolOnly`
4. Ajouter au manifest PWA (`next.config.js`)
5. Intégrer dans `components/layouts/Navigation.tsx`

