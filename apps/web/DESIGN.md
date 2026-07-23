# n8nHarness Design System v1.0

**Brand:** Modern AI Agent Platform for Telegram Channel Management  
**Aesthetic:** Tech-forward, Professional, Accessible

---

## Color Palette

### Primary Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Blue** | `#2563EB` | Primary actions, focus states, links |
| **Purple** | `#8B5CF6` | Secondary actions, agent indicators |
| **Pink** | `#EC4899` | Highlights, alerts, call-to-action |

### Status Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Green** | `#10B981` | Success, active status |
| **Amber** | `#F59E0B` | Warning, caution states |
| **Red** | `#EF4444` | Error, danger actions |

### Neutral Scale
```
50:   #F8FAFC
100:  #F1F5F9
200:  #E2E8F0
300:  #CBD5E1
400:  #94A3B8
500:  #64748B  ← Primary neutral
600:  #475569
700:  #334155
800:  #1E293B
900:  #0F172A
```

---

## Typography

### Font Stack
```
Display:  "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
Body:     "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
Code:     "JetBrains Mono", "Monaco", "Courier New", monospace
```

### Scale
| Level | Font Size | Line Height | Weight | Use Case |
|-------|-----------|-------------|--------|----------|
| **Display** | 32px | 40px | 700 (Bold) | Page titles, hero text |
| **H1** | 28px | 36px | 600 (SemiBold) | Section headers |
| **H2** | 24px | 32px | 600 (SemiBold) | Subsection headers |
| **H3** | 20px | 28px | 600 (SemiBold) | Card titles |
| **Body** | 16px | 24px | 400 (Regular) | Main content |
| **Body Small** | 14px | 21px | 400 (Regular) | Secondary content |
| **Caption** | 12px | 18px | 500 (Medium) | Captions, labels |
| **Code** | 12px | 18px | 400 (Regular) | Code blocks, monospace |

---

## Spacing System

Based on 4px grid:

```
xs:   4px    (padding: very tight)
sm:   8px    (padding: tight)
md:   16px   (padding: standard)
lg:   24px   (padding: loose)
xl:   32px   (padding: very loose)
2xl:  48px   (page margins)
```

---

## Component Specifications

### Buttons
- **Height:** 40px (standard), 36px (small), 44px (large)
- **Padding:** 12px 16px (standard)
- **Border Radius:** 8px
- **Font Weight:** 600
- **Transition:** 150ms ease

**Variants:**
```
Primary:    bg-blue-600, text-white, hover:bg-blue-700
Secondary:  bg-slate-100, text-slate-900, hover:bg-slate-200
Ghost:      bg-transparent, text-blue-600, hover:bg-blue-50
Danger:     bg-red-600, text-white, hover:bg-red-700
```

### Cards
- **Border Radius:** 12px
- **Shadow:** 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)
- **Hover Shadow:** 0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)
- **Padding:** 20px (md), 24px (lg)
- **Background:** White + subtle border (slate-200)
- **Dark Mode:** slate-800 + slate-700 border

**Glassmorphic Card (Optional):**
```css
background: rgba(255, 255, 255, 0.8);
backdrop-filter: blur(10px);
border: 1px solid rgba(255, 255, 255, 0.2);
```

### Input Fields
- **Height:** 40px
- **Border Radius:** 8px
- **Border:** 1px solid #E2E8F0
- **Focus Ring:** 2px solid #2563EB
- **Padding:** 10px 12px
- **Font Size:** 14px
- **Transition:** 200ms ease

### Badges & Tags
- **Height:** 24px
- **Border Radius:** 12px (pill)
- **Padding:** 4px 12px
- **Font Size:** 12px
- **Font Weight:** 500

**Variants:**
```
Primary:   bg-blue-100, text-blue-700
Success:   bg-green-100, text-green-700
Warning:   bg-amber-100, text-amber-700
Danger:    bg-red-100, text-red-700
```

---

## Effects & Animations

### Transitions
```
Fast:       150ms ease-in-out
Standard:   200ms ease-in-out
Slow:       300ms ease-in-out
```

### Shadows
```
sm: 0 1px 2px rgba(0,0,0,0.05)
md: 0 4px 6px rgba(0,0,0,0.07)
lg: 0 10px 15px rgba(0,0,0,0.1)
xl: 0 20px 25px rgba(0,0,0,0.1)
```

### Hover Effects
- **Buttons:** Scale 1.02 + shadow increase
- **Cards:** Translate Y -2px + shadow increase
- **Links:** Color change + underline

---

## Layout & Spacing

### Page Margins
- **Desktop:** 32px (2xl)
- **Tablet:** 24px (xl)
- **Mobile:** 16px (md)

### Grid System
- **Base:** 12 columns
- **Gutter:** 16px (md)

### Component Spacing
- **Section Gap:** 32px (2xl)
- **Card Gap:** 20px (lg)
- **Element Gap:** 16px (md)

---

## Dark Mode

### Background
```
Light: #FFFFFF
Dark:  #0F172A (slate-900)
```

### Text
```
Light Primary:   #0F172A (slate-900)
Light Secondary: #64748B (slate-500)
Dark Primary:    #F8FAFC (slate-50)
Dark Secondary:  #CBD5E1 (slate-300)
```

### Borders
```
Light: #E2E8F0 (slate-200)
Dark:  #334155 (slate-700)
```

---

## Accessibility

### Contrast Ratios
- **Large text (18px+):** 3:1 minimum
- **Normal text:** 4.5:1 minimum
- **UI components:** 3:1 minimum

### Focus Indicators
- **Color:** #2563EB
- **Width:** 2px
- **Offset:** 2px

### Text Readability
- **Line Height:** 1.5 (minimum)
- **Letter Spacing:** -0.01em (normal)
- **Max Line Length:** 60-80 characters (body text)

---

## Implementation Notes

- Use CSS variables for colors for easy dark mode switching
- All interactive elements must have clear focus states
- Animations should respect `prefers-reduced-motion`
- Icons should be 24px (standard), 20px (small), 32px (large)
- Maintain 8px baseline grid for alignment

---

**Version:** 1.0  
**Last Updated:** 2026-07-23  
**Maintained By:** n8nHarness Design Team
