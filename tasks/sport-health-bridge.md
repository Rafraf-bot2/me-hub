# Guide — Pont téléphone Health Connect → /sport (Partie 5-B)

> Objectif : faire remonter **pas + nutrition + poids** de ton Android vers la base D1,
> pour allumer les tuiles de l'Aperçu et l'onglet Graille (déjà codés, ils attendent la data).
> Le endpoint serveur (`POST /ingest/health`) est **déjà en prod et testé**. Ici = tout est côté téléphone.

---

## Le principe (à comprendre avant de configurer)

```
[Samsung Health, Yazio, balance…] ──► [Health Connect] ──lecture──► [Tasker] ──POST /ingest/health──► [Worker] ──► [D1] ──► /sport
```

- Health Connect = le hub santé d'Android où **tout converge déjà** (tu l'as validé).
- Tasker (+ un plugin) **lit** Health Connect et **POST** un JSON vers le Worker, avec un token.
- Le Worker fait un **upsert par date** dans la table `daily` (1 ligne = 1 jour).

### ⚠️ Règle d'or : un snapshot COMPLET du jour, à chaque run
L'upsert **écrase tous les champs** de la ligne du jour avec ce que tu envoies.
Donc la tâche Tasker doit, à chaque exécution :
1. relire **toutes** les métriques du jour (pas, kcal in/out, macros, poids),
2. assembler **un seul** objet JSON,
3. faire **un seul** POST.

Ne fais **pas** deux automatisations séparées (une pour les pas, une pour la bouffe) qui
taperaient la même date : la seconde effacerait la première. Champ absent → envoie `null`
(le serveur tolère les null, il les stocke tels quels).

---

## Contrat du endpoint (la cible)

- **URL** : `https://rafraf.space/ingest/health` (= même host que `INGEST_URL` de la GitHub Action, en `/ingest/health`).
  `/ingest` n'est **pas** derrière Cloudflare Access → pas de login, protégé par le **token** à la place.
- **Méthode** : `POST`
- **Headers** : `content-type: application/json` + `x-ingest-token: <INGEST_TOKEN>`
  (le même secret que le Worker / les secrets GitHub).
- **Body** (tous les champs sauf `date` sont optionnels → `null` accepté) :

```json
{
  "date": "2026-07-01",   // YYYY-MM-DD, heure LOCALE (clé primaire de la ligne)
  "steps": 8421,          // entier — pas du jour
  "kcal_in": 2100,        // entier — calories mangées (Yazio → HC)
  "kcal_out": 2650,       // entier — calories dépensées (Total Calories Burned)
  "protein_g": 140,       // réel — protéines (g)
  "carbs_g": 210,         // réel — glucides (g)
  "fat_g": 70,            // réel — lipides (g)
  "weight_kg": 78.4       // réel — dernier poids connu
}
```

- **Réponse OK** : `{"ok":true}`. Erreurs : `403` (mauvais token), `400` (`date` manquante), `503` (D1 pas branché).

---

## Étape 0 — Vérifier le endpoint SANS téléphone (2 min, à faire en premier)

Depuis n'importe quel PC (remplace `<TOKEN>` par ton `INGEST_TOKEN`) :

```bash
curl -X POST https://rafraf.space/ingest/health \
  -H "content-type: application/json" \
  -H "x-ingest-token: <TOKEN>" \
  -d '{"date":"2026-07-01","steps":8421,"kcal_in":2100,"kcal_out":2650,"protein_g":140,"carbs_g":210,"fat_g":70,"weight_kg":78.4}'
```

Attendu : `{"ok":true}`. Ensuite ouvre **/sport** (login Access) → l'onglet **Graille** et les
tuiles de l'Aperçu doivent s'allumer avec ces valeurs bidon. **Si ça marche, le reste n'est
plus que "brancher Tasker sur cette même requête".** (Pense à ré-écraser la ligne avec la vraie
data ensuite, ou supprime-la.)

---

## Étape 1 — Les données arrivent-elles DANS Health Connect ?

Le pont ne peut lire que ce qui est déjà dans Health Connect. À vérifier dans l'app **Santé Connect** → *Données et accès* :
- [ ] **Pas** : via Samsung Health → Health Connect (⚠️ la sync Samsung Health→HC reste à activer, cf todo étape 5).
- [x] **Nutrition** (kcal + macros) : Yazio → HC (déjà connecté).
- [ ] **Poids** : Samsung Health / ta balance / saisie manuelle → HC.
- [ ] **Calories dépensées** (`kcal_out`) : Samsung Health écrit *Total Calories Burned* dans HC.

Si une source manque, branche-la d'abord (sinon le champ restera `null`, ce qui est toléré mais l'UI n'affichera rien pour lui).

---

## Étape 2 — Installer l'outillage

1. **Tasker** (payant, Play Store) — l'automatiseur Android.
2. **Tasker Health Connect** (plugin gratuit, open source) :
   - Repo : https://github.com/RafhaanShah/TaskerHealthConnect (APK dans *Releases*, aussi sur F-Droid).
   - Lance l'app une fois → elle vérifie que Health Connect est présent → **accorde les permissions de LECTURE** : Steps, Total Calories Burned, Nutrition, Weight.
   - ⚠️ Plugin volontairement "pas débutant" : entrée/sortie = **JSON brut de l'API Health Connect**. On s'appuie sur le parsing JSON natif de Tasker.

---

## Étape 3 — La tâche Tasker « Sport → D1 »

### Le format que renvoie le plugin (vérifié sur le repo)
Un *Read Aggregated Data* portant sur **une seule** métrique renvoie toujours ce JSON :
```json
{ "dataOrigins": [], "doubleValues": { "Nutrition_calories_total": 2100.0 }, "longValues": { "Steps_count_total": 8421 } }
```
→ **une seule valeur**, soit dans `longValues` (entiers : pas), soit dans `doubleValues` (réels : kcal, macros, poids).
Objet vide (`{}`) = pas de data pour la période. D'où un extracteur générique (« prends la seule
valeur présente ») qui **ne dépend pas du nom de clé exact** → robuste aux évolutions du plugin.

### Les actions de la Task (dans l'ordre)
Fais **un read par métrique** (une seule valeur en sortie = parsing trivial), fenêtre = **aujourd'hui 00:00 → maintenant**
(réglée dans l'écran de config du plugin), et range chaque JSON dans sa variable :

| # | Action plugin : *Read Aggregated Data* | Métrique | Variable sortie |
|---|---|---|---|
| 1 | Steps | `COUNT_TOTAL` | `%hcsteps` |
| 2 | Nutrition | `ENERGY_TOTAL` | `%hckcalin` |
| 3 | Nutrition | `PROTEIN_TOTAL` | `%hcprot` |
| 4 | Nutrition | `TOTAL_CARBOHYDRATE_TOTAL` | `%hccarb` |
| 5 | Nutrition | `TOTAL_FAT_TOTAL` | `%hcfat` |
| 6 | Total Calories Burned | `ENERGY_TOTAL` | `%hckcalout` |
| 7 | Weight | `WEIGHT_AVG` (fenêtre = aujourd'hui) | `%hcweight` |

> Poids : `WEIGHT_AVG` sur **aujourd'hui** = ta pesée du jour (si une seule). Aucune pesée aujourd'hui →
> objet vide → on envoie `null`, et le front garde le poids du jour précédent. C'est le comportement voulu
> (chaque jour stocke SA pesée ; le Δ7j est calculé côté serveur sur les jours stockés).

### Action 8 — un seul JavaScriptlet qui extrait tout + assemble le body
Colle ça dans une action **Code → JavaScriptlet** (les variables Tasker `%hcsteps`… sont exposées en JS sous `hcsteps`… ; la variable `body` créée ici ressort en `%body`) :

```js
// "la seule valeur" d'un JSON de read agrégé, ou null si vide/illisible
function val(j){ try { var o=JSON.parse(j); var m=Object.assign({},o.longValues,o.doubleValues);
  var v=Object.values(m)[0]; return (v==null)?null:v; } catch(e){ return null; } }
function int(x){ return x==null ? "null" : Math.round(x); }          // entiers (pas, kcal)
function one(x){ return x==null ? "null" : Math.round(x*10)/10; }     // 1 décimale (macros, poids)

var date = new java.text.SimpleDateFormat("yyyy-MM-dd").format(new java.util.Date()); // local
var body = '{"date":"'+date+'"'
  + ',"steps":'     + int(val(hcsteps))
  + ',"kcal_in":'   + int(val(hckcalin))
  + ',"kcal_out":'  + int(val(hckcalout))
  + ',"protein_g":' + one(val(hcprot))
  + ',"carbs_g":'   + one(val(hccarb))
  + ',"fat_g":'     + one(val(hcfat))
  + ',"weight_kg":' + one(val(hcweight))
  + '}';
```

### Action 9 — HTTP Request
- Method `POST`
- URL `https://rafraf.space/ingest/health`
- Headers : `content-type:application/json` **et** `x-ingest-token:<TOKEN>`
- Body `%body`
- (Optionnel) action suivante : *If* `%http_response_code !~ 200` → *Flash* `Sport KO: %http_response_code %http_data` (le worker renvoie maintenant `400 bad json` / `403` lisibles, plus de 1101).

> **Débug progressif** : commence avec **seulement l'action 1 (pas) + 8 + 9** (les autres `val()` renverront
> `null` → `"null"` dans le body, toléré). Prouve le 200, vois les pas dans Graille, PUIS ajoute les
> autres reads un par un.

### ⚠️ Unités à sanity-checker au premier vrai run
- **kcal** (`ENERGY_TOTAL`) : vérifie que `kcal_in` colle à Yazio. Si c'est ~4,18× trop grand, le plugin
  sort des **kJ** → divise par 4,184 (`Math.round(val/4.184)`).
- **macros / poids** : attendus en **grammes / kg**. Si un ordre de grandeur cloche, ajuste le facteur dans le JavaScriptlet.

---

## Étape 4 — Déclencheur + fiabilité batterie

- **Profile Tasker** : *Time* → tous les jours à **23:45** (snapshot de fin de journée).
  Comme l'upsert est par date et écrase, tu peux **aussi** le lancer plusieurs fois/jour
  (ex. à midi + le soir) sans risque : ça rafraîchit juste la ligne du jour.
- **Doze / optimisation batterie** : whitelister **Tasker** *et* le plugin Health Connect
  (Paramètres → Batterie → apps non optimisées), sinon le profil ne se déclenche pas en veille.

---

## Vérif finale (bout en bout)

1. Lance la tâche à la main dans Tasker → doit finir sans erreur (HTTP 200, `{"ok":true}`).
2. Ouvre **/sport** → onglet **Graille** : kcal in/out, macros, poids + Δ, mini-histo pas → remplis avec ta vraie data du jour.
3. Tuiles de l'**Aperçu** (kcal mangées / pas / protéines) : allumées.
4. Laisse tourner 2-3 jours → la mini-histo des pas sur 7 jours se remplit.

---

## Notes / pièges

- **Fuseau** : `date` doit être en **heure locale** (comme les séances Hevy), sinon un run après minuit
  UTC mais avant minuit local rangerait la data sur le mauvais jour. Le `SimpleDateFormat` ci-dessus est en heure locale du tel → OK.
- **Poids qui disparaît** : lis le poids sur une fenêtre 7 j (dernier connu), pas "aujourd'hui seulement",
  sinon les jours sans pesée renverraient `null` et videraient l'affichage du poids ce jour-là.
- **Alternative sans Tasker** : une app dédiée (Kotlin, permissions Health Connect + un WorkManager qui POST) serait
  plus robuste mais beaucoup plus lourde. À réserver si Tasker galère.
- **PWA (étape 8)** : indépendant de ce pont. Le pont remplit la data ; la PWA, c'est juste l'installation de /sport en appli.
