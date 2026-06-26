# Bundle Claude Design — Hub « freshman.tv »

Cartes prêtes à synchroniser vers un projet **claude.ai/design** pour affiner le hub.
Chaque `.html` est autonome (Anton + DM Mono + Inter via Google Fonts) et porte un
marqueur `<!-- @dsCard group="Hub — freshman.tv" -->` en première ligne pour que le
panneau Design System l'indexe en carte.

## Cartes

| Fichier | Rôle |
|---|---|
| `hub-full.html` | Le hub complet plein écran : found footage VHS + grain + scanlines + 4 rangs de banderole distressed + HUD caméscope. La pièce maîtresse. |
| `marquee-wall.html` | Le mur de banderoles isolé sur fond noir — pour juger typo + mouvement seuls. |
| `vhs-treatment.html` | Le traitement VHS avec **curseurs** (grain / aberration / scanlines / saturation) pour doser le look. |
| `entry-states.html` | Une entrée dans ses 3 états : repos (aberration), survol (ocre, propre), contour. |
| `tokens.html` | Palette, typographie et doodles séparateurs (placeholders → tablette). |

## Pour pousser vers claude.ai/design

1. Dans cette session Claude Code, lance **`/login`** et connecte-toi avec ton compte
   claude.ai (la session actuelle tourne sur un token API sans les droits « design »).
2. Redemande-moi de synchroniser : je crée le projet Design System et j'envoie ces cartes.
3. Tu ouvres claude.ai/design, tu vois les cartes, et on affine là-bas (ou ici, en
   éditant ces fichiers — les modifs se re-synchronisent).

## À remplacer au build
- Les doodles SVG (placeholders) → tes dessins tablette.
- Le dégradé `.foot` → ta vraie boucle found footage / archive.
- La typo `Anton` → ta display condensée finale si tu en choisis une autre.
