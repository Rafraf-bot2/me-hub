#!/usr/bin/env python3
"""
Scrape Letterboxd user ratings filtered by exact star rating.
Usage:
    python scrape_letterboxd.py --user rafraf30 --rating 4.5
    python scrape_letterboxd.py --user rafraf30 --rating 5
    python scrape_letterboxd.py --user rafraf30  # all rated films
"""

import argparse
import csv
import json
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://letterboxd.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
}

# Letterboxd rating classes: rated-1 through rated-10 (half-star increments)
# rated-1 = 0.5, rated-2 = 1, ..., rated-9 = 4.5, rated-10 = 5
RATING_CLASS_TO_STARS = {f"rated-{i}": i / 2 for i in range(1, 11)}


def parse_rating(span):
    """Extract numeric rating from a rating span element."""
    if not span:
        return None
    classes = span.get("class", [])
    for cls in classes:
        if cls in RATING_CLASS_TO_STARS:
            return RATING_CLASS_TO_STARS[cls]
    return None


def scrape_page(url):
    """Fetch a single page and extract film data."""
    resp = requests.get(url, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    films = []
    posters = soup.select("li.poster-container")

    for li in posters:
        div = li.select_one("div.film-poster")
        if not div:
            continue

        slug = div.get("data-film-slug", "")
        title_tag = li.select_one("img.image")
        title = title_tag["alt"] if title_tag and title_tag.has_attr("alt") else slug

        # Year from the film page slug or overlay
        year = None
        year_match = re.search(r"-(\d{4})(?:-\d)?$", slug)
        if year_match:
            year = int(year_match.group(1))

        # Rating
        rating_span = li.select_one("span.rating")
        rating = parse_rating(rating_span)

        films.append({
            "title": title,
            "year": year,
            "rating": rating,
            "slug": slug,
            "url": f"{BASE_URL}/film/{slug}/"
        })

    # Check for next page
    next_link = soup.select_one("a.next")
    next_url = None
    if next_link and next_link.has_attr("href"):
        next_url = BASE_URL + next_link["href"]

    return films, next_url


def scrape_all_pages(user, rating_filter=None):
    """Scrape all pages of a user's rated films."""
    if rating_filter and rating_filter >= 4:
        url = f"{BASE_URL}/{user}/films/rated/4-5/"
    elif rating_filter and rating_filter >= 3:
        url = f"{BASE_URL}/{user}/films/rated/3-4/"
    elif rating_filter and rating_filter >= 2:
        url = f"{BASE_URL}/{user}/films/rated/2-3/"
    elif rating_filter and rating_filter >= 1:
        url = f"{BASE_URL}/{user}/films/rated/1-2/"
    else:
        url = f"{BASE_URL}/{user}/films/rated/.5-1/"

    if not rating_filter:
        url = f"{BASE_URL}/{user}/films/"

    all_films = []
    page = 1

    while url:
        print(f"  Scraping page {page}: {url}")
        films, next_url = scrape_page(url)
        all_films.extend(films)
        url = next_url
        page += 1
        time.sleep(0.5)  # Be polite

    # Filter by exact rating if specified
    if rating_filter is not None:
        filtered = [f for f in all_films if f["rating"] == rating_filter]
        print(f"\n  Found {len(all_films)} films total, {len(filtered)} with exactly {rating_filter} stars")
        return filtered, all_films

    return all_films, all_films


def save_json(films, filepath):
    """Save films list to JSON."""
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(films, f, ensure_ascii=False, indent=2)
    print(f"  Saved {len(films)} films to {filepath}")


def save_csv(films, filepath):
    """Save films list to CSV."""
    if not films:
        print(f"  No films to save to {filepath}")
        return
    fieldnames = ["title", "year", "rating", "slug", "url"]
    with open(filepath, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(films)
    print(f"  Saved {len(films)} films to {filepath}")


def main():
    parser = argparse.ArgumentParser(description="Scrape Letterboxd user ratings")
    parser.add_argument("--user", default="rafraf30", help="Letterboxd username")
    parser.add_argument("--rating", type=float, default=None,
                        help="Filter by exact rating (e.g. 4.5)")
    parser.add_argument("--output", default=None,
                        help="Output base filename (without extension)")
    args = parser.parse_args()

    print(f"Scraping Letterboxd ratings for user: {args.user}")
    if args.rating:
        print(f"Filtering for exactly {args.rating} stars")

    filtered, all_films = scrape_all_pages(args.user, args.rating)

    # Determine output filenames
    base = args.output or f"letterboxd_{args.user}"
    if args.rating:
        rating_str = str(args.rating).replace(".", "")
        filtered_base = f"{base}_{rating_str}stars"
    else:
        filtered_base = base

    # Save filtered results
    save_json(filtered, f"{filtered_base}.json")
    save_csv(filtered, f"{filtered_base}.csv")

    # If we filtered, also save all films from that range
    if args.rating and len(all_films) != len(filtered):
        all_base = f"{base}_all_{int(args.rating)}-{int(args.rating)+1 if args.rating < 5 else 5}"
        save_json(all_films, f"{all_base}.json")
        save_csv(all_films, f"{all_base}.csv")

    print("\nDone!")
    if filtered:
        print(f"\nSample films ({min(5, len(filtered))}/{len(filtered)}):")
        for f in filtered[:5]:
            year_str = f" ({f['year']})" if f['year'] else ""
            print(f"  * {f['title']}{year_str} - {f['rating']} stars")


if __name__ == "__main__":
    main()
