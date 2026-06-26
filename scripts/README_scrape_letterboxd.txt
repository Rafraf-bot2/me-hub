==============================================================
  LETTERBOXD SCRAPER - Guide d'utilisation
==============================================================

DESCRIPTION
-----------
Script Python qui scrape les films notés d'un utilisateur
Letterboxd et les exporte en JSON et CSV.
Filtre par note exacte (ex: 4.5 étoiles).


PRE-REQUIS
----------
- Python 3.8+
- Installer les dépendances :

    pip install requests beautifulsoup4


UTILISATION
-----------

1) Scraper les films notés 4.5 étoiles de rafraf30 :

    python scrape_letterboxd.py --user rafraf30 --rating 4.5

2) Scraper les films notés 5 étoiles :

    python scrape_letterboxd.py --user rafraf30 --rating 5

3) Scraper TOUS les films notés (sans filtre) :

    python scrape_letterboxd.py --user rafraf30

4) Scraper un autre utilisateur :

    python scrape_letterboxd.py --user nom_utilisateur --rating 4.0

5) Choisir un nom de fichier de sortie :

    python scrape_letterboxd.py --user rafraf30 --rating 4.5 --output mes_films


OPTIONS
-------
  --user      Nom d'utilisateur Letterboxd (défaut: rafraf30)
  --rating    Note exacte à filtrer (ex: 0.5, 1, 1.5, ... 4.5, 5)
  --output    Nom de base pour les fichiers de sortie (sans extension)


FICHIERS GENERES
----------------
Quand tu lances avec --rating 4.5, le script génère :

  letterboxd_rafraf30_45stars.json   -> films notés exactement 4.5
  letterboxd_rafraf30_45stars.csv    -> idem en CSV
  letterboxd_rafraf30_all_4-5.json   -> tous les films entre 4 et 5
  letterboxd_rafraf30_all_4-5.csv    -> idem en CSV


FORMAT DES DONNEES
------------------
Chaque film contient :
  - title   : titre du film
  - year    : année de sortie (si disponible dans le slug)
  - rating  : note exacte (ex: 4.5)
  - slug    : identifiant Letterboxd du film
  - url     : lien direct vers la page du film


NOTES
-----
- Le script attend 0.5s entre chaque page pour ne pas surcharger
  les serveurs de Letterboxd.
- La pagination est gérée automatiquement.
- Letterboxd regroupe les notes par range (4-5, 3-4, etc.),
  le script filtre ensuite par note exacte.


EXEMPLE DE SORTIE
-----------------
  Scraping Letterboxd ratings for user: rafraf30
  Filtering for exactly 4.5 stars
    Scraping page 1: https://letterboxd.com/rafraf30/films/rated/4-5/
    Scraping page 2: https://letterboxd.com/rafraf30/films/rated/4-5/page/2/

    Found 105 films total, 26 with exactly 4.5 stars
    Saved 26 films to letterboxd_rafraf30_45stars.json
    Saved 26 films to letterboxd_rafraf30_45stars.csv

  Done!

  Sample films (5/26):
    * Mulholland Drive - 4.5 stars
    * The Godfather - 4.5 stars
    * GoodFellas - 4.5 stars
    * Cinema Paradiso - 4.5 stars
    * Mad Max: Fury Road - 4.5 stars
