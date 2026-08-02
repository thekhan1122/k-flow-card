# k-flow-card

**Khan Automation — Home Assistant Custom Energy Flow Card**
`k-flow-card.js` · Unified Edition  fixed some minor issues **V1.1.2**
<img width="1708" height="2520" alt="IMG_20260513_114249" src="https://github.com/user-attachments/assets/e4c54570-5b9e-43c4-9326-b44d4105a5d1" />
<img width="1108" height="1688" alt="IMG_20260516_011350" src="https://github.com/user-attachments/assets/6914d4ab-daa6-432a-983d-6abac15a1cac" />
<img width="1114" height="1744" alt="IMG_20260516_011300" src="https://github.com/user-attachments/assets/ce97703f-ed71-4ab9-a79d-8d7cf3bcd3f6" />

---

## Overview

`k-flow-card` is a fully custom Home Assistant Lovelace card that renders a live, animated energy-flow diagram for a GoodWe solar inverter system with JK BMS battery storage. It is self-contained in a single JavaScript file — no dependencies, no HACS card required beyond loading the resource.

The card combines an SVG energy-flow canvas (sun arc, animated flow paths, inverter, battery, grid, home, EV nodes) with an HTML stat panel showing real-time battery telemetry. Everything updates live via the standard `hass` setter.

---

## Features

- Animated S-curve energy flow paths (solar → inverter → battery / grid / home / EV)
- Live sun position tracking along an arc based on `sun.sun` elevation
- Battery SOC colour coding with dynamic charge/discharge indicators
- Dual battery support (primary + secondary, stacked layout)
- EV / car charger node with live state, SOC, and ETA
- Extra PV strings (PV3 / PV4) with combined toggle
- System limits panel (battery Ah/Wh, inverter max, PV max)
- Battery stat tiles: Cell Temp, BMS Temp, Min/Max Cell Voltage, Batt Discharge, Total PV Gen
- Endurance tile: charge/discharge time remaining or ETA timestamp
- Full visual editor with section toggles — no YAML required for setup
- Per-row custom label and entity overrides for all 6 stat tiles
- Fully dark-themed, mobile-friendly

---

## Installation

### Method 1 — HACS (Recommended)

1. In HACS, go to **Frontend → ⋮ → Custom repositories**
2. Paste: `https://github.com/thekhan1122/k-flow-card` (without `.git`)
3. Category: **Lovelace**
4. Install the card – the resource is added automatically.
5. Click the **+ Explore & Download Repositories** button.
6. Search for **k-flow-card**.
7. Click **Download** the resource is added automatically.
8. **Hard refresh** your browser (`Ctrl + Shift + R` / `Cmd + Shift + R`).
9. Open the visual editor to configure entities.

> HACS handles resource registration automatically. No manual resource entry needed.

---

### Method 2 — Manual

1. Copy `k-flow-card.js` to your HA config folder:
   ```
   /config/www/k-flow-card.js
   ```

2. Register as a Lovelace resource:
   *(Settings → Dashboards → Resources → Add)*
   ```yaml
   url: /local/k-flow-card.js
   type: module
   ```

3. Add to a dashboard view:
   ```yaml
   type: custom:k-flow-card
   ```

4. Open the visual editor to configure entities.

---

## Configuration Reference

All keys are configured through the visual editor. The YAML equivalents are listed below for reference or manual setup.

### Core / Solar

| Key | Default | Description |
|---|---|---|
| `inverter_name` | `''` | Label shown in the inverter node |
| `pv1_power` | `sensor.goodwe_pv1_power` | PV string 1 power (W) |
| `pv2_power` | `sensor.goodwe_pv2_power` | PV string 2 power (W) |
| `pv3_power` | `''` | PV string 3 — optional, enable via Extra PV toggle |
| `pv4_power` | `''` | PV string 4 — optional, enable via Extra PV toggle |
| `pv_total_power` | `sensor.goodwe_pv_power` | Total PV power (W) |
| `pv_max_power` | `7500` | Max PV power for bar scaling (W) |
| `today_pv` | `sensor.goodwe_today_s_pv_generation` | Today's PV generation (kWh) |
| `total_pv_gen_entity` | `sensor.goodwe_total_pv_generation` | Lifetime PV generation (kWh) |
| `inv_temp` | `sensor.goodwe_inverter_temperature_module` | Inverter temperature |
| `today_batt_chg` | `sensor.goodwe_today_battery_charge` | Today battery charge (kWh) |
| `today_load` | `sensor.goodwe_today_load` | Today load (kWh) |
| `sun` | `sun.sun` | Sun entity for arc position |

### Grid

| Key | Default | Description |
|---|---|---|
| `grid_active_power` | `sensor.goodwe_active_power` | Grid active power (W) |
| `grid_import_energy` | `sensor.goodwe_today_energy_import` | Today grid import (kWh) |
| `grid_export_energy` | `''` | Today grid export (kWh) — optional |
| `grid_power_alt` | `sensor.grid_phase_a_power` | Alternate grid power sensor |
| `invert_grid_power` | `false` | Invert sign — enable if positive = exporting |
| `consump` | `sensor.goodwe_house_consumption` | House consumption (W) |

### Primary Battery

| Key | Default | Description |
|---|---|---|
| `_show_battery` | `true` | Show primary battery section |
| `battery_soc` | `sensor.jk_soc` | Battery state of charge (%) |
| `battery_power` | `sensor.jk_power` | Battery power (W) |
| `battery_current` | `sensor.jk_current` | Battery current (A) |
| `battery_voltage` | `sensor.jk_voltage` | Battery voltage (V) |
| `battery_temp1` | `sensor.jk_temp1` | Cell temp probe 1 |
| `battery_temp2` | `sensor.jk_temp2` | Cell temp probe 2 |
| `battery_mos` | `sensor.jk_mos` | BMS MOS temperature |
| `battery_min_cell` | `sensor.jk_cellmin` | Min cell voltage |
| `battery_max_cell` | `sensor.jk_cellmax` | Max cell voltage |
| `batt_dis` | `sensor.goodwe_today_battery_discharge` | Today discharge (kWh) |
| `battery_full_ah` | `314` | Battery capacity (Ah) |
| `battery_full_wh` | `16076` | Battery capacity (Wh) |
| `goodwe_battery_soc` | `sensor.goodwe_battery_state_of_charge` | Fallback SOC |
| `goodwe_battery_curr` | `sensor.goodwe_battery_current` | Fallback current |
| `invert_battery_power` | `false` | Invert sign — enable if positive = discharging |

### Secondary Battery

| Key | Default | Description |
|---|---|---|
| `_show_battery2` | `false` | Enable secondary battery (chip toggle) |
| `battery2_soc` | `''` | Secondary SOC (%) |
| `battery2_power` | `''` | Secondary power (W) |
| `battery2_current` | `''` | Secondary current (A) |
| `battery2_voltage` | `''` | Secondary voltage (V) |
| `battery2_mos` | `''` | Secondary BMS temperature |

### EV / Car Charger

| Key | Default | Description |
|---|---|---|
| `_show_ev` | `false` | Enable EV section (chip toggle) |
| `charger_state` | `''` | Optional charger state entity (`charging`, `completed`, `finished`, `disconnected`). If omitted, unknown, or unavailable, measured power above 10 W activates the EV flow; explicit states remain authoritative. |
| `charger_power` | `''` | Charger power (W) |
| `charger_current` | `''` | Charger current (A) |
| `charger_soc` | `''` | Car battery SOC (%) |
| `charger_eta` | `''` | Charge ETA in minutes — optional |
| `charger_battery_capacity_wh` | `''` | EV battery capacity (Wh) |

### System Limits

| Key | Default | Description |
|---|---|---|
| `_show_limits` | `false` | Show limits section (chip toggle) |
| `inverter_max_power` | `6000` | Inverter max power for bar scaling (W) |

### Labels

| Key | Default | Description |
|---|---|---|
| `_labels_custom_entities` | `false` | Enable Labels section (chip toggle) |
| `label_cell_temp_minmax` | `CELL TEMP MIN/MAX` | Tile label — cell temp |
| `label_bms_temp` | `BMS TEMP` | Tile label — BMS temp |
| `label_min_cell` | `Min Cell` | Tile label — min cell voltage |
| `label_max_cell` | `Max Cell` | Tile label — max cell voltage |
| `label_batt_dis` | `Batt Dis.` | Tile label — battery discharge |
| `label_total_pv_gen` | `TOTAL PV GEN.` | Tile label — total PV generation |
| `label_entity_cell_temp` | `''` | Override entity for cell temp tile |
| `label_entity_bms_temp` | `''` | Override entity for BMS temp tile |
| `label_entity_min_cell` | `''` | Override entity for min cell tile |
| `label_entity_max_cell` | `''` | Override entity for max cell tile |
| `label_entity_batt_dis` | `''` | Override entity for batt dis tile |

> **Entity override rule:** An entity picker in the Labels section activates only when its corresponding label text has been changed from the default. Once active, the matching picker in the Battery section is locked with an "Overridden by Labels" veil to prevent duplication.

---

## Visual Editor Sections

| Section | Toggle | Description |
|---|---|---|
| General | — | Inverter name |
| Labels | `+ Enable` chip | Rename stat tiles; per-row entity overrides |
| Solar | — | PV1, PV2 entities |
| Extra PV Strings | `+ Enable` chip | PV3, PV4 |
| Solar Extras | — | Totals, temperatures, today stats |
| Grid | — | Grid power, import/export, consumption |
| Primary Battery | `+ Enable` chip | Full BMS telemetry |
| Secondary Battery | `+ Enable` chip | Second pack |
| System Limits | `+ Enable` chip | Capacity and power limits |
| EV / Car Charger | `+ Enable` chip | Charger state, SOC, ETA |

---

## Colour Logic

| Metric | Thresholds |
|---|---|
| **SOC** | ≤25% red · ≤50% orange · ≤75% blue · >75% green |
| **Cell Temp** | ≤15°C blue · ≤35°C green · ≤45°C orange · >45°C red |
| **Cell Voltage** | <3.0V red · <3.1V orange · <3.4V yellow · ≤3.65V green · >3.65V red |
| **Inverter / Env Temp** | ≤25°C green · ≤45°C orange · >45°C red |

---

## Changelog

### v7.4.0
- **Labels section — header chip toggle** (same style as Secondary Battery, Extra PV, EV, Limits sections). Body is hidden when disabled.
- **Per-row auto-enable logic:** each label row's entity picker activates independently — only when that row's text has been changed from its default value. No global unlock needed.
- **Per-row Battery/Solar locking:** corresponding pickers in Battery and Solar Extras sections lock individually when their label row is active, not all-at-once.
- `_updateDynamic` refactored: dead `_readEntity` helper removed; replaced with clean `_rowActive`, `_readNum`, `_readStr` helpers.
- `_set` now triggers a re-render on any of the 6 label text key changes (live editor feedback).

### v7.3.0
- **Labels editor** reduced to exactly 6 rows matching the 2×3 stat tile grid.
- `label_endurance` text field removed from editor (endurance tile exists on card but label is fixed).
- `label_endu_eta` / `label_entity_endu_eta` row removed from editor.
- **Battery voltage** (`battery_voltage`, `battery2_voltage`) is never locked — always freely editable regardless of Labels state.
- **Cell Temp override:** when a custom entity is selected, tile shows a single value only (no `temp1 / temp2` pair).
- **Endurance tile** layout: full card width, vertically compact row, all content bottom-aligned (`align-items:flex-end`).
- Dead stub config keys purged: `label_endu_eta`, `label_entity_endu_eta`, `label_entity_cell_temp2`, `label_entity_endurance`.

### v7.2.1
- **Endurance tile** redesigned from narrow column to full-width single row (horizontally full, vertically compact).
- **Cell Temp Min/Max** entity override: added second entity picker (`label_entity_cell_temp2`) to allow independent min/max overrides. *(Superseded in v7.3.0)*

### v7.2.0
- **Labels section** introduced with `switchRow` global toggle for custom entities.
- Six stat tiles made label-customisable: Cell Temp Min/Max, BMS Temp, Min Cell, Max Cell, Batt Dis, Total PV Gen.
- `pickerMaybeDisabled` helper added — renders override veil on Battery section pickers when Labels global toggle is ON.
- Battery voltage pickers exempted from locking.
- Info banner added above label rows.

### v7.1.x
- **Dual battery** support: Secondary Battery section with independent SOC, power, current, voltage, BMS temp.
- Battery current and power values moved outside the battery icon SVG: power displayed above flow bar, current below.
- Dual battery values stacked in stat tiles where applicable (e.g. `mos1 / mos2`).

### v7.0.x
- **EV / Car Charger** node added to SVG canvas with animated flow path, SOC arc, and ETA display.
- `_show_ev` chip toggle added to editor.
- Charger state machine: `charging`, `completed`, `finished`, `disconnected` with colour and icon changes.

### v6.x
- **Extra PV Strings** (PV3 + PV4) merged under one `_show_pv_extra` chip toggle (previously two separate toggles).
- **System Limits** section added with numeric fields: battery Ah, battery Wh, inverter max, PV max.
- `_show_limits` chip toggle added.
- `inverter_name` moved to General section as `ha-textfield` input.
- `charger_battery_capacity_wh` and other numeric fields migrated to explicit `ha-textfield` / `numberField` inputs.

### v5.x
- Sun arc introduced: sun SVG node tracks real elevation angle from `sun.sun`, stays pinned on the arc path.
- Animated S-curve flow paths replacing straight lines.
- Cross / T-shape layout established: sun arc at top → inverter centre → Battery left, Grid right, Home below.
- Static SVG rebuilt via `_buildStaticSVG()` on `setConfig`; dynamic updates isolated to `_updateDynamic()`.

### v4.x and earlier
- Initial card structure: basic SVG energy flow with GoodWe + JK BMS entity mapping.
- Visual editor scaffolded with `makeSection`, `picker`, `textField`, `switchRow` helpers.
- `ha-selector` entity pickers introduced.
- SOC colour logic, cell temp/voltage colour helpers defined.
- Endurance calculation introduced (hours remaining based on current draw / charge rate).

---

## File Structure

```
k-flow-card.js
│
├── class KFlowCardEditor   (visual editor — HTMLElement, shadow DOM)
│   ├── _render()           builds editor sections
│   ├── makeSection()       collapsible section with optional chip toggle
│   ├── picker()            ha-selector entity picker
│   ├── textField()         ha-textfield input
│   ├── numberField()       ha-textfield numeric input
│   ├── switchRow()         pill toggle (used for invert flags)
│   ├── labelRow()          text field + conditionally-enabled entity picker
│   └── pickerMaybeDisabled() picker with override veil overlay
│
└── class KFlowCard         (main card — HTMLElement, shadow DOM)
    ├── setConfig()         merges config with stub defaults, triggers static build
    ├── _buildStaticSVG()   renders full SVG + HTML stat panel (called once per config)
    ├── _updateDynamic()    updates all live values, colours, animations (called on every hass update)
    ├── _val()              safe numeric entity reader
    ├── _strVal()           safe string entity reader
    ├── _socColor()         SOC → hex colour
    ├── _cellTempColor()    temperature → hex colour
    ├── _cellVoltColor()    cell voltage → hex colour
    ├── _tempColor()        general temperature → hex colour
    ├── _remCapColor()      remaining capacity → hex colour
    └── _fmtTill()          hours → "Till HH:MM" or "in Xh Ym" string
```

---

## Notes

- Tested on Home Assistant OS (HAOS) with GoodWe ET/ES inverter integration and JK BMS Bluetooth integration.
- The card uses shadow DOM — custom CSS from themes does not penetrate the card. All colours are hardcoded or driven by entity values.
- Config keys prefixed with `_` (e.g. `_show_battery`) are editor-only boolean toggles — they control visibility but are stored in the card config YAML.
- When installed via HACS, the resource is registered automatically. When installed manually, register as `type: module`.

---

## Troubleshooting

### Card does not appear / shows "Custom element doesn't exist"

- Confirm the resource is registered: **Settings → Dashboards → Resources**. You should see `/hacsfiles/k-flow-card/k-flow-card.js` (HACS) or `/local/k-flow-card.js` (manual) with type `JavaScript Module`.
- Hard refresh the browser: `Ctrl + Shift + R` (Windows/Linux) or `Cmd + Shift + R` (Mac).
- If using the mobile app, clear app cache or force-close and reopen.
- If installed manually, confirm the file is at `/config/www/k-flow-card.js` — not inside a subfolder.

---

### Visual editor is blank or fails to load

- Open browser DevTools (`F12`) → Console tab. Look for any red errors referencing `k-flow-card`.
- Ensure no other version of `k-flow-card.js` is registered as a duplicate resource. Go to Resources and remove any stale entries.
- Try clearing the HA frontend cache: **Developer Tools → Template** → reload page.

---

### Entities show `--` or do not update

- Open **Developer Tools → States** and confirm the entity ID exists and has a valid numeric state (not `unavailable` or `unknown`).
- Entity IDs are case-sensitive. Check for typos in the editor.
- If using GoodWe integration, ensure the inverter is online and the integration is polling correctly.
- The card skips `unavailable` and `unknown` states by design — the tile will show `--` until the entity returns a valid value.

---

### Flow animations not showing

- The card requires `sun.sun` to be present for the sun arc. If it is missing, the sun node will not animate but the rest of the card will function normally.
- Flow path animations are driven by power values. A path will only animate when its corresponding power reading is above zero.
- If all flows are static, check that your inverter entities are returning live values and not stale/unavailable states.

---

### Battery section is missing

- The Primary Battery section requires `_show_battery: true`. In the visual editor, click the **+ Enable** chip next to **Primary Battery**.
- Secondary Battery, EV, Extra PV Strings, System Limits, and Labels sections each have their own **+ Enable** chip — they are hidden by default.

---

### Endurance tile shows `--` or incorrect time

- The endurance calculation requires `battery_full_ah` (capacity in Ah) and `battery_current` to be set and returning valid values.
- If the battery is neither charging nor discharging (current ≈ 0), the tile will show `--` as no meaningful estimate is possible.
- Ensure `battery_full_ah` in **System Limits** matches your actual battery capacity.

---

### Labels section entity pickers are greyed out

- The **Labels** section must be enabled first via the **+ Enable** chip in the section header.
- Once enabled, each entity picker unlocks **only after you change that row's label text** away from its default. This is by design — it prevents accidental entity overrides.
- To unlock the Cell Temp entity picker, for example, change the label text from `CELL TEMP MIN/MAX` to anything else.

---

### After update via HACS, card looks wrong or broken

1. Hard refresh the browser (`Ctrl + Shift + R`).
2. If the issue persists, go to **Settings → Dashboards → Resources**, delete the k-flow-card entry, then re-add it (HACS will re-register it on the next HA restart).
3. Restart Home Assistant and hard refresh again.

---

### Reporting a bug

When reporting an issue, include:
- Home Assistant version
- k-flow-card version (visible in browser DevTools console on load)
- Browser console errors (screenshot or copy-paste)
- Relevant section of your card YAML config (remove sensitive entity names if needed)

---

*Khan Automation · k-flow-card · Last updated: v1.1.1*
