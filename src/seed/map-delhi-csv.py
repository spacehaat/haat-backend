#!/usr/bin/env python3
"""Map Delhi CSV rows → listing JSON (only confident fields)."""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parents[3] / "Delhi Data - Sheet1.csv"
OUT_PATH = Path(__file__).resolve().parent / "delhi-csv-listings.json"

COL = {
    "name": "🏢 Your office space name",
    "total_seats": "Total seats ",
    "virtual": "🖥 Virtual office available for given microlocation ?",
    "dd_total": "🪑  No. of open desks(dd) (Total)",
    "dd_avail": "🪑  No. of open desks (Available as of now)",
    "dd_pitch": "🪑  Open dedicated desk PITCHING PRICE ( per seat per month ) for walkin clients",
    "dd_close": "🪑  Open dedicated desk Closing price ( per seat per month )  for walkin clients",
    "pc_pitch": "💺  Private cabins ( Pitching Price per seat ) for walkin clients",
    "day_pass": "💺 Day pass price",
    "conf_rooms": "💺 No. of conference rooms with seats",
    "conf_hour": "💺 Conference rooms pricing per hour ",
    "meet_rooms": "💺 No. of meeting rooms with seats",
    "meet_hour": "💺 Meeting room pricing per hour",
    "website": "💻 Website Link of center page",
    "primary": "📞 Primary contact person & contact number",
    "visit_handler": "💁‍♂️ Primary visit handler at the place",
    "email": "✉ Email ",
    "address": "📍  Full address",
    "maps": "📍 Google map location link",
    "metro": "🚇 Nearest Metro Station (s) ( with line, with distance )",
    "days_open": "📅 Days open",
    "timings": "⌚ Timings ( Access )",
    "flexi": "🪑  Flexi desk price  ( per seat per month ) ( If available )",
    "amenities": "⭐ Services/Amenities",
    "notice": "📃 Notice peroid  ",
    "deposit": "💵 Secuirty Depoisit required ( How many months )",
    "managed": "🏢 Managed office avialable?",
    "car_price": "🚗  Car parking space charges ( per month )",
    "car_type": "🚗 Car parking space type",
    "brochure": "🗞 Brochure/Proposal",
    "super_built": "📏 Super Built-up Area (in sqft )",
    "building": "🏢 Building Type",
    "facing": "🎐 Entrance facing",
    "ownership": "Building ownership type",
    "sunday": "🤝 Can we align visits for sunday?",
    "signage": "🖼️ Personal Signage board for reception area charges",
    "conf_day": "💺 Conference rooms pricing per day",
    "meet_day": "💺 Meeing room pricing per day",
    "instagram": "💻  Instagram page link",
    "linkedin": "💻 LinkedIn page link",
    "landmark": "📍  Landmark",
    "floors": "🚪 Floors",
    "expansion": "🚀 Expansion plan ",
    "payment": "🏦 Payment details",
    "virtual_tour": "Virtual tour Youtube video link",
    "managed_psf": "Managed office pricing per square fee",
    "carpet": "💺  Carpet Size ( in sqft )",
    "managed_psf2": "Pricing ( per sqft ) for managed office",
    "competitors": "🥊Nearby Co-workings",
    "working_on": "Working on",
    "two_wheeler": "🏍 2 wheeler parking space charges  ",
    "beyond": "Beyond hours charges ",
    "sales_head": "Sales head contact & number",
}

JUNK_EXACT = {
    "na", "n/a", "n.a", "nba", "nil", "none", "null", "-", "--", ".",
    "same", "same as before", "same as all", "same as previous", "same as primary",
    "same as primary contact", "same as cr", "same as cf", "same as meeting room",
    "same as center", "same as 2.0", "calculate", "caculate", "will share",
    "need to share", "need to check", "need to ask", "need to ask ma'am",
    "need to ask sir", "need to ask maam", "ask sir", "ask raadhika ma'am",
    "will ask sir", "not applicable", "not required", "not listed yet",
    "mentioned", "mentiond", "yes", "no", "an", "rr", "dds", "ff",
    "depends", "it depends", "many", "followed",
}

JUNK_PREFIX = (
    "need to", "will share", "ask ", "same as", "calculate", "caculate",
)

FACING_OK = {
    "north", "south", "east", "west",
    "north east", "north-east", "northeast",
    "north west", "north-west", "northwest",
    "south east", "south-east", "southeast",
    "south west", "south-west", "southwest",
}

FACING_NORM = {
    "northeast": "North-East", "north east": "North-East", "north-east": "North-East",
    "northwest": "North-West", "north west": "North-West", "north-west": "North-West",
    "southeast": "South-East", "south east": "South-East", "south-east": "South-East",
    "southwest": "South-West", "south west": "South-West", "south-west": "South-West",
    "north": "North", "south": "South", "east": "East", "west": "West",
}

MICROS = [
    ("Netaji Subhash Place", ["netaji subhash place", "nsp", "n.s.p"]),
    ("Connaught Place", ["connaught place", "connaught", " rajiv chowk"]),
    ("Nehru Place", ["nehru place"]),
    ("Greater Kailash", ["greater kailash", " gk ", "gk-1", "gk-2", "gk1", "gk2"]),
    ("Karol Bagh", ["karol bagh"]),
    ("Hauz Khas", ["hauz khas"]),
    ("Janakpuri", ["janakpuri"]),
    ("Saket", ["saket", "saidulajab", "saiyad ul ajaib", "saidul ajab", "westend marg"]),
    ("Okhla", ["okhla", "mohan cooperative", "mohan co-operative"]),
    ("Aerocity", ["aerocity", "aero city"]),
    ("Dwarka", ["dwarka"]),
    ("Pitampura", ["pitampura"]),
    ("Rohini", ["rohini"]),
    ("Vasant Kunj", ["vasant kunj"]),
    ("Defence Colony", ["defence colony"]),
    ("Lajpat Nagar", ["lajpat nagar"]),
    ("Mayur Vihar", ["mayur vihar"]),
    ("Laxmi Nagar", ["laxmi nagar"]),
    ("Preet Vihar", ["preet vihar"]),
    ("Rajouri Garden", ["rajouri garden"]),
    ("Moti Nagar", ["moti nagar"]),
    ("Kirti Nagar", ["kirti nagar"]),
    ("Green Park", ["green park"]),
    ("Malviya Nagar", ["malviya nagar"]),
    ("CR Park", ["chittaranjan park", "cr park", "c.r. park"]),
    ("South Extension", ["south extension", "south ex"]),
    ("Bhikaji Cama", ["bhikaji cama", "bikaji cama"]),
    ("Barakhamba", ["barakhamba", "barakhamba road"]),
    ("Rajendra Place", ["rajendra place"]),
    ("Patel Nagar", ["patel nagar"]),
    ("Tilak Nagar", ["tilak nagar"]),
    ("Subhash Nagar", ["subhash nagar", "meenakshi garden"]),
    ("Rithala", ["rithala", "rithaal"]),
    ("Mahipalpur", ["mahipalpur"]),
    ("Uttam Nagar", ["uttam nagar"]),
    ("Paschim Vihar", ["paschim vihar"]),
    ("Punjabi Bagh", ["punjabi bagh"]),
    ("Shahdara", ["shahdara"]),
    ("Anand Vihar", ["anand vihar"]),
    ("Kalkaji", ["kalkaji"]),
    ("Govindpuri", ["govindpuri"]),
    ("Jasola", ["jasola"]),
    ("Sarita Vihar", ["sarita vihar"]),
    ("Noida", ["noida"]),  # still city=Delhi per instructions, micro can note Noida pocket if present
    ("Gurugram", ["gurugram", "gurgaon"]),
]


def clean(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def is_junk(s: str | None) -> bool:
    t = clean(s).lower()
    if not t:
        return True
    if t in JUNK_EXACT:
        return True
    if any(t.startswith(p) for p in JUNK_PREFIX):
        return True
    if t in {"yes", "no"} and len(t) <= 3:
        # bare yes/no is junk for URL/price/text fields — caller may use yes_no separately
        return False
    return False


def usable(s: str | None) -> str | None:
    t = clean(s)
    if not t or is_junk(t):
        return None
    # bare yes/no for non-boolean fields
    if t.lower() in {"yes", "no"}:
        return None
    return t


def parse_money(s: str | None) -> int | None:
    t = clean(s)
    if not t or is_junk(t):
        return None
    tl = t.lower().replace(",", "")
    if any(x in tl for x in ("na", "need", "ask", "depend", "calculate", "free", "not ")):
        if not re.search(r"\d", tl):
            return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*k\b", tl)
    if m:
        return int(round(float(m.group(1)) * 1000))
    m = re.search(r"(\d+(?:\.\d+)?)\s*lakh", tl)
    if m:
        return int(round(float(m.group(1)) * 100_000))
    nums = re.findall(r"\d+(?:\.\d+)?", tl)
    if not nums:
        return None
    # pick the first substantial number (skip lonely "15" from "15% gst" if larger present)
    vals = [float(n) for n in nums]
    # Prefer values that look like prices (>= 100) when mixed with small tags
    big = [v for v in vals if v >= 100]
    pick = big[0] if big else vals[0]
    if pick < 1:
        return None
    return int(round(pick))


def parse_int(s: str | None) -> int | None:
    t = clean(s)
    if not t or is_junk(t):
        return None
    # "95 total seat", "180"
    m = re.search(r"(\d+)", t.replace(",", ""))
    if not m:
        return None
    return int(m.group(1))


def parse_area(s: str | None) -> int | None:
    t = clean(s)
    if not t or is_junk(t):
        return None
    m = re.search(r"(\d[\d,]*(?:\.\d+)?)", t)
    if not m:
        return None
    return int(round(float(m.group(1).replace(",", ""))))


def yes_no(s: str | None) -> bool | None:
    t = clean(s).lower()
    if not t:
        return None
    if t in {"yes", "y", "true"}:
        return True
    if t in {"no", "n", "false"}:
        return False
    return None


def parse_person(s: str | None) -> dict | None:
    t = usable(s)
    if not t:
        return None
    phone = None
    name = None
    pm = re.search(r"(\+?\d[\d\s\-]{8,}\d)", t)
    if pm:
        phone = re.sub(r"\s+", " ", pm.group(1)).strip()
    # name in parentheses
    nm = re.search(r"\(([^)]+)\)", t)
    if nm:
        name = clean(nm.group(1))
    else:
        # "NAME - phone" or "NAME phone"
        rest = t
        if pm:
            rest = (t[: pm.start()] + t[pm.end() :]).strip(" -–,")
        rest = re.sub(r"[()]", "", rest).strip(" -–,")
        if rest and not re.fullmatch(r"[\d\s+\-]+", rest):
            name = clean(rest) or None
    out = {}
    if name:
        out["name"] = name
    if phone:
        out["phone"] = phone
    return out or None


def operator_from_name(full: str) -> str:
    parts = full.split()
    if not parts:
        return full
    # Keep short brand tokens like 4U, MYTIME
    return parts[0]


def infer_type(working_on: str | None) -> str:
    t = clean(working_on).lower()
    if "managed office" in t and "co-working" not in t and "coworking" not in t:
        return "Managed office"
    if t.startswith("managed office") or t == "managed office":
        return "Managed office"
    # "Co-working spaces, Managed office" → Dedicated desk (coworking primary)
    if "managed office" in t and ("co-working" in t or "coworking" in t or "business" in t):
        return "Dedicated desk"
    if "managed office" in t:
        return "Managed office"
    return "Dedicated desk"


def infer_micro(address: str, metro: str, landmark: str) -> str:
    blob = f" {clean(address).lower()} {clean(metro).lower()} {clean(landmark).lower()} "
    for label, hints in MICROS:
        for h in hints:
            if h in blob:
                return label
    # try metro station name before parenthesis
    m = usable(metro)
    if m:
        station = re.split(r"[\(\[]", m)[0].strip()
        station = re.sub(r"\s+metro.*$", "", station, flags=re.I).strip()
        if station and len(station) >= 3 and station.lower() not in JUNK_EXACT:
            return station.title() if station.islower() else station
    return "Delhi"


def map_days(s: str | None) -> str | None:
    t = usable(s)
    if not t:
        return None
    tl = t.lower()
    if "all day" in tl or "all days" in tl:
        return "All days"
    if "mon" in tl and "fri" in tl and "sat" not in tl:
        return "Mon – Fri"
    if "mon" in tl and "sat" in tl:
        return "Mon – Sat"
    if "mon" in tl and "sun" in tl:
        return "All days"
    return t


def map_facing(s: str | None) -> str | None:
    t = clean(s).lower()
    if not t or is_junk(t):
        return None
    if "vastu" in t:
        return None  # vastu handled separately if needed
    if t in FACING_OK or t in FACING_NORM:
        return FACING_NORM.get(t, t.title())
    return None


def map_building(s: str | None) -> str | None:
    t = usable(s)
    if not t:
        return None
    return t


def map_ownership(s: str | None) -> str | None:
    t = usable(s)
    if not t:
        return None
    # Keep raw known values; skip nonsense multi
    if "," in t:
        return None
    return t


def parse_amenities(s: str | None) -> list[str]:
    t = clean(s)
    if not t or is_junk(t):
        return []
    parts = re.split(r"[,|]", t)
    out = []
    for p in parts:
        # strip leading emojis / symbols
        cleaned = re.sub(r"^[\W_\d]+", "", p, flags=re.UNICODE).strip()
        cleaned = re.sub(r"\s+", " ", cleaned)
        if cleaned and len(cleaned) > 1 and cleaned.lower() not in JUNK_EXACT:
            out.append(cleaned)
    # dedupe preserve order
    seen = set()
    uniq = []
    for a in out:
        k = a.lower()
        if k not in seen:
            seen.add(k)
            uniq.append(a)
    return uniq


def parse_competitors(s: str | None) -> list[str]:
    t = usable(s)
    if not t:
        return []
    parts = re.split(r"[,|/]|\band\b", t, flags=re.I)
    out = []
    for p in parts:
        c = clean(p)
        if c and not is_junk(c) and c.lower() not in {"many", "yes"}:
            out.append(c)
    return out


def parse_room_count(s: str | None) -> int | None:
    """Extract room count from strings like '10 st * 1', '8 seater * 1'."""
    t = clean(s)
    if not t or is_junk(t):
        return None
    # sum multipliers: "6 seater * 2, 8 seater * 3"
    mults = re.findall(r"\*\s*(\d+)", t)
    if mults:
        return sum(int(x) for x in mults)
    # "10 st * 1" already covered; lone "1" or "2 rooms"
    m = re.search(r"(\d+)\s*(?:room|nos|no\.?)", t, re.I)
    if m:
        return int(m.group(1))
    # if only seat size mentioned without count, assume 1 when looks like a room spec
    if re.search(r"\d+\s*(st|seater|seat)", t, re.I):
        return 1
    return parse_int(t)


def parse_url(s: str | None) -> str | None:
    t = usable(s)
    if not t:
        return None
    if t.lower().startswith("http"):
        return t
    return None


def set_if(d: dict, key: str, val):
    if val is None:
        return
    if val == "" or val == []:
        return
    d[key] = val


def row_to_listing(row: dict) -> dict | None:
    name = clean(row.get(COL["name"]))
    if not name:
        return None

    address = usable(row.get(COL["address"]))
    metro = usable(row.get(COL["metro"]))
    landmark = usable(row.get(COL["landmark"]))

    pitching = parse_money(row.get(COL["dd_pitch"]))
    closing = parse_money(row.get(COL["dd_close"]))
    price = pitching if pitching is not None else 0

    seats = parse_int(row.get(COL["dd_avail"]))
    if seats is None:
        seats = parse_int(row.get(COL["dd_total"]))
    if seats is None:
        seats = parse_int(row.get(COL["total_seats"]))
    if seats is None:
        seats = 0

    identity: dict = {}
    set_if(identity, "centreName", name)
    set_if(identity, "address", address)
    maps_raw = clean(row.get(COL["maps"]))
    if maps_raw.lower().startswith("http"):
        identity["mapsLink"] = maps_raw
    set_if(identity, "nearestMetro", metro)
    set_if(identity, "floors", usable(row.get(COL["floors"])))
    set_if(identity, "buildingType", map_building(row.get(COL["building"])))
    set_if(identity, "ownership", map_ownership(row.get(COL["ownership"])))
    set_if(identity, "entranceFacing", map_facing(row.get(COL["facing"])))
    set_if(identity, "superBuiltUp", parse_area(row.get(COL["super_built"])))
    set_if(identity, "carpet", parse_area(row.get(COL["carpet"])))
    # landmark → zoning free text if useful
    set_if(identity, "zoning", landmark)

    capacity: dict = {}
    set_if(capacity, "totalSeats", parse_int(row.get(COL["total_seats"])))
    set_if(capacity, "totalWorkstations", parse_int(row.get(COL["dd_total"])))
    set_if(capacity, "availWorkstations", parse_int(row.get(COL["dd_avail"])))
    set_if(capacity, "conferenceRooms", parse_room_count(row.get(COL["conf_rooms"])))
    set_if(capacity, "meetingRooms", parse_room_count(row.get(COL["meet_rooms"])))

    flexi = parse_money(row.get(COL["flexi"]))
    if flexi is not None:
        capacity["hotDeskAvailable"] = True

    pricing: dict = {}
    set_if(pricing, "dedicatedDesk", pitching)
    set_if(pricing, "hotDesk", flexi)
    set_if(pricing, "privateCabin", parse_money(row.get(COL["pc_pitch"])))
    set_if(pricing, "dayPass", parse_money(row.get(COL["day_pass"])))
    set_if(pricing, "confRoomHour", parse_money(row.get(COL["conf_hour"])))
    set_if(pricing, "confRoomDay", parse_money(row.get(COL["conf_day"])))
    set_if(pricing, "meetingRoomHour", parse_money(row.get(COL["meet_hour"])))
    # meeting day often junk — only if numeric
    set_if(pricing, "carParking", parse_money(row.get(COL["car_price"])))
    set_if(pricing, "twoWheeler", parse_money(row.get(COL["two_wheeler"])))
    set_if(pricing, "signageBoard", parse_money(row.get(COL["signage"])))
    set_if(pricing, "beyondHours", usable(row.get(COL["beyond"])))
    set_if(pricing, "securityDeposit", usable(row.get(COL["deposit"])))
    set_if(pricing, "noticePeriod", usable(row.get(COL["notice"])))
    mpsf = parse_money(row.get(COL["managed_psf"])) or parse_money(row.get(COL["managed_psf2"]))
    set_if(pricing, "managedPerSqft", mpsf)

    sales: dict = {}
    set_if(sales, "pitchingPrice", pitching)
    set_if(sales, "closingPrice", closing)
    set_if(sales, "competitors", parse_competitors(row.get(COL["competitors"])))
    set_if(sales, "expansionPlans", usable(row.get(COL["expansion"])))
    set_if(sales, "commissionAccount", usable(row.get(COL["payment"])))

    ops: dict = {}
    set_if(ops, "timings", usable(row.get(COL["timings"])))
    set_if(ops, "daysOpen", map_days(row.get(COL["days_open"])))
    sunday = yes_no(row.get(COL["sunday"]))
    if sunday is not None:
        ops["sundayVisits"] = sunday
    managed = yes_no(row.get(COL["managed"]))
    if managed is not None:
        ops["managedOfficeAvailable"] = managed
    virtual = yes_no(row.get(COL["virtual"]))
    if virtual is not None:
        ops["virtualOfficeAvailable"] = virtual

    contacts: dict = {}
    primary = parse_person(row.get(COL["primary"]))
    if primary:
        contacts["centerManager"] = primary
        if primary.get("phone"):
            contacts["salesPhone"] = primary["phone"]
    visit = parse_person(row.get(COL["visit_handler"]))
    # only if distinct person
    if visit and visit != primary:
        contacts["communityManager"] = visit
    email = usable(row.get(COL["email"]))
    if email and "@" in email:
        contacts["salesEmail"] = email
    set_if(contacts, "website", parse_url(row.get(COL["website"])))
    set_if(contacts, "instagram", parse_url(row.get(COL["instagram"])))
    set_if(contacts, "linkedin", parse_url(row.get(COL["linkedin"])))
    set_if(contacts, "virtualTour", parse_url(row.get(COL["virtual_tour"])))
    set_if(contacts, "brochure", usable(row.get(COL["brochure"])))
    amenities = parse_amenities(row.get(COL["amenities"]))
    if amenities:
        contacts["extraAmenities"] = amenities
    car_type = usable(row.get(COL["car_type"]))
    car_price = parse_money(row.get(COL["car_price"]))
    if car_price is not None or (car_type and "free" in (car_type or "").lower()):
        contacts["carParkingAvailable"] = True
    elif car_type and car_type.lower() not in JUNK_EXACT:
        contacts["carParkingAvailable"] = True

    sales_head = parse_person(row.get(COL["sales_head"]))
    if sales_head and sales_head.get("phone") and not contacts.get("salesPhone"):
        contacts["salesPhone"] = sales_head["phone"]

    profile = {}
    if identity:
        profile["identity"] = identity
    if capacity:
        profile["capacity"] = capacity
    if pricing:
        profile["pricing"] = pricing
    if sales:
        profile["salesIntel"] = sales
    if ops:
        profile["operations"] = ops
    if contacts:
        profile["contactsMedia"] = contacts

    listing = {
        "operator": operator_from_name(name),
        "city": "Delhi",
        "micro": infer_micro(address or "", metro or "", landmark or ""),
        "type": infer_type(row.get(COL["working_on"])),
        "seats": seats,
        "price": price,
        "amenities": amenities,
        "source": "csv-delhi",
        "images": [],
        "photoMeta": [],
        "profile": profile,
        "csvCentreName": name,
    }
    return listing


def main():
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

    micros = {}
    types = {}
    priced = 0
    for L in listings:
        micros[L["micro"]] = micros.get(L["micro"], 0) + 1
        types[L["type"]] = types.get(L["type"], 0) + 1
        if L["price"] > 0:
            priced += 1

    print(f"wrote {len(listings)} listings → {OUT_PATH}")
    print(f"skipped empty rows: {skipped}")
    print(f"with pitching price: {priced}")
    print("types:", types)
    print("top micros:", sorted(micros.items(), key=lambda x: -x[1])[:15])


if __name__ == "__main__":
    main()
