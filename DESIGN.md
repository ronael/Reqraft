# Reqraft Design Direction

## Product Truth

Reqraft sits between a rough request and the AI agent that receives it. Its
visual language must communicate correction, fidelity, constraint preservation,
and review. It should not look like a generic AI chat product.

## Direction

**Proof, not polish.** Treat every transformation as an auditable proof:
source text, intervention, revised text, preserved constraints, and verdict.
The recurring signature is the proof margin: `-` for source, `+` for the
rewrite, compact annotations, and explicit review states.

## Visual System

- Background: near-black, neutral rather than blue.
- Surfaces: three depths only (`surface`, `surface-raised`, `surface-strong`).
- Text: warm off-white; secondary text remains readable, never decorative.
- Violet: Reqraft intervention and selected controls only.
- Green: verified fidelity and local safety checks only.
- Amber: review required only.
- Rose: destructive or invalid state only.
- Separation: spacing first, structural borders second. Shadows are reserved
  for the floating native capsule.
- Radius: 5px controls, 8px product panels. Avoid pill-shaped containers.

## Typography

- System sans for promises and explanations.
- System mono for source text, commands, diagnostics, and metadata.
- Minimum supporting text: 11px. Body copy: 16-17px.
- Display sizes stay controlled; hierarchy comes from weight, width, and
  placement rather than oversized type.
- Body text targets 45-75 characters per line.

## Composition

- Desktop uses an asymmetric two-column editorial grid.
- Demonstrations carry more visual weight than explanatory copy.
- Section rhythm alternates compact evidence and generous product moments.
- Mobile recomposes demonstrations vertically and removes nonessential chrome.

## Avoid

- Purple gradients, glows, or decorative blobs.
- Generic feature-card grids and bento layouts.
- Repeated giant headings.
- Tiny uppercase labels used as decoration.
- A different visual language for every product demonstration.
- Fake dashboards, fake testimonials, or invented usage statistics.
- Borders, backgrounds, shadows, and blur stacked on the same component.

## Reference Principles

- Raycast: let the actual interaction model drive the visual story; do not copy
  its glass effects or ecosystem scale.
- Resend: make real product syntax and outputs the proof; do not copy its light
  rays or marketing structure.
- Ghostty: build a recognizable identity from the product's native medium; do
  not copy its ASCII artwork.
