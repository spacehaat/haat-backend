#!/usr/bin/env python3
"""Map data (13).csv Noida website leads to seed JSON (deduped, seats as-is)."""
from __future__ import annotations

import csv
import json
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
CSV_PATH = ROOT / 'data (13).csv'
OUT_PATH = Path(__file__).resolve().parent / 'noida-csv-leads.json'

INTERESTED = {
    'private office': 'Private office',
    'dedicated desk': 'Dedicated desk',
    'managed office': 'Managed office',
    'coworking': 'Hot desk',
    'hot desk': 'Hot desk',
    'any/other solution': 'Hot desk',
}


def norm_phone(value: str) -> str:
    digits = re.sub(r'\D', '', value or '')
    return digits[-10:] if len(digits) >= 10 else digits


def norm_text(value: str) -> str:
    return re.sub(r'\s+', ' ', (value or '').strip())


def norm_city(value: str) -> str:
    value = norm_text(value)
    return value.capitalize() if value else 'Noida'


def map_interested(value: str) -> str | None:
    return INTERESTED.get(norm_text(value).lower())


def parse_dt(date_s: str, time_s: str) -> datetime | None:
    date_s, time_s = norm_text(date_s), norm_text(time_s)
    if not date_s:
        return None
    month, day, year = [int(x) for x in date_s.split('/')]
    hour = minute = second = 0
    match = re.match(r'^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$', time_s, re.I)
    if match:
        hour, minute, second = int(match.group(1)), int(match.group(2)), int(match.group(3))
        meridiem = (match.group(4) or '').upper()
        if meridiem == 'PM' and hour < 12:
            hour += 12
        if meridiem == 'AM' and hour == 12:
            hour = 0
    return datetime(year, month, day, hour, minute, second)


def seat_range_as_is(value: str) -> str:
    return norm_text(value)


def main() -> None:
    if not CSV_PATH.exists():
        raise SystemExit(f'CSV not found: {CSV_PATH}')

    with CSV_PATH.open(newline='', encoding='utf-8') as handle:
        rows = list(csv.DictReader(handle))

    parsed = []
    for row_num, row in enumerate(rows, start=2):
        phone = norm_phone(row.get('Phone Number', ''))
        lead_dt = parse_dt(row.get('Date', ''), row.get('Time', ''))
        if len(phone) != 10 or not lead_dt:
            continue

        location = norm_text(row.get('Location') or row.get('Address'))
        interested = map_interested(row.get('Interested In', ''))
        seat_range = seat_range_as_is(row.get('Number of Seats', ''))

        parsed.append({
            'rowNum': row_num,
            'name': norm_text(row.get('Name', '')),
            'email': norm_text(row.get('Email', '')).lower(),
            'contact': phone,
            'interestedIn': [interested] if interested else [],
            'city': norm_city(row.get('City', '')),
            'microlocation': location,
            'seatRange': seat_range,
            'seats': 0,
            'leadDate': lead_dt.isoformat(),
            'dedupeKey': f'{phone}|{lead_dt.isoformat()}',
            'softKey': f'{phone}|{lead_dt.date()}|{interested or ""}|{location.lower()}',
            'rawEnquiry': '\n'.join([
                part for part in [
                    f'Seats: {seat_range}' if seat_range else '',
                    f"Interested in: {norm_text(row.get('Interested In', ''))}" if row.get('Interested In') else '',
                    f"Location: {norm_text(row.get('Location', ''))}" if row.get('Location') else '',
                    f"Address: {norm_text(row.get('Address', ''))}" if row.get('Address') else '',
                ] if part
            ]),
            'source': 'website',
            'stage': 'new',
        })

    seen_exact: set[str] = set()
    unique = []
    for item in parsed:
        if item['dedupeKey'] in seen_exact:
            continue
        seen_exact.add(item['dedupeKey'])
        unique.append(item)

    groups: dict[str, list[dict]] = {}
    for item in unique:
        groups.setdefault(item['softKey'], []).append(item)

    deduped = []
    skipped_near_dupes = []
    for items in groups.values():
        items.sort(key=lambda x: x['leadDate'])
        deduped.append(items[0])
        skipped_near_dupes.extend(items[1:])

    deduped.sort(key=lambda x: x['leadDate'], reverse=True)

    payload = {
        'sourceFile': str(CSV_PATH.name),
        'generatedAt': datetime.now().isoformat(),
        'totalCsvRows': len(rows),
        'validRows': len(parsed),
        'toImport': len(deduped),
        'skippedNearDuplicates': len(skipped_near_dupes),
        'leads': deduped,
    }

    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    print(f'Wrote {len(deduped)} leads to {OUT_PATH}')


if __name__ == '__main__':
    main()
