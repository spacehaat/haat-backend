#!/usr/bin/env python3
"""Match delhi-workspaces CSV rows to Delhi inventory listings in MongoDB."""

from __future__ import annotations

import csv
import json
import re
import subprocess
import sys
from difflib import SequenceMatcher
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parents[3] / "delhi-workspaces-2026-07-19.csv"
BACKEND_DIR = Path(__file__).resolve().parents[2]
OUT_PATH = Path(__file__).resolve().parent / "delhi-workspace-image-match.json"


def norm(value: str | None) -> str:
    text = (value or "").lower().strip()
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[^a-z0-9 ]", "", text)
    for suffix in (" new delhi", " delhi", " ncr"):
        if text.endswith(suffix):
            text = text[: -len(suffix)].strip()
    replacements = {
        "sprinjgboard": "springboard",
        "jahndwalan": "jhandewalan",
        "coworking": "cowork",
        "coworks": "cowork",
        "workspace": "work",
        "workspaces": "work",
        "co working": "cowork",
        "coworking space": "cowork",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return re.sub(r"\s+", " ", text).strip()


def tokens(value: str | None) -> set[str]:
    return {t for t in norm(value).split() if len(t) > 1}


def token_overlap(a: str | None, b: str | None) -> float:
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    inter = ta & tb
    if not inter:
        return 0.0
    return len(inter) / max(len(ta), len(tb))


def norm_brand(value: str | None) -> str:
    text = norm(value)
    aliases = {
        "91springboard": "91",
        "91 springboard": "91",
        "abl workspaces": "abl",
        "abl workspace": "abl",
        "cowrks": "cowrks",
        "co offiz": "co offiz",
        "other coworking": "",
        "other": "",
        "go hive": "gohive",
        "gohive": "gohive",
        "altf": "altf",
        "awfis": "awfis",
        "spacetime": "spacetime",
        "desker": "desker",
    }
    return aliases.get(text, text)


def split_images(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [part.strip() for part in raw.split("|") if part.strip()]


def similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if a in b or b in a:
        return 0.92
    return SequenceMatcher(None, a, b).ratio()


def load_csv_rows() -> list[dict]:
    with CSV_PATH.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    parsed = []
    for row in rows:
        name = (row.get("name") or "").strip()
        if not name:
            continue
        parsed.append(
            {
                "name": name,
                "address": (row.get("address") or "").strip(),
                "microlocation": (row.get("microlocation") or "").strip(),
                "brand_name": (row.get("brand_name") or "").strip(),
                "status": (row.get("status") or "").strip(),
                "images": split_images(row.get("images_url")),
                "norm_name": norm(name),
                "norm_micro": norm(row.get("microlocation")),
                "norm_brand": norm_brand(row.get("brand_name")),
            }
        )
    return parsed


def load_db_listings() -> list[dict]:
    node_script = """
import 'dotenv/config';
import mongoose from 'mongoose';
import { Listing } from './src/modules/listings/listings.model.ts';

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const rows = await Listing.find({ city: { $regex: /^delhi$/i } })
    .select('operator city micro profile.identity.centreName profile.identity.address images profile.contactsMedia.gallery')
    .lean();
  const out = rows.map((row) => ({
    id: String(row._id),
    operator: row.operator || '',
    micro: row.micro || '',
    centreName: row.profile?.identity?.centreName || '',
    address: row.profile?.identity?.address || '',
    images: row.images || row.profile?.contactsMedia?.gallery || [],
  }));
  process.stdout.write(JSON.stringify(out));
  await mongoose.disconnect();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
"""
    result = subprocess.run(
        ["npx", "tsx", "-e", node_script],
        cwd=BACKEND_DIR,
        check=True,
        capture_output=True,
        text=True,
    )
    listings = json.loads(result.stdout)
    for item in listings:
        centre = item["centreName"] or item["operator"]
        item["norm_operator"] = norm_brand(item["operator"])
        item["norm_centre"] = norm(centre)
        item["norm_micro"] = norm(item["micro"])
        item["norm_brand_from_centre"] = norm_brand(centre)
    return listings


def score_match(csv_row: dict, listing: dict) -> tuple[float, list[str]]:
    reasons: list[str] = []
    score = 0.0

    centre_sim = max(
        similarity(csv_row["norm_name"], listing["norm_centre"]),
        token_overlap(csv_row["name"], listing["centreName"] or listing["operator"]),
    )
    if centre_sim >= 0.98:
        score += 0.5
        reasons.append("centre_name")
    elif centre_sim >= 0.72:
        score += 0.38
        reasons.append("centre_name_fuzzy")
    elif centre_sim >= 0.55:
        score += 0.22
        reasons.append("centre_name_partial")

    micro_sim = max(
        similarity(csv_row["norm_micro"], listing["norm_micro"]),
        token_overlap(csv_row["microlocation"], listing["micro"]),
    )
    if micro_sim >= 0.98:
        score += 0.28
        reasons.append("microlocation")
    elif micro_sim >= 0.75:
        score += 0.18
        reasons.append("microlocation_fuzzy")

    csv_brand = csv_row["norm_brand"]
    listing_brands = {
        listing["norm_operator"],
        listing["norm_brand_from_centre"],
        norm_brand(listing["centreName"]),
    }
    listing_brands.discard("")
    brand_sim = 0.0
    if csv_brand:
        brand_sim = max(similarity(csv_brand, b) for b in listing_brands)
        brand_sim = max(brand_sim, token_overlap(csv_row["brand_name"], listing["operator"]))
        brand_sim = max(brand_sim, token_overlap(csv_row["brand_name"], listing["centreName"]))
    if brand_sim >= 0.98:
        score += 0.12
        reasons.append("brand")
    elif brand_sim >= 0.65:
        score += 0.08
        reasons.append("brand_fuzzy")

    if csv_row["norm_name"] == listing["norm_centre"] and csv_row["norm_micro"] == listing["norm_micro"]:
        score = max(score, 0.96)
        reasons.append("exact_name_micro")

    if centre_sim >= 0.72 and micro_sim >= 0.75:
        score = max(score, 0.88)
        reasons.append("strong_name_micro")

    if centre_sim >= 0.55 and micro_sim >= 0.98 and brand_sim >= 0.65:
        score = max(score, 0.84)
        reasons.append("brand_micro")

    return min(score, 1.0), reasons


def build_pairings(csv_rows: list[dict], listings: list[dict]) -> list[tuple[dict, dict, float, list[str]]]:
    pairs: list[tuple[float, dict, dict, list[str]]] = []
    for csv_row in csv_rows:
        for listing in listings:
            score, reasons = score_match(csv_row, listing)
            if score >= 0.78:
                pairs.append((score, csv_row, listing, reasons))
    pairs.sort(key=lambda item: item[0], reverse=True)

    used_csv: set[str] = set()
    used_listing: set[str] = set()
    chosen: list[tuple[dict, dict, float, list[str]]] = []
    for score, csv_row, listing, reasons in pairs:
        csv_key = csv_row["name"] + "|" + csv_row["microlocation"]
        if csv_key in used_csv or listing["id"] in used_listing:
            continue
        used_csv.add(csv_key)
        used_listing.add(listing["id"])
        chosen.append((csv_row, listing, score, reasons))
    return chosen


def main() -> int:
    if not CSV_PATH.exists():
        print(f"CSV not found: {CSV_PATH}", file=sys.stderr)
        return 1

    csv_rows = load_csv_rows()
    listings = load_db_listings()

    pairings = build_pairings(csv_rows, listings)
    matched: list[dict] = []
    used_listing_ids = {listing["id"] for _, listing, _, _ in pairings}
    matched_csv_keys = {row["name"] + "|" + row["microlocation"] for row, _, _, _ in pairings}

    for csv_row, listing, score, reasons in pairings:
        matched.append(
            {
                "csvName": csv_row["name"],
                "csvBrand": csv_row["brand_name"],
                "csvMicro": csv_row["microlocation"],
                "listingId": listing["id"],
                "dbOperator": listing["operator"],
                "dbCentreName": listing["centreName"],
                "dbMicro": listing["micro"],
                "score": round(score, 3),
                "reasons": reasons,
                "csvImageCount": len(csv_row["images"]),
                "dbImageCount": len(listing["images"]),
                "images_url": csv_row["images"],
            }
        )

    unmatched_csv = []
    for row in csv_rows:
        key = row["name"] + "|" + row["microlocation"]
        if key in matched_csv_keys:
            continue
        best_score = 0.0
        best_reasons: list[str] = []
        for listing in listings:
            score, reasons = score_match(row, listing)
            if score > best_score:
                best_score = score
                best_reasons = reasons
        unmatched_csv.append(
            {
                "name": row["name"],
                "brand_name": row["brand_name"],
                "microlocation": row["microlocation"],
                "bestScore": round(best_score, 3),
                "reasons": best_reasons,
                "imageCount": len(row["images"]),
            }
        )

    unmatched_db = [
        {
            "id": item["id"],
            "operator": item["operator"],
            "centreName": item["centreName"],
            "micro": item["micro"],
            "imageCount": len(item["images"]),
        }
        for item in listings
        if item["id"] not in used_listing_ids
    ]

    summary = {
        "csvRows": len(csv_rows),
        "dbDelhiListings": len(listings),
        "matched": len(matched),
        "unmatchedCsv": len(unmatched_csv),
        "unmatchedDb": len(unmatched_db),
        "matchedWithImages": sum(1 for item in matched if item["csvImageCount"] > 0),
        "matchedDbWithoutImages": sum(1 for item in matched if item["dbImageCount"] == 0),
        "matchedReadyForImageUpload": sum(
            1 for item in matched if item["csvImageCount"] > 0 and item["dbImageCount"] == 0
        ),
    }

    report = {
        "summary": summary,
        "matched": matched,
        "unmatchedCsv": unmatched_csv,
        "unmatchedDb": unmatched_db,
    }
    OUT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps(summary, indent=2))
    print(f"\nDetailed report: {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
