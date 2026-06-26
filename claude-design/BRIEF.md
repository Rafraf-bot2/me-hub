# BRIEF — Hub « freshman.tv » · passation pour affinage

> À lire en premier par toute session qui reprend le projet (y compris après `/login`
> pour pousser sur claude.ai/design). Tout le contexte est ici, pas besoin d'historique.

---

## 1. Le projet en une phrase

Site **portail personnel** : une page d'accueil-hub qui distribue vers des micro-sites
(« mondes »), chacun avec sa propre direction artistique. Dossier : `/Users/rafraf/Documents/hustle/me`.
Stack cible : **Astro** (route par monde, CSS isolé, JS uniquement où nécessaire).

Mondes prévus : `/cine` (éditorial sombre), `/tech` (terminal/mono), `/dessins` (sketchbook).
**V1 = le hub seul**, peaufiné à fond avant d'ouvrir les mondes.

Fil rouge transverse : les **doodles dessinés main** de l'auteur (tablette graphique).

---

## 2. Direction artistique du hub — VERROUILLÉE

Pattern **freshman.tv** : **vidéo plein cadre** + **mur de banderoles ÉNORMES qui défilent
en continu par-dessus**. Ambiance **found footage / archive VHS**, traitement distressed.

Décisions figées :
- **Vidéo plein écran** en boucle muette, désaturée (ambiance archive/VHS).
- **4 rangs** de banderole, vitesses + sens **alternés** (ne reboucle jamais à l'identique).
- Texte **énorme, condensé** (display type Anton en test), **mots pleins ↔ mots en contour**
  alternés (rythme zine).
- **Chaque mot = une porte** vers un monde.
- **Survol** : le rang se **fige** (pause) + le mot vire à l'**ocre** (état actif) + l'aberration
  chromatique se nettoie.
- **Aberration chromatique** rouge/cyan sur les mots pleins (look VHS).
- **HUD caméscope** : `● REC`, timestamp qui tourne, date, → l'écran devient un viseur.
- **Grain filmique + scanlines** par-dessus toute la compo (texte compris).
- **Bande de tracking** qui glisse verticalement.
- **Toggle son** discret en haut à droite (vidéo muette au départ = obligatoire autoplay).
- **Couleur réservée aux doodles** ; l'UI reste mono (encre/paper).

À REJETER (anti-AI-slop) : fond crème/ivoire, dégradés décoratifs, ombres portées,
violet/indigo par défaut, pilules colorées pleines, « calm editorial ».

---

## 3. Reference lock (recherche Refero, réelle)

| Source | Ce qu'on en garde |
|---|---|
| [Yung Studio](https://yung.studio) | **Fondation** : canvas noir pur, gros lettrage main blanc, display ultra-serré, vide généreux. |
| [North Kingdom](https://www.northkingdom.com) | **Portail vidéo** : fond sombre cinématique, contrôles vidéo en *ghost button* (bord 1px). |
| [Henry.codes](https://henry.codes) | **Zine/distressed** : mot filigrane géant, filets 2px, contours abîmés, énergie broadsheet. |
| [jun.works](https://jun.works) | **Index de liens** : entrées traitées comme blocs typographiques. |

---

## 4. Tokens

```
--ink     #0C0B0A   fond / encre
--paper   #F3EDE2   texte / blanc cassé
--ocre    #EF9F27   état actif (survol)
--vert    #1D9E75   doodle
--rose    #D4537E   doodle
--rouge   #E24B4A   doodle
Display : Anton (condensé) — bandeau + wordmark   [à valider, peut changer]
Sans    : Inter 400/500 — microcopie / UI
Mono    : DM Mono — HUD, timestamps
```

---

## 5. Le bundle (cartes `@dsCard`, prêtes pour claude.ai/design)

Dossier `claude-design/` — chaque `.html` est autonome (fonts via Google Fonts) :

| Fichier | Rôle |
|---|---|
| `hub-full.html` | Hub complet plein écran. **Pièce maîtresse.** |
| `marquee-wall.html` | Mur de banderoles isolé (juger typo + mouvement seuls). |
| `vhs-treatment.html` | Traitement VHS avec **curseurs** grain/aberration/scanlines/saturation. |
| `entry-states.html` | Une entrée en 3 états : repos / survol / contour. |
| `tokens.html` | Palette, typo, doodles séparateurs. |

Pour pousser : session avec login claude.ai (scope design), puis DesignSync
`create_project` → `finalize_plan` → `write_files` (localDir = ce dossier).
Les cartes s'indexent via le marqueur `<!-- @dsCard group="Hub — freshman.tv" -->`.

---

## 6. LE BOULOT — worklist d'affinage

### Réglages look (dans `vhs-treatment.html`, puis reporter dans `hub-full.html`)
- [ ] Doser le **grain** (subtil ↔ cassette pourrie) — valeur retenue : ____
- [ ] Doser l'**aberration chromatique** (px) — valeur retenue : ____
- [ ] Doser les **scanlines** (opacité) — valeur retenue : ____
- [ ] Doser la **saturation** du footage — valeur retenue : ____
- [ ] Fréquence des « décrochages » / glitchs de tracking (rare ↔ fréquent).

### Banderole
- [ ] Valider la **typo display** finale (Anton ou autre condensée plus perso ?).
- [ ] Taille / nombre de rangs définitif (4 actuellement).
- [ ] Vitesses par rang (actuel : 20s / 26s / 30s / 23s).
- [ ] Intitulés finaux des mondes + faut-il des **mots d'ambiance** en plus des portes ?
- [ ] Séparateurs : remplacer les glyphes `✲ ✦` par de **vrais doodles**.

### Assets à fournir (auteur)
- [ ] **Boucle found footage / archive** (paysage, ~10–20s, muette) → remplace le dégradé `.foot`.
- [ ] **5–8 doodles SVG** + **1 doodle par monde** (séparateurs + identité).
- [ ] Confirmer le **wordmark** (« rafraf ™ » placeholder).

### Pas encore traité (prochaines étapes)
- [ ] **Transition au clic** vers un monde (fondu encré / doodle qui avale l'écran / zoom).
- [ ] **Responsive** mobile (bandeau vertical ? réduction du nombre de rangs ?).
- [ ] **Accessibilité** : `prefers-reduced-motion` (stopper le défilement), focus clavier sur
      les entrées, alt/labels, contraste du texte sur la vidéo.
- [ ] **Perf** : poids vidéo, `will-change`, fallback image si la vidéo ne charge pas.
- [ ] Démarrer le **scaffold Astro** une fois le look figé.

---

## 7. Notes d'implémentation (pour le build Astro)
- Hub = `src/pages/index.astro`, mondes = `src/pages/cine.astro` etc. (CSS isolé par page).
- Marquee : dupliquer la bande + `translateX(-50%)` en boucle = pas de couture.
- Vidéo : `autoplay muted loop playsinline` + `poster` fallback.
- Grain : `feTurbulence` SVG en overlay `mix-blend-mode: overlay`.
- Garder JS au minimum ; interactif (curseur custom, WebGL) seulement si besoin, en îlot.
