# Mr Wallet — Homepage & Dashboard Specifications

Specification document for Claude Code. Contains ready-to-use prompts, layouts, animations, and metrics.

---

## General architecture

```
/                      → Public landing page (non-authenticated)
/dashboard             → Post-login dashboard (authenticated)
/auth/login            → Login (existing, to be integrated)
/auth/register         → Register (existing, to be integrated)
```

---

## PART 1 — PUBLIC LANDING PAGE

### 1.1 — Hero Section

**Objective**: Attract, convey a sense of trust, encourage sign-up.

**Layout**:
- Desktop: 2 columns (text left, visual right)
- Mobile: 1 column (text, then visual)

**Text**:
```
Mr Wallet

Take back control of your finances.

Expense tracking. Budgets. Forecasts.
Everything you need to see where your money goes.

[Sign up for free]  [Learn more]
```

**Visual** (right/bottom):
- Minimalist illustration: open wallet, amounts, trend chart
- OR animated chart: amounts coming in/going out
- OR dashboard screenshot (see Dashboard section)

**Animations**:
- Progressive fade-in of elements on load (text → buttons → visual)
- Slight parallax on the visual (scroll → subtle movement)
- Primary button: subtle glow on hover

**Metrics**:
- Time before CTA is visible: < 1s
- CTA click-through rate (target: 8-12%)

---

### 1.2 — Features Section (3 columns)

**Title**: "Designed for you"

**3 Key Features**:

#### Feature 1 — Complete tracking
- **Icon**: lucide-react `TrendingUp` (teal)
- **Title**: Track your expenses
- **Desc**: Import your statements or enter manually. Automatic categorization.
- **Animation**: Icon rotates/pulses on hover; text fade-in

#### Feature 2 — Smart budgets
- **Icon**: lucide-react `Target`
- **Title**: Master your budgets
- **Desc**: Set envelopes per category, get alerts before overspending.
- **Animation**: Icon grows on hover; color changes

#### Feature 3 — Forecasts
- **Icon**: lucide-react `LineChart`
- **Title**: Anticipate the future
- **Desc**: See where you'll be in 6 months based on your current trends.
- **Animation**: Curve draws itself on scroll

**Layout**:
- Desktop: 3 equal columns, gap 24px
- Mobile: 1 column, gap 16px

**Animations**:
- Each feature: fade-in + slide-up on scroll (stagger 200ms)
- On hover: icon scale 1.1, slight shadow

---

### 1.3 — How it Works (4 steps)

**Title**: "Get started in 4 steps"

**Steps**:
1. **Sign up** — Email + password (30s)
2. **Import or enter** — CSV/Excel or manual entry
3. **Set your budgets** — Templates or custom
4. **Watch it grow** — Dashboards and reports

**Layout**:
- Vertical timeline (mobile) or horizontal (desktop)
- Each step: number + title + description + icon
- Chevrons/arrows between steps

**Animations**:
- Numbers: incremental counting (0 → n) on scroll
- Icons: fade-in + slight rotation
- Timeline: "draws itself" top to bottom / left to right

---

### 1.4 — FAQ Section

**Title**: "Frequently asked questions"

**5-7 questions**:
- How much does it cost? → Free, zero ads
- Is my data protected? → Encryption, complete audit log
- Can I import from my bank? → CSV/Excel, future connectors
- Does it work on mobile? → Installable PWA
- How do I retrieve my data? → Full export anytime
- Is there a transaction limit? → No
- What happens if I delete my account? → Soft delete + deletion after 30 days

**Component**:
- Accordion (shadcn/ui) with question title + expandable answer
- Chevron icon rotates on toggle

**Animations**:
- Content: smooth collapse/expand (300ms)
- Hover on question: background changes slightly

---

### 1.5 — Final CTA

**Text**:
```
Ready? Start now.

[Sign up for free]
or [Log in] if you already have an account
```

**Animations**:
- Buttons: scale 1.05 on hover
- Primary button: subtle pulse (glow)

---

### 1.6 — Footer

**Content**:
- Logo + description (1 line)
- Links: Docs, GitHub, Twitter (optional), Contact email
- Copyright + Legal notices

**Layout**:
- Desktop: 4 columns (logo+desc, links, social, copyright)
- Mobile: 2 columns, centered

---

## PART 2 — POST-LOGIN DASHBOARD

### 2.1 — General layout

```
Header
  - Logo (left)
  - User menu (right)
  
Sidebar (left, permanent on desktop, drawer on mobile)
  - Home
  - Accounts
  - Transactions
  - Budgets
  - Debts
  - Goals
  - Reports
  - Settings

Main content (right)
  - Widgets + sections
```

---

### 2.2 — Dashboard hero (after login)

**Title**: "Welcome, [First name]"

**Widgets (responsive grid)**:

#### Widget 1 — Net worth
```
Net worth
12,500,000 XOF
+2.5% vs last month
```
- Large, colored number (teal)
- Small green/red arrow + %
- Animation: number counts up from 0 on load

#### Widget 2 — Balances by account
```
Bank: 5,000,000 XOF
Mobile Money: 3,500,000 XOF
Cash: 4,000,000 XOF
```
- List of small cards
- Animation: each balance slides in with a slight stagger

#### Widget 3 — Spending this month
```
Food: 450,000 XOF (90% of budget)
Transport: 250,000 XOF (75%)
Leisure: 120,000 XOF (60%)
```
- Small colored progress bars
- Animation: bars fill up on scroll

#### Widget 4 — Cash flow forecast
```
Chart: projected balance over 6 months
```
- Simple Recharts LineChart
- Animation: curve draws itself on load (stroke-dasharray)

---

### 2.3 — Quick actions

```
[+ Add a transaction]
[Import statement]
[View reports]
```

- Icon buttons, square
- Animations: scale on hover

---

### 2.4 — Recent transactions (list)

```
| Date | Label | Amount | Category | Account |
|------|---------|---------|-----------|--------|
| 07/28 | Coffee | -5,000 XOF | Food | Cash |
| 07/27 | Salary | +200,000 XOF | Income | Bank |
| ...
```

- Simple table, scrollable on mobile
- Positive amounts in green, negative in red
- Hover on row: slight shadow
- Animation: rows fade-in staggered

---

## DETAILED ANIMATIONS

### Load animations (landing)

```
Timeline (all at once, duration 800ms)
0ms    : Logo fade-in
200ms  : Hero title slide-up + fade-in
400ms  : Hero desc fade-in
600ms  : Buttons fade-in + scale
800ms  : Visual parallax ready
```

### Scroll animations

```
Intersection Observer (trigger at 50% visibility)

Features section:
- Each feature: fade-in + translate-y(-20px)
- Stagger: 200ms
- Duration: 600ms
- Easing: cubic-bezier(0.34, 1.56, 0.64, 1) [bounce subtle]

How it works:
- Numbers: countUp animation (0 → target)
- Duration: 2000ms
- Easing: ease-out

FAQ:
- Questions: underline expand on hover
```

### Micro animations (interaction)

```
Buttons:
- Hover: scale 1.05, box-shadow +4px
- Active/Click: scale 0.98
- Duration: 150ms

Icons:
- Hover: rotate 10deg or scale 1.2
- Duration: 300ms

Cards:
- Hover: translate-y(-4px), box-shadow +8px
- Duration: 200ms
```

---

## Animation library

**To be used for animations**:
- **Tailwind transitions**: duration-300, ease-in-out, transition-all
- **Framer Motion** (optional, lightweight for landing): `motion.div`, `AnimatePresence`, keyframes
- **Recharts animations**: built-in (stroke-dasharray for curves)
- **Scroll-triggered**: `useInView` (react-intersection-observer) or scroll listener

**Not to use**: heavy animations (3D, videos), splash screens, overly slow fades

---

## Responsive breakpoints

```
Mobile:   < 768px  (1 column, drawer sidebar)
Tablet:   768-1024 (2 columns)
Desktop:  > 1024px (fixed sidebar)
```

---

## Accessibility

- All buttons have `aria-label`
- Links have sufficient contrast
- Animations respect `prefers-reduced-motion`
- Keyboard navigation: Tab → buttons → visible focus
- Skip link to main content

```tsx
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Prompts for Claude Code

### Prompt 1 — Complete landing page

```
Create the public landing page for Mr Wallet (path: app/(auth)/page.tsx) following HOMEPAGE_SPEC.md:

Sections to create:
1. Hero (2 col desktop, fade-in animations)
2. Features (3 columns, staggered fade-in on scroll)
3. How it works (timeline, animated numbers)
4. FAQ (Accordion shadcn/ui)
5. Final CTA
6. Footer

Constraints:
- Use DESIGN_SYSTEM.md (teal colors, typography, spacing)
- Mobile-first responsive
- Animations via Tailwind transitions + optional Framer Motion
- Respect prefers-reduced-motion
- All text in i18n (useTranslations)
- Playwright tests on main CTA

Deliverables:
- Complete responsive page
- Reusable components (FeatureCard, TimelineStep, FAQItem)
- No console warnings
```

### Prompt 2 — Post-login dashboard

```
Create the post-login dashboard (path: app/(authenticated)/dashboard/page.tsx) following HOMEPAGE_SPEC.md:

Widgets:
1. Net worth (number + % variation)
2. Balances by account (card grid)
3. Spending this month (progress bars)
4. Cash flow forecast (Recharts LineChart)
5. Quick actions (3 buttons)
6. Recent transactions (list/table)

Constraints:
- Use ProtectedLayout (must be authenticated)
- Permanent left sidebar (desktop) / drawer (mobile)
- All figures in i18n (formatMoney, formatDate)
- Animations: staggered fade-in on load, hover effects
- Responsive: 1 col mobile, 2+ desktop
- Mocked data for MVP (no API call yet)

Deliverables:
- Complete page with layout
- Sidebar navigation
- Reusable widget components
```

### Prompt 3 — Navigation & Sidebar

```
Create Navigation + Sidebar for the dashboard following DESIGN_SYSTEM.md:

Navigation bar (top):
- Logo (left)
- User avatar + dropdown menu (right: Settings, Logout)
- Burger menu on mobile (toggle sidebar)

Sidebar (left):
- Logo at top
- Menu items: Home, Accounts, Transactions, Budgets, Debts, Goals, Reports, Settings
- Active state: underline or teal highlight
- Smooth collapse/expand on mobile

Constraints:
- Persistent on desktop, drawer on mobile
- Animations: smooth slide (300ms)
- Icons from lucide-react
- i18n for all labels
- Accessible: keyboard navigation

Deliverables:
- Navigation and Sidebar components
- Reusable layout wrapper
```

---

## Success metrics

| Metric | Target |
|---|---|
| Time to interactive (FCP) | < 2s |
| Largest contentful paint (LCP) | < 2.5s |
| Cumulative layout shift (CLS) | < 0.1 |
| Landing → signup conversion rate | 8-12% |
| Landing bounce rate | < 30% |
| Mobile usability (PageSpeed) | > 80 |

---

## Implementation checklist

**Landing page:**
- [ ] Hero with fade-in/slide animations
- [ ] Features with scroll-triggered animations
- [ ] How it works with animated numbers
- [ ] FAQ with smooth accordion
- [ ] Highly visible CTA with high click-through rate
- [ ] Complete footer
- [ ] Responsive mobile/tablet/desktop
- [ ] Complete FR/EN i18n
- [ ] Accessibility (axe, keyboard nav)
- [ ] Performance (Lighthouse > 80)
- [ ] E2E tests (CTA clickable, pages load)

**Dashboard:**
- [ ] 6 widgets with animations
- [ ] Sidebar + navigation
- [ ] Responsive drawer on mobile
- [ ] Mocked data
- [ ] All i18n
- [ ] Logout works
- [ ] E2E tests (login → dashboard visible)

**Global:**
- [ ] No console errors/warnings
- [ ] Animations disabled if prefers-reduced-motion
- [ ] Dark mode skeleton (may be V2)
