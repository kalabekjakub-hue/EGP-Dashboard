# Handoff: plate-country conflict ack v `admin.eurogopass.com`

> **Pro:** agenta / vyvojare admin dashboardu (`admin.eurogopass.com`, egp admin repo)
> **Od:** fulfillment worker (2026-08-20)
> **Cil:** operator v adminu potvrdi konflikt SPZ/zeme registrace → worker si objednavku znovu vezme
> **Worker repo:** `eurogopass-fulfillment-worker` (jen reference; UI patri do adminu)

---

## 1. Proc to existuje

Worker pred claimem kontroluje: **stejna normalizovana SPZ + jina zeme registrace** na jine `orders` radku → hold.

| Stav `orders.plate_country_conflict` | Vyznam |
|--------------------------------------|--------|
| `NULL` | Jeste nezkontrolovano (precheck smycka) |
| `true` | Konflikt – **claim nebere** polozky, dokud operator neackne |
| `false` | OK nebo **acked** – claim muze pokracovat |

SSOT je sloupec na **`orders`**. Na **`order_items`** a **`order_bridge_toll_items`** je **mirror** stejne boolean hodnoty (claim filtruje na items).

Precheck **prepisuje jen `NULL` → true/false**. Po ack (`false`) se flag sam nevrati na konflikt.

---

## 2. Co uz je hotove ve workeru (nedelat znovu)

- Migrace: `supabase/migrations/005_plate_country_conflict.sql` (**uz aplikovana** v produkcnim Supabase)
- Precheck smycka + ntfy alert
- Claim: `.eq("plate_country_conflict", false)` na vignette i bridge items
- Docasny ack v worker monitoru (zalozka Konflikty SPZ) – **neni kanonicke UI**; po admin implementaci muze zustat jako zaloha

**Admin nemusi volat worker HTTP.** Staci spravny zapis do Supabase (stejna DB jako egp).

---

## 3. Ukol pro admin dashboard

### 3.1 Seznam konfliktu

```sql
SELECT id, plate, registration_country, email, status, paid_at, created_at, plate_country_conflict
FROM orders
WHERE plate_country_conflict = true
ORDER BY created_at DESC;
```

Doporucene UI:

- Tabulka / filtr "Konflikty SPZ" (nebo badge na detailu objednavky)
- U kazdeho radku: SPZ, zeme registrace, status, odkaz na detail
- Volitelne: peer objednavky se stejnou SPZ (viz §5)

### 3.2 Akce: Potvrdit SPZ/zemi a pokracovat (ACK)

Po potvrzeni operatorem (explicitni tlacitko + potvrzovaci dialog):

1. `UPDATE orders SET plate_country_conflict = false WHERE id = :orderId`
2. `UPDATE order_items SET plate_country_conflict = false WHERE order_id = :orderId`
3. `UPDATE order_bridge_toll_items SET plate_country_conflict = false WHERE order_id = :orderId`

**Vsechny tri musi projit.** Bez mirroru na items claim polozku stale nedostane.

Kanonicka cesta v tomto dashboardu: `POST /api/orders/ack-plate-country-conflict` → RPC `ack_plate_country_conflict` (atomicky + audit v `dashboard_plate_country_conflict_acks`).

Reference ve workeru:

- `src/monitor/ack-plate-country-conflict.ts`
- `FulfillmentStore.ackPlateCountryConflict` v `src/integrations/supabase.ts`

Po uspesnem ack:

- Pending polozky (`status = pending`, `plate_country_conflict = false`) jsou claimable
- **Neni potreba** menit `orders.status` ani item `status` jen kvuli ack
- Worker neceka webhook

### 3.3 Opravneni

- Jen admin / ops role
- Idealne audit: kdo, kdy, ktere `order_id`

### 3.4 Copy (CZ)

- Tlacitko: **Potvrdit SPZ/zemi a pokracovat**
- Popis: Stejna SPZ s jinou zemi registrace nez u drivejsi objednavky. Po potvrzeni worker pokracuje v nakupu.
- Varovani: Over SPZ/zemi pred ack; pripadne oprav data drive.

---

## 4. Co admin nedela

| Nedelat | Proc |
|---------|------|
| Menit precheck ve workeru | Bezi v worker procesu |
| Volat Playwright / restart worker | Ack = jen DB flag |
| Mazat peer order | Ack jen uvolni aktualni order |
| Nastavit `NULL` po ack | Precheck by znovu zablokoval |
| Ack bez mirroru na items | Claim filtr je na items |

---

## 5. Volitelne: peer objednavky (UX)

Worker uklada jen boolean (peer je v ntfy). Pro UI porovnej `normalizePlate` + `normalizePlateCountry` (stejne jako worker).

- Plate: `src/domain/plate.ts` → `normalizePlate`
- Zeme: `src/domain/plate-country.ts` → `normalizePlateCountry`
- Pravidlo: `src/domain/plate-country-conflict.ts` → `findPlateCountryConflict`

MVP: raw `plate` match + rucni kontrola.

---

## 6. Alternativa (ne primarni)

```http
POST /api/orders/:orderId/ack-plate-country-conflict
Authorization: Bearer <MONITOR_ADMIN_TOKEN>
```

Kanonicka cesta: **primy Supabase zapis** (§3.2), ne worker HTTP.

---

## 7. Acceptance checklist (dashboard)

- [x] Seznam / filtr `plate_country_conflict = true` (Všechny objednávky + Centrum pozornosti). Archiv `/orders` řadí chronologicky; dokončené objednávky s konfliktem se netopují. Testovací SPZ `AAA`/`AAAAA` jsou skryté při čtení.
- [x] Detail order: flag + ack CTA kdyz `true`
- [x] Ack nastavi `false` na orders + order_items + order_bridge_toll_items (RPC `ack_plate_country_conflict`)
- [ ] Po ack zmizi z listu; worker claimne pending (pokud jine filtry dovoli) — overit po nasazeni migrace
- [x] Role-guard (admin session) + audit (`dashboard_plate_country_conflict_acks`)

---

## 8. Overeni

1. Nasadit migraci `202608200001_ack_plate_country_conflict.sql` v Supabase.
2. Najdi order s `plate_country_conflict = true`.
3. Ackni v adminu (Potvrdit SPZ/zemi a pokracovat).
4. Over tri tabulky = `false` + radek v `dashboard_plate_country_conflict_acks`.
5. Fronta/worker: item jde do processing (ne blocker plate_country_conflict).

---

## 9. Reference ve workeru

| Soubor | Role |
|--------|------|
| `supabase/migrations/005_plate_country_conflict.sql` | Schema |
| `src/queue/plate-country-precheck.ts` | Detekce |
| `src/domain/plate-country-conflict.ts` | Pravidlo |
| `src/monitor/ack-plate-country-conflict.ts` | Referencni ack |
| `docs/KONTEXT-ORCHESTRACE.md` | Orchestrace / claim |

Env: `PLATE_COUNTRY_CONFLICT_CHECK_ENABLED` (default true).
