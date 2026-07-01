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

## Choix de l'automatiseur : Tasker (payant) vs Automate (GRATUIT)

Le lecteur de Health Connect = le **plugin gratuit `TaskerHealthConnect`** dans les deux cas.
Ce qui change, c'est l'app hôte qui l'exécute et récupère sa sortie :

| Hôte | Prix | Lit la sortie du plugin ? | Verdict |
|---|---|---|---|
| **Tasker** | ~4 € (une fois) | ✅ oui | Le plus carré (Étape 3A) |
| **Automate** (LlamaLab) | **gratuit** | ✅ oui (« Allow plug-in to set any variable ») | **La voie gratuite** (Étape 3B) |
| MacroDroid | gratuit | ❌ **non** — « plugins qui écrivent des variables Tasker n'écrivent rien dans MacroDroid » | ⛔ inutilisable ici |
| Automate seul, sans plugin | gratuit | podomètre matériel only | ⛔ pas de nutrition/poids (HC) |

→ **Gratuit = Automate + plugin.** Suis l'**Étape 2** puis l'**Étape 3B** (au lieu de 3A).

---

## Étape 2 — Installer l'outillage

1. **L'automatiseur** — au choix : **Tasker** (payant) OU **Automate** de LlamaLab (**gratuit**, Play Store ; version gratuite bridée en nb de blocs par flow, large assez ici).
2. **Tasker Health Connect** (plugin gratuit, open source — marche aussi comme plugin d'Automate) :
   - Repo : https://github.com/RafhaanShah/TaskerHealthConnect (APK dans *Releases*, aussi sur F-Droid).
   - Lance l'app une fois → elle vérifie que Health Connect est présent → **accorde les permissions de LECTURE** : Steps, Total Calories Burned, Nutrition, Weight.
   - ⚠️ Plugin volontairement "pas débutant" : entrée/sortie = **JSON brut de l'API Health Connect**. On s'appuie sur le parsing JSON natif de Tasker.

---

## Étape 3A — La tâche **Tasker** « Sport → D1 » (option payante)

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

## Étape 3B — Le flow **Automate** « Sport → D1 » (option GRATUITE)

Même logique que 3A, mais dans Automate. Automate a `jsonDecode()`, `findAll()` (regex) et un
bloc **HTTP request** → tout ce qu'il faut. Le flow (linéaire) :

1. **Déclenchement** : planifie le flow chaque jour (Automate : bloc de temps, ou une boucle
   `Flow beginning → … → Delay 24 h → (retour)`, ou un widget d'accueil pour le lancer à la main).
2. **7 blocs « Plug-in action »** (Tasker Health Connect → *Read Aggregated Data*), fenêtre = aujourd'hui,
   une métrique par bloc. Dans chaque bloc, coche **« Allow plug-in to set any variable »** et récupère
   la sortie JSON dans une variable dédiée :

   | Bloc | Métrique | Variable |
   |---|---|---|
   | 1 | Steps `COUNT_TOTAL` | `stepsJson` |
   | 2 | Nutrition `ENERGY_TOTAL` | `kcalInJson` |
   | 3 | Nutrition `PROTEIN_TOTAL` | `protJson` |
   | 4 | Nutrition `TOTAL_CARBOHYDRATE_TOTAL` | `carbJson` |
   | 5 | Nutrition `TOTAL_FAT_TOTAL` | `fatJson` |
   | 6 | Total Calories Burned `ENERGY_TOTAL` | `kcalOutJson` |
   | 7 | Weight `WEIGHT_AVG` (aujourd'hui) | `weightJson` |

3. **Extraire la valeur** — chaque JSON contient **une seule** valeur (dans `longValues` ou `doubleValues`),
   ou aucune (objet vide → à envoyer `null`). Deux façons dans un bloc **« Set variable »** :

   **a) Générique (recommandé, indépendant du nom de clé)** — via regex `findAll` : on capture le nombre
   qui précède une `}` :
   ```
   steps = findAll(stepsJson, ":\s*(\d+(?:\.\d+)?)\s*\}")[0][1]
   ```
   (répéter pour chaque variable). Si pas de match → la valeur est vide → traiter comme `null`.

   **b) Propre via jsonDecode** (si tu connais la clé exacte) :
   ```
   steps = jsonDecode(stepsJson)["longValues"]["Steps_count_total"]
   ```
   Clés confirmées : `Steps_count_total`, `Nutrition_calories_total`, `Weight_weight_avg`.
   Clés à vérifier (inférées) : `Nutrition_protein_total`, `Nutrition_total_carbohydrate_total`,
   `Nutrition_total_fat_total`, `TotalCaloriesBurned_energy_total`.

   > ⚠️ **Je n'ai pas pu tester Automate sur un vrai tel** → traite les expressions ci-dessus comme un
   > **template à valider**. Astuce debug : mets un bloc « Notification/Toast » qui affiche `stepsJson`
   > brut au premier run pour voir la vraie structure + les vrais noms de clés, puis fige l'extraction.

4. **Assembler le body** — bloc « Set variable » `body` (mets `null` pour toute valeur vide) :
   ```
   body = "{\"date\":\"" + formatTime(now(), "yyyy-MM-dd")
        + "\",\"steps\":" + steps + ",\"kcal_in\":" + kcalIn + ",\"kcal_out\":" + kcalOut
        + ",\"protein_g\":" + prot + ",\"carbs_g\":" + carb + ",\"fat_g\":" + fat
        + ",\"weight_kg\":" + weight + "}"
   ```
   (adapte `formatTime`/`now` au dialecte Automate ; l'important = date locale `YYYY-MM-DD`.)

5. **Bloc « HTTP request »** :
   - Method `POST`, URL `https://rafraf.space/ingest/health`
   - Headers : `content-type: application/json` + `x-ingest-token: <TOKEN>`
   - Body = `body`
   - Vérifie le code retour (200 attendu ; le worker renvoie `400 bad json` / `403` lisibles sinon).

> Comme en 3A : commence avec **les pas seuls** (le reste `null`), prouve le 200 + l'affichage Graille,
> puis ajoute les autres métriques une par une. Et **sanity-check les unités** (kcal vs kJ, cf 3A).

---

## Étape 4 — Déclencheur + fiabilité batterie

- **Déclencheur** (profile Tasker *Time* / planif Automate) : tous les jours à **23:45** (snapshot de fin de journée).
  Comme l'upsert est par date et écrase, tu peux **aussi** le lancer plusieurs fois/jour
  (ex. à midi + le soir) sans risque : ça rafraîchit juste la ligne du jour.
- **Doze / optimisation batterie** : whitelister **l'automatiseur** (Tasker *ou* Automate) *et* le plugin
  Health Connect (Paramètres → Batterie → apps non optimisées), sinon ça ne se déclenche pas en veille.

---

## Vérif finale (bout en bout)

1. Lance la tâche/le flow à la main → doit finir sans erreur (HTTP 200, `{"ok":true}`).
2. Ouvre **/sport** → onglet **Graille** : kcal in/out, macros, poids + Δ, mini-histo pas → remplis avec ta vraie data du jour.
3. Tuiles de l'**Aperçu** (kcal mangées / pas / protéines) : allumées.
4. Laisse tourner 2-3 jours → la mini-histo des pas sur 7 jours se remplit.

---

## Notes / pièges

- **Fuseau** : `date` doit être en **heure locale** (comme les séances Hevy), sinon un run après minuit
  UTC mais avant minuit local rangerait la data sur le mauvais jour. Le `SimpleDateFormat` ci-dessus est en heure locale du tel → OK.
- **Poids qui disparaît** : lis le poids sur une fenêtre 7 j (dernier connu), pas "aujourd'hui seulement",
  sinon les jours sans pesée renverraient `null` et videraient l'affichage du poids ce jour-là.
- **Dernier recours** : une app Android dédiée (Kotlin, permissions Health Connect + WorkManager qui POST) —
  plus robuste mais beaucoup plus lourde. À réserver si ni Tasker ni Automate ne conviennent.
- **PWA (étape 8)** : indépendant de ce pont. Le pont remplit la data ; la PWA, c'est juste l'installation de /sport en appli.
