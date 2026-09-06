#!/usr/bin/env python3
"""Map New Delhi workspace CSV → listing JSON for seed-new-delhi-csv.ts.

Images stay as source (Cloudinary) URLs; the TS seed downloads + uploads to S3.
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parents[3] / "new_delhi_workspaces_cleaned_with_images.csv"
OUT_PATH = Path(__file__).resolve().parent / "new-delhi-csv-listings.json"

BRAND_CANON = {
    "91springboard": "91Springboard",
    "awfis": "Awfis",
    "indiqube": "IndiQube",
    "smartworks": "Smartworks",
    "wework": "WeWork",
    "cowrks": "COWRKS",
    "innov8": "Innov8",
    "regus": "Regus",
}


def clean(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def parse_images(raw: str | None) -> list[str]:
    if not raw:
        return []
    parts = re.split(r"[\n|]+", raw)
    out = []
    seen = set()
    for p in parts:
        u = p.strip()
        if not u.lower().startswith("http"):
            continue
        if u in seen:
            continue
        seen.add(u)
        out.append(u)
    return out


def parse_money_values(s: str | None) -> list[int]:
    t = clean(s)
    if not t:
        return []
    tl = t.lower().replace(",", "")
    nums = re.findall(r"\d+(?:\.\d+)?", tl)
    vals = []
    for n in nums:
        v = float(n)
        if v >= 100:  # ignore tiny tokens
            vals.append(int(round(v)))
    return vals


def parse_layout(raw: str | None) -> dict:
    text = (raw or "").strip()
    floors = ""
    area = 0
    seats = 0
    included = ""

    m = re.search(r"Total building floors:\s*([^\n]+)", text, re.I)
    if m:
        floors = clean(m.group(1))

    m = re.search(r"Total area:\s*([\d,]+)", text, re.I)
    if m:
        area = int(m.group(1).replace(",", ""))

    m = re.search(r"Total seating capacity:\s*([\d,]+)", text, re.I)
    if m:
        seats = int(m.group(1).replace(",", ""))

    m = re.search(r"Included floor:\s*([^\n]+)", text, re.I)
    if m:
        included = clean(m.group(1))

    return {
        "floors": floors,
        "superBuiltUp": area,
        "totalSeats": seats,
        "includedFloor": included,
        "raw": text,
    }


def centre_name(space: str, building: str) -> str:
    space = clean(space)
    building = clean(building)
    if space and building:
        return f"{space} – {building}"
    return space or building


def operator_from(brand: str, space: str) -> str:
    brand_clean = clean(brand)
    if not brand_clean or brand_clean.lower() in {"other coworking", "other"}:
        return clean(space) or "Coworking"
    key = brand_clean.lower()
    if key in BRAND_CANON:
        return BRAND_CANON[key]
    if brand_clean.islower() or brand_clean.isupper():
        return brand_clean.title()
    return brand_clean


def row_to_listing(row: dict, index: int) -> dict | None:
    space = clean(row.get("Space name"))
    building = clean(row.get("Building Name"))
    if not space and not building:
        return None

    name = centre_name(space, building)
    address = clean(row.get("Address"))
    micro = clean(row.get("location")) or "Delhi"
    connectivity = clean(row.get("connectivityDetails"))
    region = clean(row.get("region"))
    brand = clean(row.get("brand"))
    layout = parse_layout(row.get("propertyLayout"))
    images = parse_images(row.get("spaceImages"))
    money = parse_money_values(row.get("price"))

    dedicated = money[0] if money else 0
    closing = money[1] if len(money) > 1 else 0
    seats = layout["totalSeats"] or 0

    # Prefer CSV address; otherwise building only (location/city live in micro/city fields).
    if not address and building:
        address = building

    identity: dict = {
        "centreName": name,
        "address": address,
    }
    if connectivity:
        identity["nearestMetro"] = connectivity
    if layout["floors"]:
        identity["floors"] = layout["floors"]
    if layout["superBuiltUp"]:
        identity["superBuiltUp"] = layout["superBuiltUp"]
    if region:
        identity["zoning"] = region
    if building:
        identity["buildingType"] = building
    if layout["raw"]:
        identity["layoutType"] = layout["raw"]
    if layout["includedFloor"]:
        identity["deskSize"] = layout["includedFloor"]

    capacity: dict = {}
    if seats:
        capacity["totalSeats"] = seats
        capacity["totalWorkstations"] = seats

    pricing: dict = {}
    if dedicated:
        pricing["dedicatedDesk"] = dedicated
    if closing:
        pricing["privateCabin"] = closing  # upper band when range given

    sales: dict = {}
    if dedicated:
        sales["pitchingPrice"] = dedicated
    if closing:
        sales["closingPrice"] = closing

    profile: dict = {"identity": identity}
    if capacity:
        profile["capacity"] = capacity
    if pricing:
        profile["pricing"] = pricing
    if sales:
        profile["salesIntel"] = sales
    if images:
        profile["contactsMedia"] = {"gallery": images}  # replaced after S3 upload

    return {
        "csvIndex": index,
        "csvSpaceName": space,
        "csvBuildingName": building,
        "operator": operator_from(brand, space),
        "city": "Delhi",
        "micro": micro,
        "type": "Coworking",
        "seats": seats,
        "price": dedicated or closing or 0,
        "amenities": [],
        "avail": "Available now",
        "source": "csv-new-delhi",
        "sourceImages": images,
        "images": [],
        "photoMeta": [],
        "profile": profile,
        "csvCentreName": name,
        "csvMicro": micro,
        "csvRegion": region,
        "csvConnectivity": connectivity,
        "csvPriceRaw": clean(row.get("price")),
        "csvLayoutRaw": layout["raw"],
    }


def main():
    if not CSV_PATH.exists():
        raise SystemExit(f"CSV not found: {CSV_PATH}")

    with CSV_PATH.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    listings = []
    skipped = 0
    for i, row in enumerate(rows):
        doc = row_to_listing(row, i)
        if not doc:
            skipped += 1
            continue
        listings.append(doc)

    OUT_PATH.write_text(json.dumps(listings, ensure_ascii=False, indent=2), encoding="utf-8")
    with_images = sum(1 for L in listings if L.get("sourceImages"))
    total_imgs = sum(len(L.get("sourceImages") or []) for L in listings)
    print(f"wrote {len(listings)} listings → {OUT_PATH}")
    print(f"skipped empty rows: {skipped}")
    print(f"with images: {with_images}")
    print(f"total source images: {total_imgs}")


if __name__ == "__main__":
    main()
