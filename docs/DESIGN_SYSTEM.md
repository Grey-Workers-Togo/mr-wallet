# Mr Wallet — Design System

Guide for Claude Code. All interfaces follow these standards.

---

## 1. Color palette

```css
/* Brand — main accent */
--color-primary: #0F766E        /* teal-800 */
--color-primary-light: #14B8A6  /* teal-500 */
--color-primary-dark: #0D4F47   /* teal-900 */

/* Neutrals — text, backgrounds */
--color-neutral-50: #F9FAFB    /* very light gray, backgrounds */
--color-neutral-100: #F3F4F6   /* light gray, borders */
--color-neutral-200: #E5E7EB
--color-neutral-400: #9CA3AF
--color-neutral-600: #4B5563   /* secondary text */
--color-neutral-900: #111827   /* primary text */

/* Semantics */
--color-success: #10B981  /* green */
--color-warning: #F59E0B  /* orange */
--color-error: #EF4444   /* red */
--color-info: #3B82F6    /* blue */

/* Surfaces */
--color-bg-primary: #FFFFFF
--color-bg-secondary: #F9FAFB
--color-border: #E5E7EB
```

**Rationale**: Teal for financial trust, gray neutrals for readability, WCAG AA contrasts.

---

## 2. Typography

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

**Heading hierarchy**:
- `h1`: text-3xl / semibold (page titles)
- `h2`: text-2xl / semibold (sections)
- `h3`: text-lg / medium (subsections)
- `body`: text-base / normal
- `caption`: text-sm / normal (labels, helper text)

---

## 3. Spacing (4px scale)

```
4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px
```

**Usage**:
- Internal component padding: 12px or 16px
- Margin between components: 16px or 24px
- Gap in grids: 16px
- Vertical spacing (section): 24px or 32px

---

## 4. shadcn/ui components to create

**Priority 1 (foundation)**:
- [ ] `Button` (primary, secondary, ghost, size variants)
- [ ] `Input` (text, number, with labels and helper text)
- [ ] `Select` (dropdown)
- [ ] `Card` (basic container with padding)
- [ ] `Badge` (for tags, status)

**Priority 2 (forms)**:
- [ ] `Form` (wrapper + context)
- [ ] `Checkbox`
- [ ] `Radio`
- [ ] `Textarea`
- [ ] `DatePicker`

**Priority 3 (navigation & layout)**:
- [ ] `Navigation` (top bar with logo, user menu)
- [ ] `Sidebar` (side menu, Lot 7)
- [ ] `Breadcrumb`

**Priority 4 (data)**:
- [ ] `Table` (pagination, sorting)
- [ ] `Dialog` (modals)
- [ ] `Toast` (notifications)
- [ ] `Tabs`

**Priority 5 (advanced data)**:
- [ ] `Sheet` (side drawer)
- [ ] `Popover`
- [ ] `Tooltip`

---

## 5. Naming conventions

### Folders

```
apps/web/
├── app/                    # App Router pages
│   ├── (auth)/            # Unauthenticated group
│   │   ├── login/
│   │   ├── register/
│   │   └── layout.tsx
│   ├── (authenticated)/   # Authenticated group (middleware)
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
│   ├── ui/                # Customized shadcn/ui
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   └── ...
│   ├── forms/             # Business forms (Login, CreateTransaction, etc.)
│   ├── layouts/           # Layouts (Navigation, Sidebar)
│   └── shared/            # Reusable (Logo, Avatar, etc.)
├── lib/
│   ├── api.ts             # API client (TanStack Query)
│   ├── money.ts           # Money formatting
│   ├── dates.ts           # Date formatting (Intl)
│   └── cn.ts              # classNamess utility
├── hooks/                 # Custom hooks (useAuth, useBudget, etc.)
├── messages/              # i18n (fr.json, en.json)
└── styles/
    ├── globals.css        # Reset + CSS variables
    └── theme.css           # Colors, typography
```

### Component files

```
components/ui/button.tsx          (generated shadcn/ui)
components/forms/LoginForm.tsx     (business form)
components/TransactionCard.tsx     (reusable component)
```

**Names**:
- Business components: PascalCase (e.g. `TransactionTable.tsx`)
- UI components: kebab-case in imports, PascalCase in definition (shadcn convention)
- Hooks: camelCase (e.g. `useAuth.ts`)
- Utilities: camelCase (e.g. `formatMoney.ts`)

### Tailwind classes

```tsx
// ✅ Good: semantic classes via cn()
<button className={cn(
  "inline-flex items-center justify-center",
  "px-4 py-2 rounded-lg",
  "bg-primary text-white",
  "hover:bg-primary-dark transition-colors",
  "disabled:opacity-50 disabled:cursor-not-allowed"
)}>
  Click
</button>

// ❌ Bad: arbitrary classes
<button className="w-[100px] bg-[#0F766E]">
```

**Principle**: Standard Tailwind classes + CSS variables for colors.

---

## 6. Screen implementation order

### Lot 1 (Identity)

1. **`/auth/register`** — form: email, password, baseCurrency, timezone
2. **`/auth/login`** — form: email, password
3. **`/me`** — profile: display, edit, logout
4. **`/accounts`** — list + account creation

**Components created**: Button, Input, Card, Form, Select, Navigation

### Lot 2 (Transactions)

5. **`/transactions`** — paginated list, filters, quick entry
6. **`/transactions/:id`** — detail + edit
7. **Sidebar** — permanent side menu

**Components created**: Table, DatePicker, Badge, Sidebar

### Lot 3 (Import/Export)

8. **`/import`** — 4-step wizard
9. **Export menu** — button on data pages

**Components created**: Tabs, Dialog, Progress

### Lot 4 (Budgets)

10. **`/budgets`** — gauges, list, creation
11. **`/recurrences`** — list, creation

**Components created**: ProgressBar, Toast (notifications)

### Lot 5 (Debts)

12. **`/debts`** — list, detail, schedule, payment

**Components created**: Accordion (for collapsible schedule)

### Lot 6 (Reports)

13. **`/dashboard`** — overview (net worth, cashflow)
14. **`/reports`** — detailed reports with charts
15. **`/forecast`** — cash flow forecasts

**Components created**: Recharts integrated, Tooltip

### Lot 7 (Polish)

16. **`/settings`** — full preferences
17. **Audit log** — timeline (see entity detail)
18. **PWA** — manifest, service worker
19. **Dark mode** (optional V2)

---

## 7. Responsive design

**Tailwind breakpoints** (Next.js + Tailwind default):

```
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

**Mobile-first strategy**:

```tsx
// ✅ Good: mobile by default, tablet+
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map(item => (...))}
</div>

// ❌ Bad: desktop by default, shrink on mobile
<div className="flex flex-col-reverse md:flex-row">
```

**Touch targets**: ≥ 44px × 44px on mobile.

---

## 8. Minimal accessibility

Every screen must pass `axe` DevTools with no critical errors:

- Explicit labels on all inputs (`htmlFor` on `<label>`)
- Images have `alt`
- Buttons have text or `aria-label`
- WCAG AA contrasts
- Keyboard navigation (Tab, Enter, Esc)
- Landmarks: `<main>`, `<nav>`, `<aside>`

---

## 9. Example: login screen

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
    // API call via TanStack Query
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

## 10. Per-screen checklist

Before closing a screen:

- [ ] Responsive (mobile, tablet, desktop)
- [ ] Translations (FR + EN)
- [ ] Accessibility (axe clean, keyboard navigable)
- [ ] Loading and error states
- [ ] Client-side validated forms (Zod)
- [ ] E2E tests (Playwright, happy path)

---

## Resources

- **Tailwind**: https://tailwindcss.com/docs
- **shadcn/ui**: https://ui.shadcn.com
- **Next.js**: https://nextjs.org/docs
- **next-intl**: https://next-intl-docs.vercel.app
- **TanStack Query**: https://tanstack.com/query/latest
- **Recharts**: https://recharts.org
