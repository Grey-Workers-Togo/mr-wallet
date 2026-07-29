# Mr Wallet — Design System

Guide pour Claude Code. Toutes les interfaces suivent ces normes.

---

## 1. Palette de couleurs

```css
/* Brand — accent principal */
--color-primary: #0F766E        /* teal-800 */
--color-primary-light: #14B8A6  /* teal-500 */
--color-primary-dark: #0D4F47   /* teal-900 */

/* Neutrals — texte, arrière-plans */
--color-neutral-50: #F9FAFB    /* gris très clair, backgrounds */
--color-neutral-100: #F3F4F6   /* gris clair, borders */
--color-neutral-200: #E5E7EB
--color-neutral-400: #9CA3AF
--color-neutral-600: #4B5563   /* texte secondaire */
--color-neutral-900: #111827   /* texte principal */

/* Sémantiques */
--color-success: #10B981  /* vert */
--color-warning: #F59E0B  /* orange */
--color-error: #EF4444   /* rouge */
--color-info: #3B82F6    /* bleu */

/* Surfaces */
--color-bg-primary: #FFFFFF
--color-bg-secondary: #F9FAFB
--color-border: #E5E7EB
```

**Rationale** : Teal pour la confiance financière, neutral gris pour la lisibilité, contrastes WCAG AA.

---

## 2. Typographie

```css
/* Font stack */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

/* Sizes */
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
--text-2xl: 1.5rem;    /* 24px */
--text-3xl: 1.875rem;  /* 30px */

/* Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;

/* Line heights */
--leading-tight: 1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.625;
```

**Heading hierarchy** :
- `h1` : text-3xl / semibold (titres pages)
- `h2` : text-2xl / semibold (sections)
- `h3` : text-lg / medium (sous-sections)
- `body` : text-base / normal
- `caption` : text-sm / normal (labels, aides)

---

## 3. Espacements (scale 4px)

```
4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px
```

**Utilisation** :
- Padding interne des composants : 12px ou 16px
- Margin entre composants : 16px ou 24px
- Gap dans les grilles : 16px
- Espaces verticaux (section) : 24px ou 32px

---

## 4. Composants shadcn/ui à créer

**Priorité 1 (foundation)** :
- [ ] `Button` (primary, secondary, ghost, size variants)
- [ ] `Input` (text, number, avec labels et helper text)
- [ ] `Select` (dropdown)
- [ ] `Card` (container basique avec padding)
- [ ] `Badge` (pour tags, status)

**Priorité 2 (formulaires)** :
- [ ] `Form` (wrapper + context)
- [ ] `Checkbox`
- [ ] `Radio`
- [ ] `Textarea`
- [ ] `DatePicker`

**Priorité 3 (navigation & layout)** :
- [ ] `Navigation` (top bar avec logo, user menu)
- [ ] `Sidebar` (menu latéral, Lot 7)
- [ ] `Breadcrumb`

**Priorité 4 (données)** :
- [ ] `Table` (pagination, tri)
- [ ] `Dialog` (modals)
- [ ] `Toast` (notifications)
- [ ] `Tabs` (onglets)

**Priorité 5 (données avancées)** :
- [ ] `Sheet` (drawer latéral)
- [ ] `Popover`
- [ ] `Tooltip`

---

## 5. Conventions de nommage

### Dossiers

```
apps/web/
├── app/                    # App Router pages
│   ├── (auth)/            # Group non-authentifiée
│   │   ├── login/
│   │   ├── register/
│   │   └── layout.tsx
│   ├── (authenticated)/   # Group authentifiée (middleware)
│   │   ├── dashboard/
│   │   ├── accounts/
│   │   ├── transactions/
│   │   ├── budgets/
│   │   ├── debts/
│   │   ├── goals/
│   │   ├── reports/
│   │   ├── settings/
│   │   └── layout.tsx     # ProtectedLayout + Sidebar
│   └── layout.tsx         # Root
├── components/
│   ├── ui/                # shadcn/ui customisés
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   └── ...
│   ├── forms/             # Formulaires métier (Login, CreateTransaction, etc.)
│   ├── layouts/           # Layouts (Navigation, Sidebar)
│   └── shared/            # Réutilisables (Logo, Avatar, etc.)
├── lib/
│   ├── api.ts             # Client API (TanStack Query)
│   ├── money.ts           # Money formatting
│   ├── dates.ts           # Date formatting (Intl)
│   └── cn.ts              # classNamess utility
├── hooks/                 # Custom hooks (useAuth, useBudget, etc.)
├── messages/              # i18n (fr.json, en.json)
└── styles/
    ├── globals.css        # Reset + variables CSS
    └── theme.css          # Couleurs, typo
```

### Fichiers de composants

```
components/ui/button.tsx          (shadcn/ui généré)
components/forms/LoginForm.tsx     (form métier)
components/TransactionCard.tsx     (composant réutilisable)
```

**Noms** :
- Composants métier : PascalCase (ex: `TransactionTable.tsx`)
- Composants UI : kebab-case en imports, PascalCase en définition (convention shadcn)
- Hooks : camelCase (ex: `useAuth.ts`)
- Utilitaires : camelCase (ex: `formatMoney.ts`)

### Classes Tailwind

```tsx
// ✅ Bon : semantic classes via cn()
<button className={cn(
  "inline-flex items-center justify-center",
  "px-4 py-2 rounded-lg",
  "bg-primary text-white",
  "hover:bg-primary-dark transition-colors",
  "disabled:opacity-50 disabled:cursor-not-allowed"
)}>
  Click
</button>

// ❌ Mauvais : classes arbitraires
<button className="w-[100px] bg-[#0F766E]">
```

**Principe** : Classes Tailwind standard + variables CSS pour les couleurs.

---

## 6. Ordre d'implémentation des écrans

### Lot 1 (Identité)

1. **`/auth/register`** — formulaire : email, password, baseCurrency, timezone
2. **`/auth/login`** — formulaire : email, password
3. **`/me`** — profil : affichage, édition, logout
4. **`/accounts`** — liste + création de comptes

**Composants créés** : Button, Input, Card, Form, Select, Navigation

### Lot 2 (Transactions)

5. **`/transactions`** — liste paginée, filtres, saisie rapide
6. **`/transactions/:id`** — détail + édition
7. **Sidebar** — menu latéral permanent

**Composants créés** : Table, DatePicker, Badge, Sidebar

### Lot 3 (Import/Export)

8. **`/import`** — assistant 4 étapes
9. **Menu export** — bouton dans les pages de données

**Composants créés** : Tabs, Dialog, Progress

### Lot 4 (Budgets)

10. **`/budgets`** — jauges, liste, création
11. **`/recurrences`** — liste, création

**Composants créés** : ProgressBar, Toast (notifications)

### Lot 5 (Dettes)

12. **`/debts`** — liste, détail, échéancier, paiement

**Composants créés** : Accordion (pour écheancier déroulable)

### Lot 6 (Rapports)

13. **`/dashboard`** — vue d'ensemble (patrimoine net, cashflow)
14. **`/reports`** — rapports détaillés avec graphiques
15. **`/forecast`** — prévisions de trésorerie

**Composants créés** : Recharts intégré, Tooltip

### Lot 7 (Finition)

16. **`/settings`** — préférences complètes
17. **Audit log** — frise chronologique (voir détail entité)
18. **PWA** — manifest, service worker
19. **Dark mode** (optionnel V2)

---

## 7. Responsive design

**Breakpoints Tailwind** (défaut Next.js + Tailwind) :

```
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

**Stratégie mobile-first** :

```tsx
// ✅ Bon : mobile par défaut, tablette+
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map(item => (...))}
</div>

// ❌ Mauvais : desktop par défaut, shrink sur mobile
<div className="flex flex-col-reverse md:flex-row">
```

**Cibles tactiles** : ≥ 44px × 44px sur mobile.

---

## 8. Accessibilité minimale

Chaque écran doit passer `axe` DevTools sans erreurs critiques :

- Labels explicites sur tous les inputs (`htmlFor` sur `<label>`)
- Images ont `alt`
- Boutons ont du texte ou `aria-label`
- Contrastes WCAG AA
- Navigation au clavier (Tab, Enter, Esc)
- Landmarks : `<main>`, `<nav>`, `<aside>`

---

## 9. Exemple : écran de connexion

```tsx
// apps/web/app/(auth)/login/page.tsx
import { LoginForm } from "@/components/forms/LoginForm";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-neutral-50">
      <Card className="w-full max-w-sm p-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-neutral-900">
            Sign in to Mr Wallet
          </h1>
          <p className="text-sm text-neutral-600">
            Manage your finances with confidence
          </p>
        </div>
        <LoginForm />
      </Card>
    </div>
  );
}
```

```tsx
// components/forms/LoginForm.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";

export function LoginForm() {
  const t = useTranslations("auth");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    // Appel API via TanStack Query
    // ...
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-2">
          {t("email")}
        </label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          required
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-2">
          {t("password")}
        </label>
        <Input id="password" type="password" required />
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? t("signing_in") : t("sign_in")}
      </Button>
    </form>
  );
}
```

---

## 10. Checklist par écran

Avant de clore un écran :

- [ ] Responsive (mobile, tablet, desktop)
- [ ] Traductions (FR + EN)
- [ ] Accessibilité (axe clean, clavier naviguable)
- [ ] États de chargement et d'erreur
- [ ] Formulaires validés côté client (Zod)
- [ ] Tests e2e (Playwright, happy path)

---

## Ressources

- **Tailwind** : https://tailwindcss.com/docs
- **shadcn/ui** : https://ui.shadcn.com
- **Next.js** : https://nextjs.org/docs
- **next-intl** : https://next-intl-docs.vercel.app
- **TanStack Query** : https://tanstack.com/query/latest
- **Recharts** : https://recharts.org
