# Meridian visual design system

The supplied `prompt/color_palatte.png` is the palette reference. The client retention and producer workspace uses one light theme across sign-in, producer, regional portfolio, executive dashboard, evidence drawers and AI preparation. Shared tokens live in `meridian-ui/src/index.css`; executive chart series inherit those tokens or use the reference's decorative colors.

| Role | Token | Exact color |
| --- | --- | --- |
| Card, input and drawer | `--surface` | `#ffffff` |
| Page canvas | `--canvas` | `#f9fafb` |
| Selection, informational panels | `--selected` | `#f0f5ff` |
| Neutral tracks and subtle sections | `--surface-subtle` | `#eef1f5` |
| Cyan accent surface | `--surface-cyan` | `#f2fdfd` |
| Violet accent surface | `--surface-violet` | `#f5f0ff` |
| Primary action and focus | `--action`, `--focus` | `#0052ff` |
| Hover and links | `--action-hover`, `--navy-secondary` | `#0041cc` |
| Pressed action | `--action-active` | `#003099` |
| Brand and emphasis | `--navy` | `#001f61` |
| Headings | `--ink` | `#000b24` |
| Body | `--body` | `#29343d` |
| Secondary text | `--muted` | `#52616b` |
| Card separators | `--line` | `#c7d1d9` |
| Interactive control boundary | `--control-border` | `#768ea2` |
| Decorative accent | `--sky` | `#6aaae4` |

Use white text on solid primary actions and navy brand marks. Use navy or body text on pale surfaces. Decorative light blue, pale violet and gray are chart fills and backgrounds, never small text colors. Secondary text and control boundaries use darker supporting shades to preserve legibility. Focus outlines use primary blue rather than decorative pale blue.

Semantic status colors remain separate from brand decoration:

| Meaning | Text | Surface | Border |
| --- | --- | --- | --- |
| Success, confirmed completion | `#0d652d` | `#ecfdf3` | `#abefc6` |
| Warning, hypothesis, human review | `#b54708` | `#fffaeb` | `#fedf89` |
| Critical, overdue, failure | `#b42318` | `#fef3f2` | `#fecdca` |

Statuses retain their labels; color alone does not convey failure, confidence or approval. Evidence drawers use opaque white surfaces so underlying screen content cannot reduce text contrast. Dialog overlays use `rgba(0, 11, 36, 0.4)`.

Executive chart series map to primary blue `#0052ff`, secondary blue `#709dff`, sky `#6aaae4`, pale blue `#c7d9ff`, pale violet `#d3bdff`, and gray `#c7d1d9`. The current month uses primary blue; preceding illustrative months use sky blue. KPI values and retention cells use readable navy or semantic status text independently of chart fills.

Spacing uses a 4px base: 4, 8, 12, 16, 24 and 32px. Standard cards use 16px padding; compact records use 12px. Controls are 36px on desktop and at least 40px in mobile layouts. Panels use subtle borders and shadows, with a 12px shared radius. Keep wrapping labels, minimum-zero grid columns, scrollable tables and visible keyboard focus. Record drawers collapse to one field column on small screens. Toolbars, generation status and draft actions wrap without horizontal page overflow.

Skeletons and progress states follow the same light surfaces. Existing reduced-motion rules stop shimmer and spinner animation, and forced-color rules preserve visible controls and focus boundaries. AI provenance, hypotheses, evidence and approval requirements remain part of the existing workflow; the palette does not alter those behaviors.

This update was reviewed by reading the CSS and supplied palette. Automated checks and browser contrast measurements are handled separately by the coordinating agent; this document does not claim those checks have run.
