# Mr Wallet — Homepage & Dashboard Specifications

Document de spécifications pour Claude Code. Contient prompts prêts à l'emploi, layouts, animations, et métriques.

---

## Architecture générale

```
/                      → Landing page publique (non-authentifiée)
/dashboard             → Dashboard post-login (authentifiée)
/auth/login            → Login (existant, à intégrer)
/auth/register         → Register (existant, à intégrer)
```

---

## PARTIE 1 — LANDING PAGE PUBLIQUE

### 1.1 — Hero Section

**Objectif** : Attirer, donner un sentiment de confiance, inciter à s'inscrire.

**Layout** :
- Desktop : 2 colonnes (texte gauche, visual droite)
- Mobile : 1 colonne (texte, puis visual)

**Texte** :
```
Mr Wallet

Reprends le contrôle de tes finances.

Suivi des dépenses. Budgets. Prévisions.
Tout ce qu'il te faut pour voir où va ton argent.

[S'inscrire gratuitement]  [En savoir plus]
```

**Visual** (droite/bas) :
- Illustration minimaliste : portefeuille ouvert, montants, graphique de tendance
- OU graphique animé : montants qui rentrent/sortent
- OU screenshot du dashboard (voir section Dashboard)

**Animations** :
- Fade-in progressif des éléments au chargement (texte → boutons → visual)
- Parallax leger sur le visual (scroll → mouvement subtle)
- Bouton primaire : glow subtil au hover

**Metrics** :
- Temps avant CTA visible : < 1s
- Taux de clic sur CTA (objectif : 8-12%)

---

### 1.2 — Features Section (3 colonnes)

**Titre** : "Conçu pour toi"

**3 Features clés** :

#### Feature 1 — Suivi complet
- **Icône** : lucide-react `TrendingUp` (teal)
- **Titre** : Suis tes dépenses
- **Desc** : Importe tes relevés ou saisies manuellement. Catégorisation automatique.
- **Animation** : Icône qui tourne/pulse au hover ; texte fade-in

#### Feature 2 — Budgets intelligents
- **Icône** : lucide-react `Target`
- **Titre** : Maîtrise tes budgets
- **Desc** : Définis des enveloppes par catégorie, reçois des alertes avant de dépasser.
- **Animation** : Icône grandit au hover ; couleur change

#### Feature 3 — Prévisions
- **Icône** : lucide-react `LineChart`
- **Titre** : Anticipe l'avenir
- **Desc** : Vois où tu seras dans 6 mois avec tes tendances actuelles.
- **Animation** : Courbe qui se dessine au scroll

**Layout** :
- Desktop : 3 colonnes égales, gap 24px
- Mobile : 1 colonne, gap 16px

**Animations** :
- Chaque feature : fade-in + slide-up au scroll (stagger 200ms)
- Au hover : icône scale 1.1, ombre légère

---

### 1.3 — How it Works (4 étapes)

**Titre** : "Commencer en 4 étapes"

**Étapes** :
1. **S'inscrire** — Email + mot de passe (30s)
2. **Importer ou saisir** — CSV/Excel ou manual entry
3. **Défini tes budgets** — Templates ou personnalisé
4. **Regarde croître** — Dashboards et rapports

**Layout** :
- Timeline vertical (mobile) ou horizontal (desktop)
- Chaque étape : numéro + titre + description + icône
- Chevrons/flèches entre étapes

**Animations** :
- Numbers : incremental counting (0 → n) au scroll
- Icônes : fade-in + rotation légère
- Timeline : se "dessine" de haut en bas/gauche à droite

---

### 1.4 — FAQ Section

**Titre** : "Questions fréquentes"

**5-7 questions** :
- Combien ça coûte ? → Gratuit, zéro publicité
- Mes données sont protégées ? → Chiffrement, audit log complet
- Puis-je importer de ma banque ? → CSV/Excel, connecteurs futurs
- Fonctionne sur mobile ? → PWA installable
- Comment je récupère mes données ? → Export complet anytime
- Y a-t-il une limite de transactions ? → Non
- Que se passe-t-il si je supprime mon compte ? → Soft delete + suppression après 30j

**Composant** :
- Accordion (shadcn/ui) avec question title + réponse dépliable
- Icône chevron rotate au toggle

**Animations** :
- Contenu : collapse/expand smooth (300ms)
- Hover sur question : fond change légèrement

---

### 1.5 — CTA Final

**Texte** :
```
Prêt ? Commence maintenant.

[S'inscrire gratuitement]
ou [Se connecter] si tu as un compte
```

**Animations** :
- Bouttons : scale 1.05 au hover
- Primary button : pulse subtil (glow)

---

### 1.6 — Footer

**Contenu** :
- Logo + description (1 ligne)
- Links : Docs, GitHub, Twitter (optionnel), Email contact
- Copyright + Mentions légales

**Layout** :
- Desktop : 4 colonnes (logo+desc, links, social, copyright)
- Mobile : 2 colonnes, centered

---

## PARTIE 2 — DASHBOARD POST-LOGIN

### 2.1 — Layout général

```
Header
  - Logo (gauche)
  - User menu (droite)
  
Sidebar (gauche, permanent sur desktop, drawer sur mobile)
  - Accueil
  - Comptes
  - Transactions
  - Budgets
  - Dettes
  - Objectifs
  - Rapports
  - Paramètres

Main content (droite)
  - Widgets + sections
```

---

### 2.2 — Hero du dashboard (après login)

**Titre** : "Bienvenue, [Prénom]"

**Widgets (responsive grid)** :

#### Widget 1 — Patrimoine net
```
Patrimoine net
12 500 000 XOF
+2.5% vs mois dernier
```
- Nombre grand et coloré (teal)
- Petite flèche verte/rouge + %
- Animation : nombre qui compte à partir de 0 au load

#### Widget 2 — Soldes par compte
```
Banque : 5 000 000 XOF
Mobile Money : 3 500 000 XOF
Espèces : 4 000 000 XOF
```
- Liste de cartes petites
- Animation : chaque solde slide-in légèrement décalé

#### Widget 3 — Dépenses ce mois
```
Alimentation : 450 000 XOF (90% du budget)
Transport : 250 000 XOF (75%)
Loisirs : 120 000 XOF (60%)
```
- Petites barres de progression colorées
- Animation : barres qui se remplissent au scroll

#### Widget 4 — Prévision trésorerie
```
Graphique : solde projeté sur 6 mois
```
- Recharts LineChart simple
- Animation : courbe qui se dessine au load (stroke-dasharray)

---

### 2.3 — Quick actions

```
[+ Ajouter une transaction]
[Importer relevé]
[Voir rapports]
```

- Bouttons iconés, carrés
- Animations : scale au hover

---

### 2.4 — Transactions récentes (liste)

```
| Date | Libellé | Montant | Catégorie | Compte |
|------|---------|---------|-----------|--------|
| 28/07 | Café | -5 000 XOF | Alimentation | Espèces |
| 27/07 | Salaire | +200 000 XOF | Revenu | Banque |
| ...
```

- Table simple, scrollable sur mobile
- Montants positifs en vert, négatifs en rouge
- Hover sur ligne : ombre légère
- Animation : lignes fade-in staggerées

---

## ANIMATIONS DÉTAILLÉES

### Animations au chargement (landing)

```
Timeline (all at once, duration 800ms)
0ms    : Logo fade-in
200ms  : Hero title slide-up + fade-in
400ms  : Hero desc fade-in
600ms  : Buttons fade-in + scale
800ms  : Visual parallax ready
```

### Animations au scroll

```
Intersection Observer (trigger at 50% visibility)

Features section:
- Chaque feature : fade-in + translate-y(-20px)
- Stagger: 200ms
- Duration: 600ms
- Easing: cubic-bezier(0.34, 1.56, 0.64, 1) [bounce subtle]

How it works:
- Numbers : countUp animation (0 → target)
- Duration: 2000ms
- Easing: ease-out

FAQ:
- Questions : underline expand au hover
```

### Animations micro (interaction)

```
Buttons:
- Hover : scale 1.05, box-shadow +4px
- Active/Click : scale 0.98
- Duration: 150ms

Icons:
- Hover : rotate 10deg ou scale 1.2
- Duration: 300ms

Cards:
- Hover : translate-y(-4px), box-shadow +8px
- Duration: 200ms
```

---

## Librairie d'animations

**À utiliser pour les animations** :
- **Transitions Tailwind** : duration-300, ease-in-out, transition-all
- **Framer Motion** (optionnel, léger pour landing) : `motion.div`, `AnimatePresence`, keyframes
- **Recharts animations** : built-in (stroke-dasharray pour courbes)
- **Scroll-triggered** : `useInView` (react-intersection-observer) ou scroll listener

**Pas de** : animations lourdes (3D, vidéos), splash screens, fades trop lentes

---

## Responsive breakpoints

```
Mobile:   < 768px  (1 colonne, drawer sidebar)
Tablet:   768-1024 (2 colonnes)
Desktop:  > 1024px (sidebar fixe)
```

---

## Accessibilité

- Tous les boutons ont `aria-label`
- Liens ont suffisant de contraste
- Animations respectent `prefers-reduced-motion`
- Keyboard navigation : Tab → boutons → focus visible
- Skip link vers main content

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

## Prompts pour Claude Code

### Prompt 1 — Landing page complète

```
Crée la landing page publique de Mr Wallet (chemin: app/(auth)/page.tsx) en suivant HOMEPAGE_SPEC.md:

Sections à créer:
1. Hero (2 col desktop, fade-in animations)
2. Features (3 colonnes, fade-in staggeré au scroll)
3. How it works (timeline, animated numbers)
4. FAQ (Accordion shadcn/ui)
5. CTA Final
6. Footer

Contraintes:
- Utilise DESIGN_SYSTEM.md (couleurs teal, typo, espacements)
- Mobile-first responsive
- Animations via Tailwind transitions + Framer Motion optionnel
- Respecte prefers-reduced-motion
- Tous les textes en i18n (useTranslations)
- Tests Playwright sur CTA principal

Délivrables:
- Page complète responsive
- Composants réutilisables (FeatureCard, TimelineStep, FAQItem)
- Pas de console warnings
```

### Prompt 2 — Dashboard post-login

```
Crée le dashboard post-login (chemin: app/(authenticated)/dashboard/page.tsx) en suivant HOMEPAGE_SPEC.md:

Widgets:
1. Patrimoine net (nombre + variation %)
2. Soldes par compte (grid de cartes)
3. Dépenses ce mois (barres de progression)
4. Prévision trésorerie (Recharts LineChart)
5. Quick actions (3 boutons)
6. Transactions récentes (liste/table)

Contraintes:
- Utilise ProtectedLayout (doit être authentifié)
- Sidebar gauche permanent (desktop) / drawer (mobile)
- Tous les chiffres en i18n (formatMoney, formatDate)
- Animations: fade-in staggeré au load, hover effects
- Responsive: 1 col mobile, 2+ desktop
- Données mockées pour MVP (pas appel API encore)

Délivrables:
- Page complète avec layout
- Navigation sidebar
- Composants widgets réutilisables
```

### Prompt 3 — Navigation & Sidebar

```
Crée Navigation + Sidebar pour le dashboard en suivant DESIGN_SYSTEM.md:

Navigation bar (top):
- Logo (gauche)
- User avatar + dropdown menu (droite: Paramètres, Logout)
- Burger menu sur mobile (toggle sidebar)

Sidebar (gauche):
- Logo en haut
- Menu items: Accueil, Comptes, Transactions, Budgets, Dettes, Objectifs, Rapports, Paramètres
- Active state: underline ou highlight teal
- Smooth collapse/expand sur mobile

Contraintes:
- Persistent sur desktop, drawer sur mobile
- Animations: slide smooth (300ms)
- Icons from lucide-react
- i18n pour tous les labels
- Accessible: keyboard navigation

Délivrables:
- Composants Navigation et Sidebar
- Layout wrapper réutilisable
```

---

## Métriques de succès

| Métrique | Cible |
|---|---|
| Time to interactive (FCP) | < 2s |
| Largest contentful paint (LCP) | < 2.5s |
| Cumulative layout shift (CLS) | < 0.1 |
| Taux de conversion landing → signup | 8-12% |
| Bounce rate landing | < 30% |
| Mobile usability (PageSpeed) | > 80 |

---

## Checklist d'implémentation

**Landing page:**
- [ ] Hero avec animations fade-in/slide
- [ ] Features avec scroll-triggered animations
- [ ] How it works avec animated numbers
- [ ] FAQ avec accordion smooth
- [ ] CTA bien visible et haut taux de clic
- [ ] Footer complet
- [ ] Responsive mobile/tablet/desktop
- [ ] i18n FR/EN complète
- [ ] Accessibilité (axe, keyboard nav)
- [ ] Performance (Lighthouse > 80)
- [ ] Tests e2e (CTA clickable, pages load)

**Dashboard:**
- [ ] 6 widgets avec animations
- [ ] Sidebar + navigation
- [ ] Responsive drawer sur mobile
- [ ] Données mockées
- [ ] All i18n
- [ ] Logout fonctionne
- [ ] Tests e2e (login → dashboard visible)

**Global:**
- [ ] Pas de console errors/warnings
- [ ] Animations désactivées si prefers-reduced-motion
- [ ] Dark mode skeleton (peut être V2)
