# Mr Wallet — Logo & Branding

Minimalist logos, no illustration. Three options proposed.

---

## 1. Wordmark (Recommended option)

**Name**: Mr Wallet  
**Typography**: Segoe UI / System stack, semibold  
**Title size**: text-2xl (24px)  
**Color**: Teal-800 (#0F766E)

```
Mr Wallet
```

Simple, readable, scalable. To be used at the top left of the header.

**Advantages**:
- No ambiguity about the product name
- Easy to recognize
- Works at all sizes (favicon, header, export)

---

## 2. Symbol + Wordmark (Compact)

**Symbol**: Rounded square with pattern

```
┌─────┐
│  {}  │  ← braces = finances/container
└─────┘
Mr Wallet
```

Or more stripped down: just the brackets/chevrons:

```
< >
Mr Wallet
```

The chevrons/braces evoke order, structure, the container (conceptual wallet).

**Colors**:
- Symbol: Teal-800
- Text: Neutral-900

**Sizes**:
- 24px × 24px symbol + 16px text (header)
- 64px × 64px symbol + 24px text (auth page)
- 192px × 192px symbol (favicon, app icon)

---

## 3. Monogram (Minimalist option)

**Initials**: MW  
**Shape**: Rounded square

```
┌─────┐
│ MW  │
└─────┘
```

Compact, works well as favicon and app icon. Less ideal for branding on first visit.

---

## Final recommendation

**Use Option 1 + Option 2**:

- **Header**: Symbol teal-800 24×24 + "Mr Wallet" (wordmark)
- **Favicon**: Symbol alone, 192×192
- **PWA splash screen**: Symbol 512×512 on teal-50 background
- **Email logo**: Symbol + "Mr Wallet"

```
┌──────┐
│  {}  │  Mr Wallet
└──────┘
```

---

## SVG implementation (to be created)

```svg
<!-- apps/web/public/logo-symbol.svg -->
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <!-- Rounded square -->
  <rect x="8" y="8" width="48" height="48" rx="8" fill="#0F766E" opacity="0.1" stroke="#0F766E" stroke-width="2"/>
  
  <!-- Symbol: stylistic braces -->
  <path d="M 24 20 Q 20 20 20 24 L 20 40 Q 20 44 24 44" 
        stroke="#0F766E" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M 40 20 Q 44 20 44 24 L 44 40 Q 44 44 40 44" 
        stroke="#0F766E" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  
  <!-- Central dash (equals-like stroke) -->
  <line x1="28" y1="32" x2="36" y2="32" stroke="#0F766E" stroke-width="1.5" opacity="0.6"/>
</svg>

<!-- Usage in a Next.js component -->
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

## Files to create

```
public/
├── logo-symbol.svg          (symbol alone)
├── logo-full.svg            (symbol + text)
├── favicon.ico              (32×32, symbol)
├── icon-192x192.png         (PWA)
├── icon-512x512.png         (PWA splash)
└── apple-touch-icon.png     (iOS)
```

**PNG generation from SVG**:

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

## Logo color palette

| Context | Color | Code |
|---|---|---|
| Primary symbol | Teal-800 | #0F766E |
| Symbol background | Teal-50 (opt.) | #F0FDFA |
| Neutral (alt.) | Neutral-900 | #111827 |
| Inverse background (dark mode) | Teal-500 | #14B8A6 |

---

## Use cases

| Location | Size | Format | Color |
|---|---|---|---|
| Header | 24×24 | SVG | Teal |
| Favicon | 32×32 | PNG | Teal |
| PWA manifest | 192×192, 512×512 | PNG | Teal |
| Email signature | 64×64 | PNG | Teal |
| Social media | 400×400 | PNG | Teal + white background |
| Print (opt.) | 1000×1000 | PDF vector | Teal |

---

## To do on the Claude Code side

1. Create the SVG file `public/logo-symbol.svg`
2. Generate the PNGs (192×192, 512×512)
3. Create the `Logo` and `LogoSymbolOnly` components
4. Add to the PWA manifest (`next.config.js`)
5. Integrate into `components/layouts/Navigation.tsx`
