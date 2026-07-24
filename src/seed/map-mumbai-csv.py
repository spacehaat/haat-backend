#!/usr/bin/env python3
"""Map Mumbai workspace CSV → listing JSON for seed-mumbai-csv.ts."""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parents[4] / "mumbai-workspaces-2026-07-24.csv"
OUT_PATH = Path(__file__).resolve().parent / "mumbai-csv-listings.json"

BRAND_CANON = {
    "91springboard": "91Springboard",
    "altf": "AltF",
    "awfis": "Awfis",
    "indiqube": "IndiQube",
    "smartworks": "Smartworks",
    "wework": "WeWork",
}


def clean(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def parse_money(s: str | None) -> int | None:
    t = clean(s)
    if not t:
        return None
    tl = t.lower().replace(",", "")
    nums = re.findall(r"\d+(?:\.\d+)?", tl)
    if not nums:
        return None
    vals = [float(n) for n in nums]
    big = [v for v in vals if v >= 100]
    pick = big[0] if big else vals[0]
    return int(round(pick))


def parse_images(raw: str | None) -> list[str]:
    if not raw:
        return []
    parts = re.split(r"\s*\|\s*", raw.strip())
    return [p.strip() for p in parts if p.strip().lower().startswith("http")]


def operator_from_row(name: str, brand: str) -> str:
    brand_clean = clean(brand)
    if not brand_clean or brand_clean.lower() in {"other coworking", "other"}:
        return clean(name)
    key = brand_clean.lower()
    if key in BRAND_CANON:
        return BRAND_CANON[key]
    if brand_clean.islower() or brand_clean.isupper():
        return brand_clean.title()
    return brand_clean


def row_to_listing(row: dict) -> dict | None:
    name = clean(row.get("name"))
    if not name:
        return None

    address = clean(row.get("address"))
    micro = clean(row.get("microlocation"))
    brand = clean(row.get("brand_name"))
    images = parse_images(row.get("images_url"))
    dedicated = parse_money(row.get("dedicated_desk_price"))
    private_cabin = parse_money(row.get("private_cabin_price"))
    status = clean(row.get("status")).lower()

    price = dedicated if dedicated is not None else (private_cabin or 0)

    identity: dict = {"centreName": name}
    if address:
        identity["address"] = address

    pricing: dict = {}
    if dedicated is not None:
        pricing["dedicatedDesk"] = dedicated
    if private_cabin is not None:
        pricing["privateCabin"] = private_cabin

    profile: dict = {"identity": identity}
    if pricing:
        profile["pricing"] = pricing
    if images:
        profile["contactsMedia"] = {"gallery": images}

    avail = "Available now" if status == "approve" else "In progress"

    return {
        "operator": operator_from_row(name, brand),
        "city": "Mumbai",
        "micro": micro or "Mumbai",
        "type": "Coworking",
        "seats": 0,
        "price": price,
        "amenities": [],
        "avail": avail,
        "source": "csv-mumbai",
        "images": images,
        "photoMeta": [],
        "profile": profile,
        "csvCentreName": name,
        "csvMicro": micro,
    }


def main():
    if not CSV_PATH.exists():
        raise SystemExit(f"CSV not found: {CSV_PATH}")

    with CSV_PATH.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    listings = []
    skipped = 0
    for row in rows:
        doc = row_to_listing(row)
        if not doc:
            skipped += 1
            continue
        listings.append(doc)

    OUT_PATH.write_text(json.dumps(listings, ensure_ascii=False, indent=2), encoding="utf-8")

    with_images = sum(1 for L in listings if L.get("images"))
    with_dd = sum(1 for L in listings if L.get("profile", {}).get("pricing", {}).get("dedicatedDesk"))
    with_pc = sum(1 for L in listings if L.get("profile", {}).get("pricing", {}).get("privateCabin"))

    print(f"wrote {len(listings)} listings → {OUT_PATH}")
    print(f"skipped empty rows: {skipped}")
    print(f"with images: {with_images}")
    print(f"with dedicated desk price: {with_dd}")
    print(f"with private cabin price: {with_pc}")


if __name__ == "__main__":
    main()
