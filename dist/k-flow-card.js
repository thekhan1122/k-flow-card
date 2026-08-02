// k-flow-card.js – Unified Edition v1.1.3
// Changes v1.1.0 (full audit pass):
//   FIX  – 8-digit hex #f39c4bff in svgPulseOrange → 6-digit #f5b06a.
//   FIX  – Grid idle color #3a3a3a (invisible on dark bg) → #8b949e.
//   FIX  – Duplicate label_total_pv_gen textField + total_pv_gen_entity picker removed from
//           solar_extras editor section (kept only in Labels section where they belong).
//   FIX  – Battery bolt opacity: always-true compound `battPwr > 10 && absPwr >= 10` → `battPwr > 10`.
//           Applied to both dual-battery bolts and single-battery bolt.
//   FIX  – flowBattIn/flowBattOut SVG dash animations were directionally swapped.
//           Charging (BattIn) must flow inverter→battery = right-to-left on path M59→205 = from=0 to=-24.
//           Discharging (BattOut) must flow battery→inverter = left-to-right = from=-24 to=0.
//   FIX  – Dual-battery totalRemAh: battery2 was always using battery1's fullAh.
//           Now uses battery2_full_ah (defaults to fullAh when not set).
//           Added battery2_full_ah field to editor Battery 2 section and stub config.
//   FIX  – _readNum() no longer accepts or uses a fallback value. Returns null when entity is
//           unavailable/unknown/missing. All 5 tile render blocks now show '--' instead of
//           silently falling back to the native battery sensor value.
//   FIX  – Remaining tile: shows ONLY Ah (integer, 3 chars) in Ah mode, ONLY kWh (2 dp) in kWh mode.
//           Previously both lines always showed regardless of configured unit.
//   FIX  – total_pv_gen tile: attributes now uses optional chain (?.); toFixed(2) for kWh values;
//           unavailable/unknown state now shows '--' not a stale number.
//   FIX  – Grid import/export display now prefixed with ▼/▲ direction arrows.
//   PROPOSAL – fullWh in Ah-mode still uses live voltage (_voltForCap). For endurance math this is
//           acceptable (endurance needs actual Wh at current voltage). Consider adding a nominal
//           voltage config field in a future version to fully decouple from live sensor.
//   - BUG: fullWh Ah-mode fallback was reading this.config.battery_voltage (an entity ID string)
//     instead of the live battVolt1 sensor value. Fixed to use _voltForCap = _n(this._val(...)).
//   - BUG: remColor used remCap1/(fullAh||1) which is always 0 in kWh mode → always red.
//     Fixed to use battSoc1 directly (0-100 %, works in both modes).
//   - BUG: _set() did not include label_entity_* keys in re-render trigger list, so the
//     state-preview badge in label rows never appeared after picking an entity. Fixed.
//   - WARNING: battery_full_wh numberField label was 'Battery Capacity (kWh)' AND unit arg
//     was 'kWh' → UI showed 'Battery Capacity (kWh)  (kWh)'. Fixed label to 'Battery Capacity'.
//   - WARNING: capGroupWrap had class='row' causing nested .row double-margin in editor. Removed.
//   - WARNING: General section defaulted to closed; important battery capacity fields hidden on
//     first open. General now defaults to open.
//   - WARNING: battery_full_wh and battery2_full_wh max raised from 500→9999 kWh.
//   - WARNING: toMin/toMin2 arrow param renamed from 's' (shadowed attrs) to 'ts'.
//   - WARNING: _fmtEndurance used h<=0 guard; a just-full battery (endHours=0) showed '--'.
//     Changed to h<0 so '0h 00m' shows correctly.
//   - STYLE: EV else-block indentation fixed for consistency.
// Changes v1.0.3:
//   - Editor restructured: General section now includes battery capacity (Ah/kWh radio toggle),
//     PV max power, and Inverter max power. System Limits section removed.
//   - Battery capacity: radio button selects Ah or kWh mode (battery_cap_unit).
//     default 0 for both fields; endurance math picks correct field based on unit selection.
//   - Labels section: entity pickers now show a state-text preview when an entity IS selected
//     (e.g. "charging", "on grid backup mode") so user knows what value the tile will show.
//   - Labels locking: ONLY rows where BOTH text AND entity are edited get locked in Battery section.
//     Rows where only label text changed (entity still empty) do NOT lock the Battery pickers.
//   - Sun alignment: nearestTime() now uses UTC-aware parsing; corrected the >18h flip logic.
//   - Moon: tMoon calculation made more robust (guards for SET > RISE wrap-around at midnight).
// Changes v1.0.2:
//   - Sun position: replaced azimuth-based t (wrong at non-equatorial locations) with
//     time-based t using today's actual rise/set, derived by correcting next_rising/
//     next_setting when they refer to tomorrow (>18 h away).
//   - Moon position: independent tMoon computed from elapsed night time — fixes the
//     broken (1-t) formula that was wrong when t was re-mapped for night azimuth.
//   - _val(): now accepts toWatts=true — auto-converts kW sensors to W. Applied to
//     all power entity reads (PV strings, pv_total, grid, load, battery, charger).
//   - _readNum(): guards unavailable/unknown state (was only checking !s).
//   - _fmtEndurance(): minutes now uses Math.floor to prevent showing 60m.
//   - gridImg glow: fixed filter condition to use Math.abs(gridActive) so grid export
//     also triggers the glow (was only triggering on import).
// Changes v1.0.1:
//   - Labels section: switchRow replaced by header chip (+ Enable / ✓ Enabled style).
//   - Per-row auto-enable: each entity picker unlocks only when its label text ≠ default.
//   - Corresponding Battery/Solar pickers lock per-row (not globally).
//   - _updateDynamic: clean _rowActive + _readNum/_readStr helpers.
//   - _set: re-renders on any of the 6 label text key changes.

// ═══════════════════════════════════════════════════════════════
// VISUAL EDITOR
// ═══════════════════════════════════════════════════════════════
class KFlowCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
    this._attached = false;
    this._rendered = false;
    this._ownChange = false;
  }

  connectedCallback() {
    this._attached = true;
    this._render();
  }

  setConfig(config) {
    this._config = { ...config };
    if (this._ownChange) return;
    if (this._attached) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered && this._attached) {
      this._render();
    } else {
      this.querySelectorAll('ha-selector').forEach(el => { el.hass = hass; });
    }
  }

  _fireChanged() {
    this._ownChange = true;
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: { ...this._config } },
      bubbles: true,
      composed: true,
    }));
    Promise.resolve().then(() => { this._ownChange = false; });
  }

  _set(key, value) {
    if (this._config[key] === value) return;
    this._config = { ...this._config, [key]: value };
    this._fireChanged();
    if (key === '_show_battery' || key === '_show_battery2' || key === '_show_pv_extra' ||
        key === '_show_ev'      || key === 'battery_cap_unit' || key === '_labels_custom_entities' ||
        key === 'label_cell_temp_minmax' || key === 'label_bms_temp'         ||
        key === 'label_min_cell'         || key === 'label_max_cell'         ||
        key === 'label_batt_dis'         || key === 'label_total_pv_gen'     ||
        key === 'label_entity_cell_temp' || key === 'label_entity_bms_temp'  ||
        key === 'label_entity_min_cell'  || key === 'label_entity_max_cell'  ||
        key === 'label_entity_batt_dis'  || key === 'total_pv_gen_entity')
      this._render();
  }

  _render() {
    if (!this._hass) return;
    if (!this._sectionOpen) this._sectionOpen = {};
    const cfg = this._config;
    const showBatt1 = !!(cfg._show_battery !== false);
    const showBatt2 = !!(cfg._show_battery2);
    const showPVExtra = !!(cfg._show_pv_extra);
    const showEV = !!(cfg._show_ev);
    const capUnit = cfg.battery_cap_unit || 'ah'; // 'ah' or 'kwh'

    const style = `
      <style>
        :host { display: block; font-family: var(--paper-font-body1_-_font-family, inherit); }
        .section {
          margin-bottom: 16px;
          border: 1px solid var(--divider-color, rgba(0,0,0,.12));
          border-radius: 10px;
          overflow: hidden;
        }
        .section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: var(--secondary-background-color, rgba(0,0,0,.04));
          font-size: .82rem;
          font-weight: 700;
          letter-spacing: .5px;
          text-transform: uppercase;
          color: var(--secondary-text-color);
          cursor: default;
        }
        .section-header.toggleable { cursor: pointer; user-select: none; }
        .section-header .toggle-chip {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: .72rem;
          font-weight: 600;
          letter-spacing: .3px;
          text-transform: none;
          padding: 2px 10px 2px 6px;
          border-radius: 20px;
          background: var(--card-background-color, #fff);
          border: 1px solid var(--divider-color, rgba(0,0,0,.15));
          color: var(--primary-text-color);
          transition: background .15s;
        }
        .section-header .toggle-chip.on {
          background: var(--primary-color, #03a9f4);
          border-color: var(--primary-color, #03a9f4);
          color: #fff;
        }
        .section-body { padding: 12px 14px 4px; }
        .row {
          display: block;
          margin-bottom: 6px;
        }
        .row-label {
          display: block;
          font-size: .78rem;
          font-weight: 500;
          color: var(--primary-text-color);
          margin-bottom: 3px;
          padding-left: 2px;
          line-height: 1.3;
        }
        .row-label small {
          display: inline;
          font-size: .68rem;
          color: var(--secondary-text-color);
          margin-left: 5px;
        }
        .row-input { display: block; width: 100%; }
        ha-selector, ha-textfield { width: 100%; display: block; }
        ha-textfield { --mdc-shape-small: 6px; }
        .divider { height: 1px; background: var(--divider-color, rgba(0,0,0,.08)); margin: 4px 0 14px; }
      </style>
    `;

    const shell = document.createElement('div');
    shell.innerHTML = style;

    const makeSection = (sectionId, icon, title, rows, opts = {}) => {
      if (this._sectionOpen[sectionId] === undefined) this._sectionOpen[sectionId] = (sectionId === 'general');
      const isOpen = this._sectionOpen[sectionId];
      const sec = document.createElement('div');
      sec.className = 'section';
      const hdr = document.createElement('div');
      hdr.className = 'section-header toggleable';
      // Chevron — styled as a small disclosure button
      const chevron = document.createElement('span');
      chevron.textContent = isOpen ? '▼' : '▶';
      chevron.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'width:20px',
        'height:20px',
        'min-width:20px',
        'border-radius:5px',
        'background:var(--secondary-background-color,rgba(255,255,255,.07))',
        'border:1px solid var(--divider-color,rgba(255,255,255,.15))',
        'font-size:.7rem',
        'line-height:1',
        `color:${isOpen ? 'var(--primary-color,#03a9f4)' : 'var(--secondary-text-color,#aaa)'}`,
        'flex-shrink:0',
        'transition:color .15s,background .15s',
        'cursor:pointer',
        'user-select:none',
      ].join(';');
      hdr.appendChild(chevron);
      const titleSpan = document.createElement('span');
      titleSpan.textContent = `${icon} ${title}`;
      hdr.appendChild(titleSpan);
      // Click anywhere on header (except toggle-chip) to collapse/expand
      hdr.addEventListener('click', () => {
        this._sectionOpen[sectionId] = !this._sectionOpen[sectionId];
        this._render();
      });
      if (opts.toggleKey) {
        const chip = document.createElement('span');
        chip.className = 'toggle-chip' + (opts.toggleOn ? ' on' : '');
        chip.innerHTML = opts.toggleOn ? `✓ Enabled` : `＋ Enable`;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          this._set(opts.toggleKey, !opts.toggleOn);
        });
        hdr.appendChild(chip);
      }
      sec.appendChild(hdr);
      // Body visible when section is open AND content not suppressed by toggle
      const bodyVisible = isOpen && !opts.hidden;
      if (bodyVisible) {
        const body = document.createElement('div');
        body.className = 'section-body';
        rows.forEach(r => body.appendChild(r));
        sec.appendChild(body);
      }
      return sec;
    };

    const picker = (key, label, optional = false) => {
      const wrap = document.createElement('div');
      wrap.className = 'row';
      wrap.style.marginBottom = '14px';
      const lbl = document.createElement('div');
      lbl.className = 'row-label';
      lbl.textContent = label;
      if (optional) {
        const sm = document.createElement('small');
        sm.textContent = 'optional';
        lbl.appendChild(sm);
      }
      const inputWrap = document.createElement('div');
      inputWrap.className = 'row-input';
      const sel = document.createElement('ha-selector');
      sel.hass = this._hass;
      sel.selector = { entity: {} };
      sel.value = cfg[key] || '';
      sel._configKey = key;
      sel.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        this._set(key, ev.detail.value || '');
      });
      inputWrap.appendChild(sel);
      wrap.appendChild(lbl);
      wrap.appendChild(inputWrap);
      return wrap;
    };

    // Text field — native input, commits on blur/Enter only.
    // ha-selector(text) fires value-changed per keystroke → triggers setConfig → _render → destroys field.
    const textField = (key, label, placeholder = '') => {
      const wrap = document.createElement('div');
      wrap.className = 'row';
      wrap.style.marginBottom = '14px';
      const fieldBox = document.createElement('div');
      fieldBox.style.cssText = `
        display:block; position:relative;
        border:1px solid var(--divider-color, rgba(0,0,0,.42));
        border-radius:4px;
        padding:6px 12px 6px;
        background:var(--input-fill-color, var(--secondary-background-color, rgba(0,0,0,.04)));
        box-sizing:border-box; width:100%;
        transition: border-color .15s;
      `;
      fieldBox.addEventListener('focusin',  () => { fieldBox.style.borderColor = 'var(--primary-color, #03a9f4)'; });
      fieldBox.addEventListener('focusout', () => { fieldBox.style.borderColor = 'var(--divider-color, rgba(0,0,0,.42))'; });
      const lbl = document.createElement('div');
      lbl.textContent = label;
      lbl.style.cssText = `font-size:.72rem; color:var(--secondary-text-color); margin-bottom:2px; line-height:1;`;
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = placeholder;
      input.value = cfg[key] !== undefined ? String(cfg[key]) : '';
      input.style.cssText = `
        display:block; width:100%; border:none; outline:none;
        background:transparent; color:var(--primary-text-color);
        font-size:.95rem; font-family:inherit; padding:0; box-sizing:border-box;
      `;
      // Commit ONLY on blur or Enter — prevents per-keystroke re-render
      const commit = (ev) => this._set(key, ev.target.value);
      input.addEventListener('change', commit);
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.target.blur(); });
      fieldBox.appendChild(lbl);
      fieldBox.appendChild(input);
      wrap.appendChild(fieldBox);
      return wrap;
    };

    // Number field — native input, commits on blur/Enter only (same reason as textField).
    const numberField = (key, label, min, max, step, unit = '') => {
      const wrap = document.createElement('div');
      wrap.className = 'row';
      wrap.style.marginBottom = '14px';
      const fieldBox = document.createElement('div');
      fieldBox.style.cssText = `
        display:block; position:relative;
        border:1px solid var(--divider-color, rgba(0,0,0,.42));
        border-radius:4px;
        padding:6px 12px 6px;
        background:var(--input-fill-color, var(--secondary-background-color, rgba(0,0,0,.04)));
        box-sizing:border-box; width:100%;
        transition: border-color .15s;
      `;
      fieldBox.addEventListener('focusin',  () => { fieldBox.style.borderColor = 'var(--primary-color, #03a9f4)'; });
      fieldBox.addEventListener('focusout', () => { fieldBox.style.borderColor = 'var(--divider-color, rgba(0,0,0,.42))'; });
      const lbl = document.createElement('div');
      lbl.textContent = unit ? `${label}  (${unit})` : label;
      lbl.style.cssText = `font-size:.72rem; color:var(--secondary-text-color); margin-bottom:2px; line-height:1;`;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(min); input.max = String(max); input.step = String(step);
      input.value = cfg[key] !== undefined && cfg[key] !== '' ? String(cfg[key]) : '';
      input.style.cssText = `
        display:block; width:100%; border:none; outline:none;
        background:transparent; color:var(--primary-text-color);
        font-size:.95rem; font-family:inherit; padding:0; box-sizing:border-box;
      `;
      // Commit ONLY on blur or Enter — prevents per-keystroke re-render
      const commit = (ev) => {
        let v = parseFloat(ev.target.value);
        if (isNaN(v)) return;
        // Hard-clamp to declared range — browser max attr is advisory only
        v = Math.min(max, Math.max(min, v));
        // Round to step precision to avoid float noise
        if (step >= 1) v = Math.round(v);
        ev.target.value = String(v); // reflect clamped value back into field
        this._set(key, v);
      };
      // oninput: truncate while typing so user can't exceed max digit count
      input.addEventListener('input', () => {
        const raw = input.value.replace(/[^0-9.]/g, '');
        const v = parseFloat(raw);
        if (!isNaN(v) && v > max) input.value = String(max);
      });
      input.addEventListener('change', commit);
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.target.blur(); });
      fieldBox.appendChild(lbl);
      fieldBox.appendChild(input);
      wrap.appendChild(fieldBox);
      return wrap;
    };


    // Native CSS pill toggle
    const switchRow = (key, labelText, hintText = '') => {
      const wrap = document.createElement('div');
      wrap.className = 'row';
      wrap.style.cssText = 'margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;';
      const left = document.createElement('div');
      left.style.flex = '1';
      const lbl = document.createElement('div');
      lbl.className = 'row-label';
      lbl.style.marginBottom = '2px';
      lbl.textContent = labelText;
      left.appendChild(lbl);
      if (hintText) {
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:.68rem;color:var(--secondary-text-color);line-height:1.4;';
        hint.textContent = hintText;
        left.appendChild(hint);
      }
      const pillLabel = document.createElement('label');
      pillLabel.style.cssText = 'position:relative;display:inline-block;width:40px;height:22px;flex-shrink:0;cursor:pointer;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!cfg[key];
      cb.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';
      const track = document.createElement('span');
      const knob  = document.createElement('span');
      const sync = () => {
        track.style.cssText = 'position:absolute;inset:0;border-radius:11px;transition:background .2s;background:' +
          (cb.checked ? 'var(--primary-color,#03a9f4)' : 'var(--divider-color,rgba(0,0,0,.25))') + ';';
        knob.style.cssText  = 'position:absolute;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;' +
          'box-shadow:0 1px 3px rgba(0,0,0,.35);transition:left .2s;left:' + (cb.checked ? '21px' : '3px') + ';';
      };
      sync();
      cb.addEventListener('change', () => { sync(); this._set(key, cb.checked); });
      pillLabel.appendChild(cb);
      pillLabel.appendChild(track);
      pillLabel.appendChild(knob);
      wrap.appendChild(left);
      wrap.appendChild(pillLabel);
      return wrap;
    };

    const divider = () => {
      const d = document.createElement('div');
      d.className = 'divider';
      return d;
    };

    // ═══ Build sections ═══

    // ── Battery capacity radio helper ──
    const battCapUnit = cfg.battery_cap_unit || 'ah';
    const battCapRadio = (() => {
      const outer = document.createElement('div');
      // Radio row
      const radioWrap = document.createElement('div');
      radioWrap.style.cssText = 'display:flex;gap:18px;margin-bottom:10px;';
      const rName = 'bcr_' + Math.random().toString(36).slice(2);
      ['ah', 'kwh'].forEach(unit => {
        const lbl = document.createElement('label');
        lbl.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:.82rem;cursor:pointer;color:var(--primary-text-color);';
        const rb = document.createElement('input');
        rb.type = 'radio'; rb.name = rName; rb.value = unit; rb.checked = battCapUnit === unit;
        rb.style.accentColor = 'var(--primary-color,#03a9f4)';
        rb.addEventListener('change', () => { if (rb.checked) this._set('battery_cap_unit', unit); });
        lbl.appendChild(rb);
        lbl.appendChild(document.createTextNode(unit === 'ah' ? 'Ah (Amp-hours)' : 'kWh'));
        radioWrap.appendChild(lbl);
      });
      outer.appendChild(radioWrap);
      // Show the relevant field
      if (battCapUnit === 'ah') {
        outer.appendChild(numberField('battery_full_ah', 'Battery Capacity', 0, 999, 1, 'Ah'));
      } else {
        outer.appendChild(numberField('battery_full_wh', 'Battery Capacity', 0, 999.99, 0.01, 'kWh'));
      }
      return outer;
    })();

    // Capacity group wrapper — plain div, not .row, to avoid nested margin-bottom doubling
    const capGroupWrap = document.createElement('div');
    capGroupWrap.style.marginBottom = '14px';
    const capGroupLbl = document.createElement('div');
    capGroupLbl.className = 'row-label';
    capGroupLbl.textContent = 'Battery Capacity';
    capGroupWrap.appendChild(capGroupLbl);
    capGroupWrap.appendChild(battCapRadio);

    shell.appendChild(makeSection('general', '⚙️', 'General', [
      textField('inverter_name', 'Inverter Name', 'e.g. My Inverter'),
      divider(),
      capGroupWrap,
      divider(),
      numberField('pv_max_power',       'PV Array Max Power',    0, 30000, 100, 'W'),
      numberField('inverter_max_power', 'Inverter Max Power',    0, 20000, 100, 'W'),
    ]));

    // ── Labels: global gate + per-row activation ──
    // Gate: section chip toggles _labels_custom_entities (body hidden when off).
    // Per-row: entity picker activates only when that row's label text differs from its default.
    const labelsEnabled = !!(cfg._labels_custom_entities);

    // Helper: entity picker that can be visually disabled
    const pickerMaybeDisabled = (key, label, disabled = false, optional = false) => {
      const wrap = picker(key, label, optional);
      if (disabled) {
        wrap.style.position = 'relative';
        const veil = document.createElement('div');
        veil.style.cssText = [
          'position:absolute', 'inset:0', 'border-radius:6px',
          'background:var(--secondary-background-color,rgba(0,0,0,.06))',
          'opacity:.55', 'pointer-events:all', 'cursor:not-allowed',
          'z-index:10',
        ].join(';');
        const note = document.createElement('div');
        note.style.cssText = [
          'position:absolute', 'inset:0', 'display:flex', 'align-items:center',
          'justify-content:center', 'font-size:.68rem', 'font-weight:600',
          'color:var(--secondary-text-color)', 'letter-spacing:.3px',
          'pointer-events:none', 'z-index:11',
        ].join(';');
        note.textContent = '⛔ Overridden by Labels section';
        wrap.appendChild(veil);
        wrap.appendChild(note);
      }
      return wrap;
    };

    // Per-row active (lock): true when global gate ON AND label text ≠ default AND entity is selected
    // Only lock Battery pickers if user has BOTH renamed the label AND picked a custom entity.
    const _labelChanged = (key, def) => labelsEnabled && (cfg[key] || def) !== def;
    const _labelLocked  = (textKey, def, entityKey) => _labelChanged(textKey, def) && !!(cfg[entityKey]);
    const cellTempActive   = _labelChanged('label_cell_temp_minmax', 'CELL TEMP MIN/MAX');
    const bmsTempActive    = _labelChanged('label_bms_temp',         'BMS TEMP');
    const minCellActive    = _labelChanged('label_min_cell',         'Min Cell');
    const maxCellActive    = _labelChanged('label_max_cell',         'Max Cell');
    const battDisActive    = _labelChanged('label_batt_dis',         'Batt Dis.');
    const totalPvGenActive = _labelChanged('label_total_pv_gen',     'TOTAL PV GEN.');
    // Lock flags for Battery section pickers (stricter — requires entity also set)
    const cellTempLocked   = _labelLocked('label_cell_temp_minmax', 'CELL TEMP MIN/MAX', 'label_entity_cell_temp');
    const bmsTempLocked    = _labelLocked('label_bms_temp',         'BMS TEMP',          'label_entity_bms_temp');
    const minCellLocked    = _labelLocked('label_min_cell',         'Min Cell',          'label_entity_min_cell');
    const maxCellLocked    = _labelLocked('label_max_cell',         'Max Cell',          'label_entity_max_cell');
    const battDisLocked    = _labelLocked('label_batt_dis',         'Batt Dis.',         'label_entity_batt_dis');

    // Label rows — text field + entity picker with live state preview
    const labelRow = (textKey, textLabel, textPlaceholder, entityKey, active = false) => {
      const frag = document.createDocumentFragment();
      frag.appendChild(textField(textKey, textLabel, textPlaceholder));
      const entityRow = document.createElement('div');
      entityRow.style.cssText = 'margin-top:-6px;margin-bottom:14px;';
      const entityLabel = document.createElement('div');
      entityLabel.style.cssText = 'font-size:.72rem;color:var(--secondary-text-color);padding:0 2px 3px;line-height:1;display:flex;align-items:center;gap:6px;';
      entityLabel.textContent = active ? 'Entity (overrides default)' : 'Entity — change label to unlock';
      // State preview badge — shows current entity state text (e.g. "charging", "on grid backup mode")
      const currentEntityId = cfg[entityKey];
      if (active && currentEntityId && this._hass && this._hass.states[currentEntityId]) {
        const stateVal = this._hass.states[currentEntityId].state;
        const badge = document.createElement('span');
        badge.textContent = stateVal;
        badge.style.cssText = [
          'font-size:.65rem', 'font-weight:700', 'letter-spacing:.3px',
          'padding:1px 7px', 'border-radius:20px',
          'background:var(--primary-color,#03a9f4)', 'color:#fff',
          'text-transform:capitalize', 'flex-shrink:0',
        ].join(';');
        entityLabel.appendChild(badge);
      }
      const sel = document.createElement('ha-selector');
      sel.hass = this._hass;
      sel.selector = { entity: {} };
      sel.value = cfg[entityKey] || '';
      sel._configKey = entityKey;
      sel.style.cssText = 'width:100%;display:block;';
      if (!active) {
        sel.style.opacity = '0.4';
        sel.style.pointerEvents = 'none';
        sel.title = 'Change the label text above to unlock this entity picker';
      }
      sel.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        this._set(entityKey, ev.detail.value || '');
      });
      entityRow.appendChild(entityLabel);
      entityRow.appendChild(sel);
      const wrapper = document.createElement('div');
      wrapper.appendChild(frag);
      wrapper.appendChild(entityRow);
      return wrapper;
    };

    // Info banner
    const labelInfoBanner = (() => {
      const info = document.createElement('div');
      info.style.cssText = 'font-size:.72rem;line-height:1.5;color:var(--secondary-text-color);background:var(--secondary-background-color,rgba(0,0,0,.04));border:1px solid var(--divider-color,rgba(0,0,0,.10));border-radius:7px;padding:7px 10px;margin-bottom:10px;';
      info.innerHTML = '&#x1F4A1; <strong>Tip:</strong> Rename a tile label to unlock its entity override. The matching sensor in the Battery section will lock automatically to prevent duplication.';
      return info;
    })();

    shell.appendChild(makeSection('labels', '🏷️', 'Labels', [
      labelInfoBanner,
      labelRow('label_cell_temp_minmax', 'Cell Temp Min/Max label', 'CELL TEMP MIN/MAX', 'label_entity_cell_temp', cellTempActive),
      labelRow('label_bms_temp',         'BMS Temp label',          'BMS TEMP',          'label_entity_bms_temp',  bmsTempActive),
      labelRow('label_min_cell',         'Min Cell label',          'Min Cell',          'label_entity_min_cell',  minCellActive),
      labelRow('label_max_cell',         'Max Cell label',          'Max Cell',          'label_entity_max_cell',  maxCellActive),
      labelRow('label_batt_dis',         'Batt Dis label',          'Batt Dis.',         'label_entity_batt_dis',  battDisActive),
      labelRow('label_total_pv_gen',     'Total PV Gen label',      'TOTAL PV GEN.',     'total_pv_gen_entity',    totalPvGenActive),
    ], { toggleKey: '_labels_custom_entities', toggleOn: labelsEnabled, hidden: !labelsEnabled }));

    shell.appendChild(makeSection('solar', '☀️', 'Solar', [
      picker('pv1_power', 'PV1 Power'),
      picker('pv2_power', 'PV2 Power'),
    ]));

    shell.appendChild(makeSection('solar_extra', '☀️', 'Extra PV Strings', [
      picker('pv3_power', 'PV3 Power', true),
      picker('pv4_power', 'PV4 Power', true),
    ], { toggleKey: '_show_pv_extra', toggleOn: showPVExtra, hidden: !showPVExtra }));

    shell.appendChild(makeSection('solar_extras', '☀️', 'Solar Extras', [
      picker('pv_total_power',  'Total PV Power',  true),
      divider(),
      picker('inv_temp',        'Inverter Temp'),
      picker('today_pv',        'Today PV Gen'),
      picker('today_batt_chg',  'Today Batt Charge'),
      picker('today_load',      'Today Load'),
      picker('consump',         'House Consumption'),
    ]));

    shell.appendChild(makeSection('grid', '🔌', 'Grid', [
      switchRow('invert_grid_power', '🔄 Invert grid power sign', 'Enable if positive = exporting (e.g. GoodWe active_power)'),
      divider(),
      picker('grid_active_power',  'Grid Active Power'),
      picker('grid_import_energy', 'Grid Import Energy'),
      picker('grid_export_energy', 'Grid Export Energy', true),
      picker('grid_power_alt',     'Alt Grid Sensor',    true),
    ]));

    shell.appendChild(makeSection('battery1', '🔋', 'Primary Battery', [
      switchRow('invert_battery_power', '🔄 Invert battery power sign', 'Enable if positive = discharging'),
      divider(),
      picker('battery_soc',      'Battery SOC'),
      picker('battery_power',    'Battery Power'),
      picker('battery_current',  'Battery Current'),
      picker('battery_voltage',  'Battery Voltage'),
      pickerMaybeDisabled('battery_temp1',    'Temp 1',           cellTempLocked),
      pickerMaybeDisabled('battery_temp2',    'Temp 2',           cellTempLocked),
      pickerMaybeDisabled('battery_mos',      'BMS Temp',         bmsTempLocked),
      pickerMaybeDisabled('battery_min_cell', 'Min Cell Voltage', minCellLocked),
      pickerMaybeDisabled('battery_max_cell', 'Max Cell Voltage', maxCellLocked),
      pickerMaybeDisabled('batt_dis',         'Discharge Today',  battDisLocked),
      divider(),
      picker('goodwe_battery_soc',  'Fallback SOC',     true),
      picker('goodwe_battery_curr', 'Fallback Current', true),
    ], { toggleKey: '_show_battery', toggleOn: showBatt1, hidden: !showBatt1 }));

    shell.appendChild(makeSection('battery2', '🔋', 'Secondary Battery', [
      switchRow('invert_battery_power', '🔄 Invert battery power sign', 'Shared with Primary'),
      divider(),
      picker('battery2_soc',      'SOC'),
      picker('battery2_power',    'Power'),
      picker('battery2_current',  'Current'),
      picker('battery2_voltage', 'Voltage'),
      pickerMaybeDisabled('battery2_mos',     'BMS Temp', bmsTempLocked),
      divider(),
      numberField('battery2_full_ah', 'Battery 2 Capacity (if different from Batt 1)', 0, 999, 1, 'Ah'),
      numberField('battery2_full_wh', 'Battery 2 Capacity (if different from Batt 1)', 0, 999.99, 0.01, 'kWh'),
    ], { toggleKey: '_show_battery2', toggleOn: showBatt2, hidden: !showBatt2 }));

    shell.appendChild(makeSection('ev', '🚗', 'EV / Car Charger', [
      picker('charger_state',           'Charger State'),
      picker('charger_power',           'Charger Power'),
      picker('charger_current',         'Charger Current'),
      picker('charger_soc',             'Car Battery SOC'),
      picker('charger_eta',             'Charge ETA (min)', true),
      numberField('charger_battery_capacity_wh', 'EV Battery Capacity', 0, 200000, 1, 'Wh'),
    ], { toggleKey: '_show_ev', toggleOn: showEV, hidden: !showEV }));

    this.innerHTML = '';
    this.appendChild(shell);
    this._rendered = true; // Fix #2: mark rendered so hass setter stops triggering full DOM rebuilds
  }
}
customElements.define('k-flow-card-editor', KFlowCardEditor);

// ═══════════════════════════════════════════════════════════════
// MAIN CARD
// ═══════════════════════════════════════════════════════════════
class KFlowCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this.config = {};
    this._prevPvTotal = -1;
    this._prevSunPos = { bx: -1, by: -1 };
    this._prevPvBlocksTotal = -1; // Fix #11: guard for pvBlocks rebuild
    this.attachShadow({ mode: 'open' });
  }

  static getStubConfig() {
    return {
      pv1_power: 'sensor.goodwe_pv1_power',
      pv2_power: 'sensor.goodwe_pv2_power',
      pv3_power: '',
      pv4_power: '',
      pv_total_power: 'sensor.goodwe_pv_power',
      grid_active_power: 'sensor.goodwe_active_power',
      grid_import_energy: 'sensor.goodwe_today_energy_import',
      grid_export_energy: '',
      consump: 'sensor.goodwe_house_consumption',
      today_pv: 'sensor.goodwe_today_s_pv_generation',
      today_batt_chg: 'sensor.goodwe_today_battery_charge',
      today_load: 'sensor.goodwe_today_load',
      battery_soc: 'sensor.jk_soc',
      battery_power: 'sensor.jk_power',
      battery_current: 'sensor.jk_current',
      battery_voltage: 'sensor.jk_voltage',
      battery_temp1: 'sensor.jk_temp1',
      battery_temp2: 'sensor.jk_temp2',
      battery_mos: 'sensor.jk_mos',
      battery_min_cell: 'sensor.jk_cellmin',
      battery_max_cell: 'sensor.jk_cellmax',
      goodwe_battery_soc: 'sensor.goodwe_battery_state_of_charge',
      goodwe_battery_curr: 'sensor.goodwe_battery_current',
      inv_temp: 'sensor.goodwe_inverter_temperature_module',
      batt_dis: 'sensor.goodwe_today_battery_discharge',
      battery2_soc: '',
      battery2_power: '',
      battery2_current: '',
      battery2_voltage: '',
      battery2_mos: '',
      battery_full_ah: 0,
      battery_full_wh: 0,
      battery_cap_unit: 'ah',
      battery2_full_ah: 0,
      battery2_full_wh: 0,
      inverter_max_power: 6000,
      pv_max_power: 7500,
      charger_state: '',
      charger_current: '',
      charger_power: '',
      charger_soc: '',
      charger_eta: '',
      charger_battery_capacity_wh: '',
      sun: 'sun.sun',
      inverter_name: '',
      label_cell_temp_minmax: 'CELL TEMP MIN/MAX',
      label_bms_temp: 'BMS TEMP',
      label_endurance: 'ENDURANCE',
      label_min_cell: 'Min Cell',
      label_max_cell: 'Max Cell',
      label_batt_dis: 'Batt Dis.',
      total_pv_gen_entity: 'sensor.goodwe_total_pv_generation',
      label_total_pv_gen: 'TOTAL PV GEN.',
      label_entity_cell_temp: '',
      label_entity_bms_temp: '',
      label_entity_min_cell: '',
      label_entity_max_cell: '',
      label_entity_batt_dis: '',
      _labels_custom_entities: false,
      grid_power_alt: 'sensor.grid_phase_a_power',
      _show_battery: true,
      _show_battery2: false,
      invert_battery_power: false,
      invert_grid_power: false,
      _show_pv_extra: false,   // combined toggle
      _show_ev: false,
    };
  }

  getCardSize() { return 8; }
  static getConfigElement() { return document.createElement('k-flow-card-editor'); }

  setConfig(config) {
    this.config = { ...KFlowCard.getStubConfig(), ...config };
    this._buildStaticSVG();
  }

  set hass(hass) { this._hass = hass; this._updateDynamic(); }

  _val(eid, toWatts = false) {
    if (!eid) return null;
    const s = this._hass?.states?.[eid];
    if (!s || s.state === 'unavailable' || s.state === 'unknown') return null;
    const v = parseFloat(s.state);
    if (isNaN(v)) return null;
    if (toWatts) {
      const unit = (s.attributes?.unit_of_measurement || '').trim();
      if (unit === 'kW' || unit === 'kilowatt') return v * 1000;
    }
    return v;
  }

  _strVal(eid) {
    if (!eid) return '';
    const s = this._hass?.states?.[eid];
    const value = s ? String(s.state).toLowerCase() : '';
    return value === 'unavailable' || value === 'unknown' ? '' : value;
  }

  _socColor(p) { return p<=25?'#f85149':p<=50?'#f39c4b':p<=75?'#58a6ff':'#4CAF50'; }
  _cellTempColor(t) { return t<=15?'#58a6ff':t<=35?'#3fb950':t<=45?'#f0883e':'#f85149'; }
  _cellVoltColor(v) { if(v<=0.001)return'#8b949e'; if(v<3.0)return'#f85149'; if(v<3.1)return'#f39c4b'; if(v<3.4)return'#f4d03f'; if(v<=3.65)return'#3fb950'; return'#f85149'; }
  _tempColor(t) { return t<=25?'#3fb950':t<=45?'#f0883e':'#f85149'; }
  _remCapColor(p) { return p<=15?'#e34d4c':p<=30?'#f39c4b':p<=55?'#f4d03f':'#2ecc71'; }
  _fmtTime(h) { if(!isFinite(h)||h<=0) return'--';const hh=Math.floor(h),mm=Math.round((h-hh)*60);return hh+'h '+(mm<10?'0':'')+mm+'m'; }
  _fmtEndurance(h) {
    if (!isFinite(h) || h < 0) return '--';
    const days = Math.floor(h / 24), hrs = Math.floor(h % 24), mins = Math.floor((h - Math.floor(h)) * 60);
    if (days > 0) return days + 'd ' + hrs + 'h';
    return hrs + 'h ' + (mins < 10 ? '0' : '') + mins + 'm';
  }
  _fmtTill(h) {
    // Fix #15: h > 0 guard was too strict — h approaching 0 from positive side
    // (battery at 0%, tiny charge power) returned 'Till --' despite a valid ETA.
    // Use h < 0 to reject only truly invalid/negative values.
    if (!isFinite(h) || h < 0) return 'Till --';
    const target = new Date(Date.now() + h * 3600000);
    const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][target.getDay()];
    let hr = target.getHours(); const ampm = hr >= 12 ? 'PM' : 'AM';
    hr = hr % 12 || 12;
    return 'Till ' + day + ' ' + hr + ':' + target.getMinutes().toString().padStart(2,'0') + ' ' + ampm;
  }

  _sunData() {
    const attrs = this._hass?.states[this.config.sun || 'sun.sun']?.attributes;
    // Sun position uses time-based t derived from today's ACTUAL rise/set times.
    // next_rising/next_setting flip to tomorrow after sunrise — we correct for this
    // by subtracting one day when the event is more than 18 h in the future.
    // elevation is used only for night detection and bell (arc height) — it is a
    // live real-time value and is never affected by the tomorrow-flip problem.
    let rise = '06:00', set = '18:00';
    let t = 0.5;
    let night = false;
    let bell = 0.5;

    // Return the nearest occurrence (today's) of an HA future-only ISO timestamp.
    // HA next_rising/next_setting are always in the future; after the event passes today
    // they flip to tomorrow. We detect this by checking if the event is > 18 h away —
    // if so, we step back one calendar day in LOCAL time (not UTC) to recover today's time.
    const nearestTime = iso => {
      if (!iso) return null;
      try {
        const future = new Date(iso);
        if ((future - Date.now()) > 18 * 3600000) {
          // Step back one day while preserving the exact local clock time
          future.setDate(future.getDate() - 1);
        }
        // Return local HH:MM (correct for user's timezone)
        return String(future.getHours()).padStart(2, '0') + ':' + String(future.getMinutes()).padStart(2, '0');
      } catch (e) { return null; }
    };

    if (attrs) {
      // Get today's actual rise / set for display labels AND position math
      rise = nearestTime(attrs.next_rising)  || rise;
      set  = nearestTime(attrs.next_setting) || set;

      const toMin = ts => { const p = ts.split(':').map(Number); return p[0] * 60 + p[1]; };
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const RISE = toMin(rise), SET = toMin(set);
      const dayLen = SET - RISE;

      // t: 0 = sunrise, 1 = sunset, clamped to [0,1]
      t = dayLen > 0 ? Math.max(0, Math.min(1, (nowMin - RISE) / dayLen)) : 0.5;

      // Night detection: prefer live elevation when available
      if (attrs.elevation != null) {
        night = parseFloat(attrs.elevation) < 0;
        // bell: how high the sun is (0 at horizon, 1 at max elevation)
        bell = Math.max(0, Math.sin(Math.max(0, parseFloat(attrs.elevation)) * Math.PI / 180));
      } else {
        night = nowMin < RISE || nowMin > SET;
        bell  = 1 - Math.pow(Math.abs(2 * t - 1), 1.5);
      }
    }

    // Sun position on the quadratic Bézier arc: left(35,78) → top(260,-45) → right(485,78)
    const bx = Math.round((1 - t) * (1 - t) * 35  + 2 * (1 - t) * t * 260 + t * t * 485);
    const by = Math.round((1 - t) * (1 - t) * 78  + 2 * (1 - t) * t * (-45) + t * t * 78);

    // Moon position: travels its own arc from right to left during night hours.
    // Uses an independent tMoon computed from elapsed night time — NOT (1-t),
    // which was wrong because t itself is re-mapped during night.
    let mx = 260, my = 72;
    if (night) {
      const toMin2 = ts => { const p = ts.split(':').map(Number); return p[0] * 60 + p[1]; };
      const RISE2 = toMin2(rise), SET2 = toMin2(set);
      const nowMin2 = new Date().getHours() * 60 + new Date().getMinutes();
      // Night length = 1440 - day length; guard against SET2 > RISE2 edge case
      const dayLen2 = SET2 > RISE2 ? SET2 - RISE2 : 0;
      const nightLen = Math.max(1, 1440 - dayLen2);
      // tMoon: 0 = just after sunset, 1 = just before sunrise
      // After midnight nowMin2 < SET2, so add 1440 to handle the wrap
      let tMoon = nowMin2 >= SET2
        ? (nowMin2 - SET2) / nightLen
        : (nowMin2 + 1440 - SET2) / nightLen;
      tMoon = Math.max(0, Math.min(1, tMoon));
      // Moon arc: right(485,78) → mid(260,158) → left(35,78) — dips below the horizon line
      mx = Math.round((1 - tMoon) * (1 - tMoon) * 485 + 2 * (1 - tMoon) * tMoon * 260 + tMoon * tMoon * 35);
      my = Math.round((1 - tMoon) * (1 - tMoon) * 78  + 2 * (1 - tMoon) * tMoon * 158  + tMoon * tMoon * 78);
    }
    return { rise, set, night, bell, bx, by, mx, my, t };
  }

  _battFill(soc){
    const ft=145,fb=263,fh=118;const fH=Math.round((soc||0)/100*fh),fY=fb-fH;let c,f,tc;
    if(soc<=20){c='#ff2200';f='url(#battGlowRed)';tc='#000';}else if(soc<=40){c='#f4d03f';f='url(#battGlowOrange)';tc='#000';}else if(soc<=75){c='#44ff00';f='url(#battGlowGreen)';tc='#fff';}else{c='#00d4ff';f='url(#battGlowCyan)';tc='#fff';}
    return{y:fY,height:fH,color:c,filter:fH>4?f:'none',textColor:tc};
  }

  _flowLevel(w,type){
    if(type==='solar'){if(w<200)return{dur:4,size:1.8,count:6};if(w<600)return{dur:3.2,size:2.2,count:12};if(w<1200)return{dur:2.7,size:2.5,count:20};if(w<2500)return{dur:2.4,size:2.8,count:30};if(w<4000)return{dur:1.8,size:3.2,count:42};if(w<6000)return{dur:1.2,size:3.5,count:55};return{dur:.9,size:3.8,count:65};}
    if(w<150)return{dur:4,size:1.8,count:4};if(w<500)return{dur:3.2,size:2.2,count:8};if(w<1000)return{dur:2.7,size:2.5,count:14};if(w<2000)return{dur:2.4,size:2.8,count:22};if(w<3000)return{dur:1.8,size:3.2,count:30};if(w<4500)return{dur:1.5,size:3.5,count:40};return{dur:.9,size:3.8,count:50};
  }

  _buildPvWaveHTML(bx,by,pvT){
    if(pvT<=10)return'';const fl=this._flowLevel(pvT,'solar');const sY=by+7;const pD='M '+bx.toFixed(1)+','+sY.toFixed(1)+' C '+bx.toFixed(1)+',85 260,5 260,155';const col='rgba(255,232,60,.95)',gc='rgba(255,190,20,.55)';const dD=(fl.dur*.8).toFixed(2),dL=(8+fl.size*1.5).toFixed(1),gL=(6+fl.size*1.2).toFixed(1),dT=(parseFloat(dL)+parseFloat(gL)).toFixed(1);let h='';h+='<path d="'+pD+'" fill="none" stroke="'+gc+'" stroke-width="6" stroke-dasharray="'+dL+' '+gL+'" stroke-linecap="round" opacity="0.25" filter="url(#arcSunF2)"><animate attributeName="stroke-dashoffset" from="'+dT+'" to="0" dur="'+dD+'s" repeatCount="indefinite" calcMode="linear"/></path>';h+='<path d="'+pD+'" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.8" stroke-dasharray="'+dL+' '+gL+'" stroke-linecap="round"><animate attributeName="stroke-dashoffset" from="'+dT+'" to="0" dur="'+dD+'s" repeatCount="indefinite" calcMode="linear"/></path>';h+='<path d="'+pD+'" fill="none" stroke="'+col+'" stroke-width="1.0" stroke-dasharray="'+dL+' '+gL+'" stroke-linecap="round" opacity="0.85"><animate attributeName="stroke-dashoffset" from="'+dT+'" to="0" dur="'+dD+'s" repeatCount="indefinite" calcMode="linear"/></path>';const wD=[{amp:6,dur:fl.dur*.9,ox:0,op:.9,sc:'rgba(255,255,255,0.92)',dLen:'3.0',dGap:'40.0'},{amp:10,dur:fl.dur*1.1,ox:3,op:.6,sc:col,dLen:'4.5',dGap:'50.0'}];const wc=Math.min(2,Math.max(1,Math.round(fl.count/5)));for(let wi=0;wi<wc;wi++){const w=wD[wi];const sC=Math.round(fl.count*.5),sD=w.dur.toFixed(2),sCy=(parseFloat(w.dLen)+parseFloat(w.dGap)).toFixed(1);for(let si=0;si<sC;si++){const fr=si/sC,ph=fr*Math.PI*2,sY2=(w.amp*Math.sin(ph+wi*1.1)).toFixed(1),sX=(w.ox+w.amp*.3*Math.cos(ph*.5)).toFixed(1),sDe=(fr*w.dur%w.dur).toFixed(3),sO=(w.op*(.5+.5*Math.abs(Math.sin(ph)))*.6).toFixed(2);h+='<g transform="translate('+sX+','+sY2+')"><path d="'+pD+'" fill="none" stroke="'+w.sc+'" stroke-width="1.2" stroke-dasharray="'+w.dLen+' '+w.dGap+'" stroke-linecap="round" opacity="'+sO+'"><animate attributeName="stroke-dashoffset" from="'+sCy+'" to="0" dur="'+sD+'s" begin="-'+sDe+'s" repeatCount="indefinite" calcMode="linear"/></path></g>';}}return h;
  }

  _buildStaticSVG() {
    const dual = !!(this.config._show_battery2);
    const showBatt1 = !!(this.config._show_battery !== false);
    const ev   = !!(this.config._show_ev);
    const showPvExtra = !!(this.config._show_pv_extra);
    const iconPath = '/local/community/k-flow-card';    // icons served from HACS community folder

    const pv3txt = showPvExtra ? `<text id="pv3label" x="8" y="424" font-size="9" fill="#8b949e" letter-spacing="1">PV3</text><text id="pv3FlowVal" x="8" y="438" font-size="12" font-weight="700" fill="#ffe83c">-- W</text>` : '';
    const pv4txt = showPvExtra ? `<text id="pv4label" x="8" y="456" font-size="9" fill="#8b949e" letter-spacing="1">PV4</text><text id="pv4FlowVal" x="8" y="470" font-size="12" font-weight="700" fill="#ffe83c">-- W</text>` : '';

    // EV placement inline with home and grid
    const evX = 462 - 39.5;   // centre of grid icon
    const evY = 397 - 39.5;   // centre of home icon
    const evtxt = ev ? `<g id="evGroup">
      <path id="flowHomeEV" d="M 317,397 H ${evX}" fill="none" stroke="#2b59ff" stroke-width="3" stroke-linecap="round" stroke-dasharray="8 6" opacity="0">
        <animate attributeName="stroke-dashoffset" from="-14" to="0" dur="0.8s" repeatCount="indefinite"/>
      </path>
      <image id="evIconImg" href="${iconPath}/ev-charger-icon.png" x="${evX}" y="${evY}" width="79" height="79" preserveAspectRatio="xMidYMid meet"/>
      <text id="evPowerVal" x="${evX+39.5}" y="${evY+98}" text-anchor="middle" font-size="10" font-weight="600" fill="#29c4f6">-- W</text>
      <text id="evCurrentVal" x="${evX+39.5}" y="${evY+110}" text-anchor="middle" font-size="9" fill="#cde">-- A</text>
      <text id="evSocVal" x="${evX+39.5}" y="${evY+122}" text-anchor="middle" font-size="9" fill="#fff">-- %</text>
      <text id="evEtaVal" x="${evX+39.5}" y="${evY+134}" text-anchor="middle" font-size="10" font-weight="600" fill="#4ade80">--</text>
    </g>` : '';

    // Battery current/power placed OUTSIDE the transformed group, above/below the flow bar (center y=175)
    const battTextSingle = `
      <text id="battPwrFlow" x="75" y="165" font-size="10" font-weight="600" fill="#cde">-- W</text>
      <text id="battCurrFlow" x="75" y="196" font-size="10" font-weight="600" fill="#fff">-- A</text>
    `;
    const battTextDual = `
      <text id="battPwrFlow1" x="75" y="158" font-size="10" font-weight="600" fill="#cde">-- W</text>
      <text id="battPwrFlow2" x="75" y="171" font-size="10" font-weight="600" fill="#cde">-- W</text>
      <text id="battCurrFlow1" x="75" y="196" font-size="10" font-weight="600" fill="#fff">-- A</text>
      <text id="battCurrFlow2" x="75" y="209" font-size="10" font-weight="600" fill="#fff">-- A</text>
    `;

    const batteryTip = `<rect x="75" y="126" width="18" height="4" rx="2" fill="url(#battCapGrad)"/>`;

    // Battery visibility helpers – mirror EV charger pattern
    const battGhostPath = showBatt1
      ? `<path d="M 59,175 H 132 V 205 H 205" fill="none" stroke="#1e3a5f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.18"/>`
      : '';
    const battFlowPaths = showBatt1 ? `
      <path id="flowBattIn"  d="M 59,175 H 132 V 205 H 205" fill="none" stroke="#8b949e" stroke-width="3" stroke-linecap="round" stroke-dasharray="14 10" opacity="0" style="display:none"><animate attributeName="stroke-dashoffset" from="-24" to="0"   dur="4.0s" repeatCount="indefinite"/></path>
      <path id="flowBattOut" d="M 59,175 H 132 V 205 H 205" fill="none" stroke="#8b949e" stroke-width="3" stroke-linecap="round" stroke-dasharray="14 10" opacity="0" style="display:none"><animate attributeName="stroke-dashoffset" from="0"   to="-24" dur="4.0s" repeatCount="indefinite"/></path>` : '';
    const battIconSection = !showBatt1 ? '' : (
      `<g transform="translate(-36.6, 25.4) scale(0.8)">
        <g id="battIconWrap">
          <rect x="49" y="135" width="70" height="132" rx="10" fill="url(#battShellGrad)"/>
          ${batteryTip}
          <rect x="51" y="258" width="66" height="9" rx="4" fill="url(#battCapGrad)"/>
          <rect x="51" y="137" width="66" height="7" rx="4" fill="url(#battCapGrad)"/>
          <rect x="49" y="135" width="70" height="132" rx="10" fill="url(#battGlassBody)" style="pointer-events:none"/>
          <rect x="53" y="145" width="62" height="118" rx="8" fill="#0f1214"/>` +
      (dual ? `
            <rect id="battFillBar1" x="53" y="263" width="30" height="0" rx="0" fill="#3fb950" clip-path="url(#battBodyClipLeft)"/>
            <rect id="battFillHL1" x="53" y="263" width="30" height="0" rx="0" fill="url(#battFillHighlight)" clip-path="url(#battBodyClipLeft)" style="pointer-events:none"/>
            <rect id="battFillBar2" x="85" y="263" width="30" height="0" rx="0" fill="#3fb950" clip-path="url(#battBodyClipRight)"/>
            <rect id="battFillHL2" x="85" y="263" width="30" height="0" rx="0" fill="url(#battFillHighlight)" clip-path="url(#battBodyClipRight)" style="pointer-events:none"/>
            <g id="battBoltGroup1" opacity="0"><polygon points="72,176 64,195 70,195 66,215 78,193 72,193 80,176" fill="#1a4aff" stroke="rgba(100,150,255,.5)" stroke-width="0.8" filter="url(#battGlowBolt)"><animate attributeName="opacity" values="0.5;1;0.5" dur="1.0s" repeatCount="indefinite"/></polygon></g>
            <g id="battBoltGroup2" opacity="0"><polygon points="104,176 96,195 102,195 98,215 110,193 104,193 112,176" fill="#1a4aff" stroke="rgba(100,150,255,.5)" stroke-width="0.8" filter="url(#battGlowBolt)"><animate attributeName="opacity" values="0.5;1;0.5" dur="1.0s" repeatCount="indefinite"/></polygon></g>
            <text id="fcBattVal1" x="68" y="208" text-anchor="middle" font-size="14" font-weight="900" fill="#fff">--%</text>
            <text id="fcBattVal2" x="100" y="208" text-anchor="middle" font-size="14" font-weight="900" fill="#fff">--%</text>
            <text id="battVoltageFlow1" x="68" y="278" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">-- V</text>
            <text id="battVoltageFlow2" x="100" y="278" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">-- V</text>
          ` : `
            <rect id="battFillBar" x="53" y="263" width="62" height="0" rx="0" fill="#3fb950" clip-path="url(#battBodyClip)"/>
            <rect id="battFillHL" x="53" y="263" width="62" height="0" rx="0" fill="url(#battFillHighlight)" clip-path="url(#battBodyClip)" style="pointer-events:none"/>
            <g id="battBoltGroup" opacity="0"><polygon points="86,176 74,199 82,199 77,223 93,195 85,195 97,176" fill="#1a4aff" stroke="rgba(100,150,255,.5)" stroke-width="0.8" filter="url(#battGlowBolt)"><animate attributeName="opacity" values="0.5;1;0.5" dur="1.0s" repeatCount="indefinite"/></polygon></g>
            <text id="fcBattVal" x="84" y="211" text-anchor="middle" font-size="18" font-weight="900" fill="#fff">--%</text>
            <text id="battVoltageFlow" x="84" y="285" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">-- V</text>
          `) +
      `</g>
      </g>`
    );

    this.shadowRoot.innerHTML = `<style>
      :host{display:block} @keyframes svgPulseOrange{0%,100%{filter:drop-shadow(0 0 5px #f39c4b)}50%{filter:drop-shadow(0 0 8px #f5b06a)}}
      .st{background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:7px 9px}
      .st .l{font-size:.48rem;color:#8b949e;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px}
      .st .v{font-size:.8rem;font-weight:600;color:#c9d1d9}
      .dv{height:1px;background:#21262d;margin:8px 0}
      .ct{font-size:.56rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#8b949e;margin-bottom:10px;display:flex;align-items:center;gap:7px}
      .ct::after{content:'';flex:1;height:1px;background:#21262d}
      .pvf{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:2px}
      .pvi{text-align:center;background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:6px 2px}
      .pvi .ico{font-size:.95rem;margin-bottom:2px}
      .pvi .lbl{font-size:.44rem;color:#8b949e;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px}
      .pvi .val{font-size:.76rem;font-weight:700;color:#c9d1d9}
      .pvi .val.yw{color:#f4d03f} text{font-family:'Segoe UI',Arial,sans-serif}
    </style>
    <div style="background:#161b22;border:1px solid #21262d;border-radius:12px;padding:13px;box-shadow:0 4px 20px rgba(0,0,0,.4);width:100%;box-sizing:border-box;">
      <div class="ct">⚡ Energy Flow <span id="battStatusBadge" style="margin-left:auto;font-size:.5rem;font-weight:700;letter-spacing:1.5px;padding:1px 8px;border-radius:8px;background:#21262d;color:#8b949e;text-transform:uppercase">IDLE</span></div>
      <div style="width:100%;max-width:520px;margin:0 auto"><svg id="flowSvg" viewBox="0 0 520 500" style="width:100%;display:block">
      <defs>
        <filter id="arcSunF" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="7"/></filter>
        <filter id="arcSunF2" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3"/></filter>
        <filter id="moonF"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <radialGradient id="dynAuraG" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="rgba(30,100,200,.28)"/><stop offset="55%" stop-color="rgba(30,80,160,.10)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient>
        <radialGradient id="sunCG" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="rgba(255,255,220,.98)"/><stop offset="40%" stop-color="rgb(255,125,10)"/><stop offset="100%" stop-color="rgba(255,130,10,.6)"/></radialGradient>
        <linearGradient id="arcDayGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="rgba(255,180,50,0)"/><stop offset="20%" stop-color="rgba(255,200,70,.5)"/><stop offset="50%" stop-color="rgba(255,228,110,.92)"/><stop offset="80%" stop-color="rgba(255,200,70,.5)"/><stop offset="100%" stop-color="rgba(255,180,50,0)"/></linearGradient>
        <linearGradient id="arcNightGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="rgba(140,170,255,0)"/><stop offset="30%" stop-color="rgba(155,185,255,.35)"/><stop offset="50%" stop-color="rgba(200,215,255,.7)"/><stop offset="70%" stop-color="rgba(155,185,255,.35)"/><stop offset="100%" stop-color="rgba(140,170,255,0)"/></linearGradient>
        <linearGradient id="battCapGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#2d2d2d"/><stop offset="18%" stop-color="#8f8f8f"/><stop offset="50%" stop-color="#ececec"/><stop offset="82%" stop-color="#7a7a7a"/><stop offset="100%" stop-color="#242424"/></linearGradient>
        <linearGradient id="battShellGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#050505"/><stop offset="18%" stop-color="#111"/><stop offset="50%" stop-color="#080808"/><stop offset="82%" stop-color="#111"/><stop offset="100%" stop-color="#030303"/></linearGradient>
        <linearGradient id="battGlassBody" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="rgba(255,255,255,0.03)"/><stop offset="15%" stop-color="rgba(255,255,255,0.22)"/><stop offset="33%" stop-color="rgba(255,255,255,0.05)"/><stop offset="50%" stop-color="rgba(255,255,255,0)"/><stop offset="67%" stop-color="rgba(255,255,255,0.05)"/><stop offset="85%" stop-color="rgba(255,255,255,0.18)"/><stop offset="100%" stop-color="rgba(255,255,255,0.03)"/></linearGradient>
        <linearGradient id="battFillHighlight" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="rgba(255,255,255,0.02)"/><stop offset="20%" stop-color="rgba(255,255,255,0.22)"/><stop offset="48%" stop-color="rgba(255,255,255,0.44)"/><stop offset="60%" stop-color="rgba(255,255,255,0.12)"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/></linearGradient>
        ${dual?`<clipPath id="battBodyClipLeft"><rect x="53" y="145" width="30" height="118" rx="6"/></clipPath><clipPath id="battBodyClipRight"><rect x="85" y="145" width="30" height="118" rx="6"/></clipPath>`:`<clipPath id="battBodyClip"><rect x="53" y="145" width="62" height="118" rx="8"/></clipPath>`}
        <filter id="battGlowRed"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="battGlowOrange"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="battGlowGreen"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="battGlowCyan"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="battGlowBolt"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="iconGlowOrange" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feFlood flood-color="rgba(255,140,0,0.6)" result="c"/><feComposite in="c" in2="b" operator="in" result="d"/><feMerge><feMergeNode in="d"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="iconGlowBlue" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feFlood flood-color="rgba(30,144,255,0.6)" result="c"/><feComposite in="c" in2="b" operator="in" result="d"/><feMerge><feMergeNode in="d"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="iconGlowGreen" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feFlood flood-color="rgba(46,204,113,0.6)" result="c"/><feComposite in="c" in2="b" operator="in" result="d"/><feMerge><feMergeNode in="d"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="iconGlowYellow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feFlood flood-color="rgba(255,230,0,0.7)" result="c"/><feComposite in="c" in2="b" operator="in" result="d"/><feMerge><feMergeNode in="d"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <ellipse id="skyAura" cx="260" cy="84" rx="230" ry="110" fill="url(#dynAuraG)"/>
      <path d="M 35,78 Q 260,-45 485,78 Z" fill="rgba(30,100,200,.05)"/>
      <line x1="8" y1="78" x2="512" y2="78" stroke="rgba(255,255,255,.12)" stroke-width="1" stroke-dasharray="3,8"/>
      <circle cx="35" cy="78" r="3.5" fill="rgba(255,200,80,.7)"/>
      <circle cx="260" cy="78" r="2.5" fill="rgba(255,255,255,.25)"/>
      <circle cx="485" cy="78" r="3.5" fill="rgba(255,110,55,.7)"/>
      <text id="arcRiseLabel" x="35" y="92" fill="rgba(255,255,255,.5)" font-size="10" text-anchor="middle">06:00</text>
      <text x="260" y="92" fill="rgba(255,255,255,.28)" font-size="10" text-anchor="middle">12:00</text>
      <text id="arcSetLabel" x="485" y="92" fill="rgba(255,255,255,.5)" font-size="10" text-anchor="middle">18:00</text>
      <path d="M 35,78 Q 260,-45 485,78" fill="none" stroke="url(#arcDayGrad)" stroke-width="2.2"/>
      <path d="M 485,78 Q 260,158 35,78" fill="none" stroke="url(#arcNightGrad)" stroke-width="1.5" stroke-dasharray="4,5" opacity=".35"/>
      <g id="arcSunGroup" opacity="1">
        <circle id="arcSunGlow2" cx="260" cy="35" r="28" fill="rgba(255,200,60,.12)" filter="url(#arcSunF)"><animate attributeName="r" values="28;34;28" dur="2.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.55;0.9;0.55" dur="2.2s" repeatCount="indefinite"/></circle>
        <circle id="arcSunGlow1" cx="260" cy="35" r="14" fill="rgba(255,200,60,.5)" filter="url(#arcSunF2)"><animate attributeName="r" values="14;17;14" dur="2.2s" repeatCount="indefinite"/></circle>
        <circle id="arcSunDot" cx="260" cy="35" r="7" fill="url(#sunCG)" stroke="rgba(255,255,200,.85)" stroke-width="1.2"><animate attributeName="r" values="7;8;7" dur="2.2s" repeatCount="indefinite"/></circle>
      </g>
      <g id="moonGroup" opacity="0" filter="url(#moonF)">
        <circle id="moonGlow" cx="260" cy="72" r="12" fill="rgba(180,205,255,.18)"/>
        <circle id="moonDot" cx="260" cy="72" r="6" fill="rgba(220,235,255,.92)" stroke="rgba(240,248,255,.9)" stroke-width="1.2"/>
      </g>
      <rect id="arcPvLabelRect" x="162" y="22" width="96" height="26" rx="13" fill="rgba(255,200,50,.22)" stroke="rgba(255,210,60,.5)" stroke-width="1.2"/>
      <text id="arcPvLabelText" x="210" y="39" text-anchor="middle" fill="rgba(255,235,110,.98)" font-size="13" font-weight="800">0 W ⚡</text>
      <g id="pvFlowGroup"></g>

      ${battGhostPath}
      <path d="M 399,175 H 361 V 202 H 315" fill="none" stroke="#1e3a5f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.18"/>
      <path d="M 260,265 V 358" fill="none" stroke="#1e3a5f" stroke-width="3" stroke-linecap="round" opacity="0.18"/>

      <path id="flowGridIn" d="M 432,175 H 361 V 202 H 315" fill="none" stroke="#FF2929" stroke-width="3" stroke-linecap="round" stroke-dasharray="14 10" opacity="0" style="display:none"><animate attributeName="stroke-dashoffset" from="0" to="-24" dur="0.8s" repeatCount="indefinite"/></path>
      <path id="flowGridOut" d="M 432,175 H 361 V 202 H 315" fill="none" stroke="#2ecc71" stroke-width="3" stroke-linecap="round" stroke-dasharray="14 10" opacity="0" style="display:none"><animate attributeName="stroke-dashoffset" from="-24" to="0" dur="0.8s" repeatCount="indefinite"/></path>

      ${battFlowPaths}

      <path id="flowInvLoad" d="M 260,358 V 265" fill="none" stroke="#29c4f6" stroke-width="3" stroke-linecap="round" stroke-dasharray="14 10" opacity="0" style="display:none"><animate attributeName="stroke-dashoffset" from="-24" to="0" dur="0.8s" repeatCount="indefinite"/></path>

      <!-- Battery current/power placed above/below flow bar -->
      ${showBatt1 ? (dual ? battTextDual : battTextSingle) : ''}

      ${battIconSection}

      <g id="gridIconImg" transform="translate(399,133)" style="opacity:1"><image href="${iconPath}/grid-icon.png" x="0" y="0" width="121" height="121" preserveAspectRatio="xMidYMid meet"/></g>
      <text id="fcGridVal" x="445" y="269" text-anchor="middle" font-size="13" font-weight="700" fill="#e05c00">-- W</text>
      <text id="gridImportVal" x="397" y="165" text-anchor="middle" font-size="10" font-weight="600" fill="#cde">-- kWh</text>
      <text id="gridExportVal" x="397" y="192" text-anchor="middle" font-size="10" font-weight="600" fill="#cde" style="display:none">-- kWh</text>

      <rect id="fcInvRect" x="205" y="155" width="110" height="110" rx="18" fill="#161b22" stroke="#f4a93b" stroke-width="4"/>
      <text id="invNameLabel" x="260" y="203" text-anchor="middle" font-size="14" font-weight="800" fill="#f4a93b" letter-spacing="1">INV</text>
      <text id="invTempFlow" x="260" y="222" text-anchor="middle" font-size="12" font-weight="700" fill="#58a6ff">-- °C</text>
      <text id="invLoadPctFlow" x="260" y="240" text-anchor="middle" font-size="12" font-weight="700" fill="#3ce878">--%</text>

      <text id="pv1label" x="8" y="360" font-size="9" fill="#8b949e" letter-spacing="1">PV1</text>
      <text id="pv1FlowVal" x="8" y="374" font-size="12" font-weight="700" fill="#ffe83c">-- W</text>
      <text id="pv2label" x="8" y="392" font-size="9" fill="#8b949e" letter-spacing="1">PV2</text>
      <text id="pv2FlowVal" x="8" y="406" font-size="12" font-weight="700" fill="#ffe83c">-- W</text>
      ${pv3txt}
      ${pv4txt}

      <g id="homeIconImg" transform="translate(179,339)" style="opacity:1"><image href="${iconPath}/home-icon.png" x="0" y="0" width="160" height="160" preserveAspectRatio="xMidYMid meet"/></g>
      <text id="fcLoadVal" x="174" y="420" text-anchor="end" font-size="13" font-weight="700" fill="#F7F6D3">-- W</text>
      ${evtxt}
      </svg></div>`+

      `<div style="display:flex;gap:8px;align-items:center;margin-top:10px">
        <div style="flex:1;display:flex;align-items:center;gap:4px"><span style="font-size:.42rem;color:#8b949e;letter-spacing:1px;text-transform:uppercase">PV</span><div style="flex:1;display:flex;gap:2px;align-items:flex-end;height:10px" id="pvBlocks"></div></div>
        <div style="flex:1;display:flex;align-items:center;gap:4px"><span style="font-size:.42rem;color:#8b949e;letter-spacing:1px;text-transform:uppercase">Pwr</span><div style="flex:1;background:#21262d;border-radius:20px;height:9px;overflow:hidden;position:relative"><div id="pwrBar" style="position:absolute;inset:0;right:auto;width:0%;border-radius:20px;background:#3fb950;transition:width .4s,background .4s"></div></div></div>
      </div>
      <div class="dv"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-top:5px">
        <div class="st"><div class="l">${this.config.label_cell_temp_minmax || 'CELL TEMP MIN/MAX'}</div><div class="v" id="bTemp1">-- °C</div></div>
        <div class="st"><div class="l">${this.config.label_bms_temp || 'BMS TEMP'}</div><div class="v" id="bTemp2">-- °C</div></div>
        <div class="st"><div class="l">${this.config.label_total_pv_gen || 'TOTAL PV GEN.'}</div><div class="v" id="bTotalPvGen">-- kWh</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-top:4px">
        <div class="st"><div class="l">${this.config.label_min_cell || 'Min Cell'}</div><div class="v" id="bMinCell">-- V</div></div>
        <div class="st"><div class="l">${this.config.label_max_cell || 'Max Cell'}</div><div class="v" id="bMaxCell">-- V</div></div>
        <div class="st"><div class="l">${this.config.label_batt_dis || 'Batt Dis.'}</div><div class="v" id="bBattDis">-- kWh</div></div>
      </div>
      <div style="margin-top:4px">
        <div class="st" style="display:flex;flex-direction:row;align-items:flex-end;justify-content:space-between;gap:8px;padding:4px 9px 5px;width:100%;box-sizing:border-box">
          <div class="l" id="bEnduStatLbl" style="margin-bottom:0;white-space:nowrap;line-height:1.4">${this.config.label_endurance || 'ENDURANCE'}</div>
          <div style="display:flex;align-items:flex-end;gap:10px;flex-shrink:0">
            <div class="v" id="bEnduranceStat" style="font-size:.88rem;line-height:1.2">--</div>
            <div id="bEnduranceTime" style="font-size:.58rem;color:#8b949e;letter-spacing:.3px;white-space:nowrap;line-height:1.4">Till --</div>
          </div>
        </div>
      </div>
      <div class="dv"></div>
      <div class="ct">☀️ Inverter</div>
      <div class="pvf">
        <div class="pvi"><div class="ico">☀️</div><div class="lbl">Today PV</div><div class="val yw" id="invTodayPv">-- kWh</div></div>
        <div class="pvi"><div class="ico">🔋</div><div class="lbl">Chg / Dis</div><div class="val" id="invTodayBattChg">-- kWh</div><div class="val" id="invTodayBattDis" style="font-size:.62rem;color:#8b949e;margin-top:1px">-- kWh</div></div>
        <div class="pvi"><div class="ico">⚡</div><div class="lbl">Remaining</div><div class="val" id="invRemCap">-- Ah</div><div class="val" id="invRemKwh" style="font-size:.62rem;color:#8b949e;margin-top:1px">-- kWh</div></div>
        <div class="pvi"><div class="ico">🏡</div><div class="lbl">Today Load</div><div class="val" id="invTodayLoad">-- kWh</div></div>
      </div>
    </div>`;
  }

  _updateDynamic() {
    if (!this._hass || !this.config) return;
    const root = this.shadowRoot;
    const getEl = (id) => root.getElementById(id);
    const setText = (id, txt) => { const el = getEl(id); if (el) el.textContent = txt; };
    const setAttr = (id, attr, val) => { const el = getEl(id); if (el) el.setAttribute(attr, val); };
    const setDisplay = (id, visible) => { const el = getEl(id); if (!el) return; el.style.display = visible ? '' : 'none'; };

    // Fix #4: use null-aware helper so unavailable/unknown sensors show '--' not '0'
    const _n = (v, fallback = 0) => (v !== null && !isNaN(v)) ? v : fallback;
    const _nullOr0 = (v) => (v !== null && !isNaN(v)) ? v : 0; // for flow/direction values where 0 is valid

    const pv1 = _n(this._val(this.config.pv1_power, true));
    const pv2 = _n(this._val(this.config.pv2_power, true));
    const pv3 = this.config._show_pv_extra ? _n(this._val(this.config.pv3_power, true)) : 0;
    const pv4 = this.config._show_pv_extra ? _n(this._val(this.config.pv4_power, true)) : 0;
    const totalPvSensor = this._val(this.config.pv_total_power, true);
    const pvTotal = (totalPvSensor !== null && !isNaN(totalPvSensor) && totalPvSensor > 0) ? totalPvSensor : pv1 + pv2 + pv3 + pv4;
    const _gridPrimary = this._val(this.config.grid_active_power, true);
    let gridActive = _gridPrimary !== null ? _gridPrimary : _nullOr0(this._val(this.config.grid_power_alt, true));
    if (this.config.invert_grid_power) gridActive = -gridActive;
    const gridImport = _n(this._val(this.config.grid_import_energy));
    const gridExport = _n(this._val(this.config.grid_export_energy));
    const load = _n(this._val(this.config.consump, true));
    // Fix #9: store raw null so we can show '--' and use toFixed(2) to avoid float artefacts
    const _todayPvRaw = this._val(this.config.today_pv);
    const _todayBattChgRaw = this._val(this.config.today_batt_chg);
    const _todayLoadRaw = this._val(this.config.today_load);
    const todayPv = _n(_todayPvRaw);
    const todayBattChg = _n(_todayBattChgRaw);
    const todayLoad = _n(_todayLoadRaw);
    const battSoc1 = _n(this._val(this.config.battery_soc) ?? this._val(this.config.goodwe_battery_soc));
    let battPwr1 = _nullOr0(this._val(this.config.battery_power, true));
    if (this.config.invert_battery_power) battPwr1 = -battPwr1;
    let battCurr1 = _nullOr0(this._val(this.config.battery_current) ?? this._val(this.config.goodwe_battery_curr));
    if (this.config.invert_battery_power) battCurr1 = -battCurr1;
    const battVolt1 = _n(this._val(this.config.battery_voltage));
    const temp1_1 = _n(this._val(this.config.battery_temp1));
    const temp2_1 = _n(this._val(this.config.battery_temp2));
    const mos1 = _n(this._val(this.config.battery_mos));
    const minCell1 = _n(this._val(this.config.battery_min_cell));
    const maxCell1 = _n(this._val(this.config.battery_max_cell));
    const battDis1Raw = this._val(this.config.batt_dis);
    const battDis1 = _n(battDis1Raw);
    const invTemp = _n(this._val(this.config.inv_temp));

    // System limits – direct numbers
    // battery_cap_unit: 'ah' uses battery_full_ah; 'kwh' uses battery_full_wh (stored as kWh, converted to Wh internally)
    const capUnit = this.config.battery_cap_unit || 'ah';
    const fullAh  = capUnit === 'ah'  ? (Number(this.config.battery_full_ah)  || 0) : 0;
    // battery_full_wh entered in kWh (×1000 for internal Wh). In Ah mode, derive Wh from Ah × live voltage.
    // battVolt1 is read below — forward-declare safe because JS hoists var, but we use const so we
    // must read voltage first. We re-read it inline here before battVolt1 is const-declared.
    const _voltForCap = _n(this._val(this.config.battery_voltage));
    const fullWh  = capUnit === 'kwh' ? (Number(this.config.battery_full_wh) || 0) * 1000
                                      : (fullAh > 0 && _voltForCap > 0 ? fullAh * _voltForCap : 0);
    const invMax = Number(this.config.inverter_max_power) || 6000;
    const pvMax  = Number(this.config.pv_max_power)       || 7500;

    const remCap1 = fullAh > 0 ? (battSoc1 / 100) * fullAh : 0;
    // Fix #14: dual-battery charging ETA — battery2_full_wh entered in kWh, ×1000 for internal Wh
    const fullWh2 = Number(this.config.battery2_full_wh) > 0 ? Number(this.config.battery2_full_wh) * 1000 : fullWh;

    const dual = !!(this.config._show_battery2);
    const battSoc2 = dual ? _n(this._val(this.config.battery2_soc)) : 0;
    let battPwr2 = dual ? _nullOr0(this._val(this.config.battery2_power, true)) : 0;
    let battCurr2 = dual ? _nullOr0(this._val(this.config.battery2_current)) : 0;
    if (dual && this.config.invert_battery_power) { battPwr2 = -battPwr2; battCurr2 = -battCurr2; }
    const battVolt2 = dual ? _n(this._val(this.config.battery2_voltage)) : 0;
    const mos2 = dual ? _n(this._val(this.config.battery2_mos)) : 0;

    const chargerPowerRaw = this._val(this.config.charger_power, true);
    const chargerCurrentRaw = this._val(this.config.charger_current);
    const chargerSocRaw = this._val(this.config.charger_soc);
    const chargerPower = _n(chargerPowerRaw);
    const chargerCurrent = _n(chargerCurrentRaw);
    const chargerSoc = _n(chargerSocRaw);
    const chargerEtaSensor = this._val(this.config.charger_eta);
    const chargerBattCapWh = Number(this.config.charger_battery_capacity_wh) || 0;
    const chargerStateStr = this._strVal(this.config.charger_state);

    const sun = this._sunData();
    const auraEl = getEl('skyAura');
    if (auraEl) auraEl.setAttribute('cy', (94 - Math.round((sun.bell || 0.5) * 22)).toString());
    ['arcSunDot', 'arcSunGlow1', 'arcSunGlow2'].forEach(id => { const e = getEl(id); if (e) { e.setAttribute('cx', sun.bx); e.setAttribute('cy', sun.by); } });
    getEl('arcSunGroup')?.setAttribute('opacity', sun.night ? '0' : '1');
    const moonGroup = getEl('moonGroup');
    if (sun.night) {
      ['moonGlow', 'moonDot'].forEach(id => { const e = getEl(id); if (e) { e.setAttribute('cx', sun.mx || 260); e.setAttribute('cy', sun.my || 72); } });
      if (moonGroup) moonGroup.setAttribute('opacity', '1');
    } else { if (moonGroup) moonGroup.setAttribute('opacity', '0'); }

    const pvTxt = (pvTotal >= 1000 ? (pvTotal / 1000).toFixed(2) + ' kW' : pvTotal.toFixed(0) + ' W') + ' ⚡';
    const pvLabelRect = getEl('arcPvLabelRect');
    const pvLabelText = getEl('arcPvLabelText');
    if (pvLabelRect) { pvLabelRect.setAttribute('x', sun.t < 0.5 ? Math.max(4, sun.bx - 108) : Math.min(sun.bx + 14, 420)); pvLabelRect.setAttribute('y', Math.max(2, sun.by - 28)); }
    if (pvLabelText) { pvLabelText.setAttribute('x', sun.t < 0.5 ? Math.max(52, sun.bx - 60) : Math.min(sun.bx + 62, 468)); pvLabelText.setAttribute('y', Math.max(19, sun.by - 11)); pvLabelText.textContent = pvTxt; }
    setText('arcRiseLabel', sun.rise);
    setText('arcSetLabel', sun.set);

    if (pvTotal !== this._prevPvTotal || sun.bx !== this._prevSunPos.bx || sun.by !== this._prevSunPos.by) {
      this._prevPvTotal = pvTotal; this._prevSunPos = { bx: sun.bx, by: sun.by };
      const pvGroup = getEl('pvFlowGroup');
      if (pvGroup) pvGroup.innerHTML = this._buildPvWaveHTML(sun.bx, sun.by, pvTotal);
    }

    const flowDur = (w) => Math.max(0.5, 3.0 - (Math.min(Math.abs(w), 8000) / 8000) * 2.5).toFixed(2) + 's';
    const setFlow = (id, show, watts, durStr, color) => {
      const el = getEl(id); if (!el) return;
      el.setAttribute('opacity', show ? '1' : '0'); el.style.display = show ? '' : 'none';
      if (show && durStr !== undefined) { const anim = el.querySelector('animate'); if (anim) anim.setAttribute('dur', durStr); }
      if (color !== undefined) el.setAttribute('stroke', color);
    };

    const absPwr1 = Math.abs(battPwr1);
    const isCharging1 = battPwr1 > 10;
    const showBattIn = battPwr1 > 10;
    const showBattOut = battPwr1 < -10;
    let battLineColor = '#8b949e', battDur = '4.0s', battShowIn = false, battShowOut = false;
    if (absPwr1 < 10) { battShowIn = false; battShowOut = false; }
    else if (absPwr1 < 50) { battShowIn = showBattIn; battShowOut = showBattOut; battLineColor = '#8b949e'; }
    else { battShowIn = showBattIn; battShowOut = showBattOut; battDur = flowDur(absPwr1);
      if (isCharging1) battLineColor = '#2b59ff';
      else if (absPwr1 < 1000) battLineColor = '#f39c4b';
      else if (absPwr1 < 2500) battLineColor = '#e67e22';
      else battLineColor = '#f85149'; }
    setFlow('flowBattIn', battShowIn, absPwr1, battDur, battLineColor);
    setFlow('flowBattOut', battShowOut, absPwr1, battDur, battLineColor);
    setFlow('flowGridIn', gridActive > 10, gridActive, flowDur(gridActive), '#FF2929');
    setFlow('flowGridOut', gridActive < -10, Math.abs(gridActive), flowDur(Math.abs(gridActive)), '#2ecc71');

    // flowInvLoad color — matches the dominant source feeding the home load
    // PV    → #ffe83c  (yellow,  matches PV flow lines)
    // Batt  → #f39c4b / #e67e22 / #f85149  (orange→red, matches battLineColor)
    // Grid  → #FF2929  (red,     matches flowGridIn)
    const absGrid = Math.abs(gridActive > 10 ? gridActive : 0);  // only count grid import
    const absBattOut = battPwr1 < -10 ? Math.abs(battPwr1) : 0;  // only count discharge
    const absPvLoad = pvTotal > 10 ? pvTotal : 0;
    let loadFlowColor = '#ffe83c'; // default PV yellow
    if (absGrid >= absPvLoad && absGrid >= absBattOut && absGrid > 10) {
      loadFlowColor = '#FF2929'; // grid dominant
    } else if (absBattOut >= absPvLoad && absBattOut >= absGrid && absBattOut > 10) {
      // battery dominant — mirror battLineColor scale
      loadFlowColor = absBattOut < 1000 ? '#f39c4b' : absBattOut < 2500 ? '#e67e22' : '#f85149';
    } else {
      loadFlowColor = '#ffe83c'; // PV dominant
    }
    setFlow('flowInvLoad', load > 10, load, flowDur(load), loadFlowColor);

    // Icon glows
    const battIconWrap = getEl('battIconWrap');
    if (battIconWrap) { battIconWrap.setAttribute('filter', absPwr1 >= 50 ? 'url(#iconGlowBlue)' : ''); }
    const gridImg = getEl('gridIconImg');
    if (gridImg) { gridImg.style.opacity = Math.abs(gridActive) < 10 ? '0.4' : '1'; gridImg.setAttribute('filter', Math.abs(gridActive) >= 50 ? 'url(#iconGlowOrange)' : ''); }
    const homeImg = getEl('homeIconImg');
    if (homeImg) { homeImg.style.opacity = load > 10 ? '1' : '0.7'; homeImg.setAttribute('filter', load > 10 ? 'url(#iconGlowOrange)' : ''); }

    // Battery fill & stats
    if (dual) {
      const fill1 = this._battFill(battSoc1); const fill2 = this._battFill(battSoc2);
      const bf1 = getEl('battFillBar1'); if (bf1) { bf1.setAttribute('y', fill1.y); bf1.setAttribute('height', fill1.height); bf1.setAttribute('fill', fill1.color); bf1.setAttribute('filter', fill1.filter); }
      const bh1 = getEl('battFillHL1'); if (bh1) { bh1.setAttribute('y', fill1.y); bh1.setAttribute('height', fill1.height); }
      const bf2 = getEl('battFillBar2'); if (bf2) { bf2.setAttribute('y', fill2.y); bf2.setAttribute('height', fill2.height); bf2.setAttribute('fill', fill2.color); bf2.setAttribute('filter', fill2.filter); }
      const bh2 = getEl('battFillHL2'); if (bh2) { bh2.setAttribute('y', fill2.y); bh2.setAttribute('height', fill2.height); }
      setText('fcBattVal1', battSoc1 + '%'); setAttr('fcBattVal1', 'fill', fill1.textColor);
      setText('fcBattVal2', battSoc2 + '%'); setAttr('fcBattVal2', 'fill', fill2.textColor);
      setText('battVoltageFlow1', battVolt1.toFixed(1) + ' V'); setText('battVoltageFlow2', battVolt2.toFixed(1) + ' V');
      // Current & power placed outside battery group
      setText('battPwrFlow1', Math.abs(battPwr1).toFixed(0) + ' W');
      setText('battCurrFlow1', battCurr1.toFixed(1) + ' A');
      setText('battPwrFlow2', Math.abs(battPwr2).toFixed(0) + ' W');
      setText('battCurrFlow2', battCurr2.toFixed(1) + ' A');
      const bolt1 = getEl('battBoltGroup1'), bolt2 = getEl('battBoltGroup2');
      if (bolt1) bolt1.setAttribute('opacity', battPwr1 > 10 ? '1' : '0');
      if (bolt2) bolt2.setAttribute('opacity', battPwr2 > 10 ? '1' : '0');
      // Fix #16: bTemp1/bTemp2 written once below in the label override block — skip early write
      // bMinCell, bMaxCell, bBattDis handled by label override block below
    } else {
      const fill = this._battFill(battSoc1);
      const bf = getEl('battFillBar'); if (bf) { bf.setAttribute('y', fill.y); bf.setAttribute('height', fill.height); bf.setAttribute('fill', fill.color); bf.setAttribute('filter', fill.filter); }
      const bh = getEl('battFillHL'); if (bh) { bh.setAttribute('y', fill.y); bh.setAttribute('height', fill.height); }
      setText('fcBattVal', battSoc1 + '%'); setAttr('fcBattVal', 'fill', fill.textColor);
      setText('battVoltageFlow', battVolt1.toFixed(1) + ' V');
      setText('battPwrFlow', absPwr1.toFixed(0) + ' W');
      setText('battCurrFlow', battCurr1.toFixed(1) + ' A');
      const bolt = getEl('battBoltGroup'); if (bolt) bolt.setAttribute('opacity', battPwr1 > 10 ? '1' : '0');
      // Fix #16: bTemp1/bTemp2 written once below in the label override block — skip early write
      // bMinCell, bMaxCell, bBattDis handled by label override block below
    }

    // Color and value for cell tiles — handled by label override block below

    // Endurance — works in both Ah mode (needs voltage to get Wh) and kWh mode (direct)
    let endHours = null, endText = '--', endColor = '#8b949e', isETA = false;
    const _socPct = battSoc1;  // use SOC directly for colour
    if (dual) {
      const totalRemWh = (battSoc1 / 100) * fullWh + (battSoc2 / 100) * fullWh2;
      const totalCapWh = fullWh + fullWh2;
      const totalPower = battPwr1 + battPwr2;
      if (totalCapWh > 0) {
        if (totalPower < -10) {
          endHours = totalRemWh / Math.abs(totalPower);
          endText = this._fmtEndurance(endHours); endColor = this._remCapColor(_socPct);
        } else if (totalPower > 10) {
          const missingWh = totalCapWh - totalRemWh;
          endHours = Math.max(0, missingWh / totalPower);
          endText = this._fmtEndurance(endHours); endColor = '#00d7ff'; isETA = true;
        }
      }
    } else {
      // simpler: remWh from SOC × fullWh; if fullWh=0 (not configured), try Ah×V fallback
      const remWhFinal = fullWh > 0 ? (battSoc1 / 100) * fullWh
                                    : (fullAh > 0 && battVolt1 > 0 ? remCap1 * battVolt1 : 0);
      if (battPwr1 < -10 && remWhFinal > 0) {
        endHours = remWhFinal / Math.abs(battPwr1);
        endText = this._fmtEndurance(endHours); endColor = this._remCapColor(_socPct);
      } else if (battPwr1 > 10) {
        const capWh = fullWh > 0 ? fullWh : (fullAh > 0 && battVolt1 > 0 ? fullAh * battVolt1 : 0);
        if (capWh > 0) {
          const missingWh = capWh - remWhFinal;
          endHours = Math.max(0, missingWh / Math.abs(battPwr1));
          endText = this._fmtEndurance(endHours); endColor = '#00d7ff'; isETA = true;
        }
      }
    }
    // Total PV Generation stat tile
    const _totalPvGenEl = getEl('bTotalPvGen');
    if (_totalPvGenEl) {
      const totalPvGenEntity = this.config.total_pv_gen_entity || 'sensor.goodwe_total_pv_generation';
      const totalPvGenState = this._hass && this._hass.states[totalPvGenEntity];
      if (totalPvGenState && totalPvGenState.state !== 'unavailable' && totalPvGenState.state !== 'unknown') {
        const val = parseFloat(totalPvGenState.state);
        const unit = totalPvGenState.attributes?.unit_of_measurement || 'kWh';
        _totalPvGenEl.textContent = isNaN(val) ? '--' : val.toFixed(2) + ' ' + unit;
        _totalPvGenEl.style.color = '#f4d03f';
      } else {
        _totalPvGenEl.textContent = '-- kWh';
        _totalPvGenEl.style.color = '#8b949e';
      }
    }
    const pwrBar = getEl('pwrBar');
    if (pwrBar) {
      pwrBar.style.width = Math.min(absPwr1 / invMax * 100, 100).toFixed(1) + '%';
      pwrBar.style.background = absPwr1 < 50 ? '#8b949e' : isCharging1 ? '#2b59ff' :
        'linear-gradient(to right, #f4d03f, #f39c4b ' + ((absPwr1 / invMax * 100) * 0.5).toFixed(0) + '%, #f85149)';
    }
    const badge = getEl('battStatusBadge');
    if (badge) { badge.textContent = absPwr1 < 50 ? 'IDLE' : isCharging1 ? 'CHG' : 'DISCHG'; badge.style.color = absPwr1 < 50 ? '#8b949e' : isCharging1 ? '#00d7ff' : '#3ce878'; }

    setText('invTempFlow', invTemp.toFixed(1) + ' °C');
    setText('invNameLabel', this.config.inverter_name || 'INV');
    setAttr('invTempFlow', 'fill', invTemp <= 45 ? '#58a6ff' : invTemp <= 55 ? '#f39c4b' : '#f85149');
    const invLoadPct = Math.min(load / invMax * 100, 100).toFixed(0);
    // Fix #8: toFixed() returns a string; use Number() for the colour comparison
    setText('invLoadPctFlow', invLoadPct + '%'); setAttr('invLoadPctFlow', 'fill', Number(invLoadPct) <= 50 ? '#3fb950' : '#f39c4b');

    const gridDir = gridActive > 10 ? '▼ ' : gridActive < -10 ? '▲ ' : '';
    // Fix #7: grid power now auto-switches to kW like load/PV (was always showing W)
    const absGrid2 = Math.abs(gridActive);
    setText('fcGridVal', gridDir + (absGrid2 >= 1000 ? (absGrid2 / 1000).toFixed(2) + ' kW' : absGrid2.toFixed(0) + ' W'));
    setAttr('fcGridVal', 'fill', gridActive > 10 ? '#FF2929' : gridActive < -10 ? '#2ecc71' : '#8b949e');
    setText('gridImportVal', '▼ ' + gridImport.toFixed(2) + ' kWh');
    setDisplay('gridExportVal', gridExport > 0);
    if (gridExport > 0) setText('gridExportVal', '▲ ' + gridExport.toFixed(2) + ' kWh');

    setText('fcLoadVal', load >= 1000 ? (load / 1000).toFixed(2) + ' kW' : load.toFixed(0) + ' W');
    setAttr('fcLoadVal', 'fill', load > 10 ? loadFlowColor : '#8b949e');

    setText('pv1FlowVal', pv1 >= 1000 ? (pv1 / 1000).toFixed(2) + ' kW' : pv1.toFixed(0) + ' W');
    setText('pv2FlowVal', pv2 >= 1000 ? (pv2 / 1000).toFixed(2) + ' kW' : pv2.toFixed(0) + ' W');
    setDisplay('pv3label', this.config._show_pv_extra);
    setDisplay('pv3FlowVal', this.config._show_pv_extra);
    if (this.config._show_pv_extra) setText('pv3FlowVal', pv3 >= 1000 ? (pv3 / 1000).toFixed(2) + ' kW' : pv3.toFixed(0) + ' W');
    setDisplay('pv4label', this.config._show_pv_extra);
    setDisplay('pv4FlowVal', this.config._show_pv_extra);
    if (this.config._show_pv_extra) setText('pv4FlowVal', pv4 >= 1000 ? (pv4 / 1000).toFixed(2) + ' kW' : pv4.toFixed(0) + ' W');

    // Fix #9: use toFixed(2) to prevent floating-point artefacts; show '--' when sensor unavailable
    setText('invTodayPv',      _todayPvRaw      !== null ? todayPv.toFixed(2)      + ' kWh' : '-- kWh');
    setText('invTodayBattChg', _todayBattChgRaw !== null ? todayBattChg.toFixed(2) + ' kWh' : '-- kWh');
    setText('invTodayBattDis', battDis1Raw      !== null ? battDis1.toFixed(2)     + ' kWh' : '-- kWh');
    setText('invTodayLoad',    _todayLoadRaw    !== null ? todayLoad.toFixed(2)    + ' kWh' : '-- kWh');
    // ── Remaining Ah + kWh ──
    // Each battery uses its OWN Ah capacity; battery2_full_ah defaults to fullAh if not set
    const fullAh2 = capUnit === 'ah'
      ? (Number(this.config.battery2_full_ah) > 0 ? Number(this.config.battery2_full_ah) : fullAh)
      : 0;
    const remCap2 = fullAh2 > 0 ? (battSoc2 / 100) * fullAh2 : 0;
    const totalRemAh = fullAh > 0 ? remCap1 + (dual ? remCap2 : 0) : null;
    // kWh remaining: always SOC-based from configured capacity — never voltage-dependent
    const totalRemKwh = fullWh > 0
      ? ((battSoc1 / 100) * fullWh + (dual ? (battSoc2 / 100) * fullWh2 : 0)) / 1000
      : null;
    const invRemCapEl = getEl('invRemCap');
    const invRemKwhEl = getEl('invRemKwh');
    const remColor = this._remCapColor(battSoc1);
    if (capUnit === 'ah') {
      // Ah mode: integer, no decimal, left-padded with plain spaces to 3 chars wide
      if (invRemCapEl) {
        const ahInt = totalRemAh !== null ? Math.round(totalRemAh) : null;
        invRemCapEl.textContent = ahInt !== null ? String(ahInt).padStart(3, ' ') + ' Ah' : '-- Ah';
        invRemCapEl.style.color = remColor;
        invRemCapEl.style.display = '';
        invRemCapEl.style.fontVariantNumeric = 'tabular-nums';
      }
      if (invRemKwhEl) invRemKwhEl.style.display = 'none';
    } else {
      // kWh mode: always 2 decimal places, e.g. "15.92 kWh"
      if (invRemCapEl) invRemCapEl.style.display = 'none';
      if (invRemKwhEl) {
        invRemKwhEl.textContent = totalRemKwh !== null ? totalRemKwh.toFixed(2) + ' kWh' : '-- kWh';
        invRemKwhEl.style.color = remColor;
        invRemKwhEl.style.display = '';
        invRemKwhEl.style.fontSize = '.76rem';
        invRemKwhEl.style.fontWeight = '700';
        invRemKwhEl.style.marginTop = '0';
      }
    }

    // ── Label entity overrides for stat tiles ──
    // Per-row: override active only when global gate ON AND label text ≠ its default
    const labelsOn = !!(this.config._labels_custom_entities);
    const _rowActive = (labelKey, def) => labelsOn && (this.config[labelKey] || def) !== def;

    // Read value from a custom entity key.
    // Returns {val: number, text: string, isText: false} for numeric entities.
    // Returns {val: null, text: stateString, isText: true} for text-state entities (e.g. "idle", "charging").
    // Returns null when entity is unavailable/unknown/missing.
    const _readVal = (entityKey) => {
      const eid = this.config[entityKey];
      if (!eid) return null;
      const s = this._hass && this._hass.states[eid];
      if (!s || s.state === 'unavailable' || s.state === 'unknown') return null;
      const v = parseFloat(s.state);
      if (!isNaN(v)) return { val: v, text: null, isText: false };
      // Non-numeric state (e.g. "idle", "charging", "on grid backup mode")
      return { val: null, text: String(s.state), isText: true };
    };
    // Keep _readNum as numeric-only shortcut (returns number or null)
    const _readNum = (entityKey) => {
      const r = _readVal(entityKey);
      return (r && !r.isText) ? r.val : null;
    };

    // Read the HA unit_of_measurement for a custom entity key.
    const _readUnit = (entityKey) =>
      this._hass?.states[this.config[entityKey]]?.attributes?.unit_of_measurement || '';

    // Smart value formatter: respects the entity's own unit.
    //   W / kW  → auto-range to kW at ≥1000 W
    //   V       → 3 decimal places
    //   °C / °F → 1 decimal place
    //   %       → 1 decimal place
    //   kWh / Wh / MWh → 2 decimal places
    //   anything else  → 2 decimal places
    // Also returns a colour appropriate for the unit.
    const _fmtCustom = (val, unit) => {
      const u = (unit || '').trim();
      let text, color;
      if (u === 'W') {
        if (Math.abs(val) >= 1000) { text = (val / 1000).toFixed(2) + ' kW'; }
        else                        { text = val.toFixed(0) + ' W'; }
        color = '#58a6ff';
      } else if (u === 'kW') {
        text = val.toFixed(2) + ' kW';
        color = '#58a6ff';
      } else if (u === 'V') {
        text = val.toFixed(3) + ' V';
        color = this._cellVoltColor(val);
      } else if (u === '°C' || u === '°F' || u === 'C' || u === 'F') {
        text = val.toFixed(1) + ' ' + (u.startsWith('°') ? u : '°' + u);
        color = this._cellTempColor(val);
      } else if (u === '%') {
        text = val.toFixed(1) + ' %';
        color = this._socColor(val);
      } else if (u === 'kWh' || u === 'Wh' || u === 'MWh') {
        text = val.toFixed(2) + ' ' + u;
        color = '#f4d03f';
      } else if (u === 'A') {
        text = val.toFixed(1) + ' A';
        color = '#cde';
      } else {
        // Unknown unit — show value + unit as-is
        text = val.toFixed(2) + (u ? ' ' + u : '');
        color = '#cde';
      }
      return { text, color };
    };

    // Cell temp tile
    const cellTempCustom = _rowActive('label_cell_temp_minmax', 'CELL TEMP MIN/MAX') && this.config.label_entity_cell_temp;
    const _cellTempRaw = cellTempCustom ? _readVal('label_entity_cell_temp') : null;
    const temp1Final = (_cellTempRaw && !_cellTempRaw.isText) ? _cellTempRaw.val : temp1_1;
    const cellTempUnit = cellTempCustom ? _readUnit('label_entity_cell_temp') : '°C';

    // BMS temp tile
    const bmsTempCustom = _rowActive('label_bms_temp', 'BMS TEMP') && this.config.label_entity_bms_temp;
    const _bmsTempRaw = bmsTempCustom ? _readVal('label_entity_bms_temp') : null;
    const mosFinal = (_bmsTempRaw && !_bmsTempRaw.isText) ? _bmsTempRaw.val : mos1;
    const bmsTempUnit = bmsTempCustom ? _readUnit('label_entity_bms_temp') : '°C';

    // Min cell tile
    const minCellCustom = _rowActive('label_min_cell', 'Min Cell') && this.config.label_entity_min_cell;
    const _minCellRaw = minCellCustom ? _readVal('label_entity_min_cell') : null;
    const minCellFinal = (_minCellRaw && !_minCellRaw.isText) ? _minCellRaw.val : minCell1;
    const minCellUnit  = minCellCustom ? _readUnit('label_entity_min_cell') : 'V';

    // Max cell tile
    const maxCellCustom = _rowActive('label_max_cell', 'Max Cell') && this.config.label_entity_max_cell;
    const _maxCellRaw = maxCellCustom ? _readVal('label_entity_max_cell') : null;
    const maxCellFinal = (_maxCellRaw && !_maxCellRaw.isText) ? _maxCellRaw.val : maxCell1;
    const maxCellUnit  = maxCellCustom ? _readUnit('label_entity_max_cell') : 'V';

    // Batt dis tile
    const battDisCustom = _rowActive('label_batt_dis', 'Batt Dis.') && this.config.label_entity_batt_dis;
    const _battDisRaw = battDisCustom ? _readVal('label_entity_batt_dis') : null;
    const battDisFinal = (_battDisRaw && !_battDisRaw.isText) ? _battDisRaw.val : battDis1;
    const battDisUnit  = battDisCustom ? _readUnit('label_entity_batt_dis') : 'kWh';

    // ── Apply overrides to stat tiles ──
    const _bT1o = getEl('bTemp1');
    if (_bT1o) {
      if (cellTempCustom) {
        if (!_cellTempRaw) { _bT1o.textContent = '--'; _bT1o.style.color = '#8b949e'; }
        else if (_cellTempRaw.isText) { _bT1o.textContent = _cellTempRaw.text; _bT1o.style.color = '#c9d1d9'; }
        else { const fmt = _fmtCustom(_cellTempRaw.val, cellTempUnit); _bT1o.textContent = fmt.text; _bT1o.style.color = fmt.color; }
      } else {
        _bT1o.textContent = temp1_1.toFixed(1) + ' / ' + temp2_1.toFixed(1) + ' °C';
        _bT1o.style.color = this._cellTempColor(Math.max(temp1_1, temp2_1));
      }
    }
    const _bT2o = getEl('bTemp2');
    if (_bT2o) {
      if (bmsTempCustom) {
        if (!_bmsTempRaw) { _bT2o.textContent = '--'; _bT2o.style.color = '#8b949e'; }
        else if (_bmsTempRaw.isText) { _bT2o.textContent = _bmsTempRaw.text; _bT2o.style.color = '#c9d1d9'; }
        else { const fmt = _fmtCustom(_bmsTempRaw.val, bmsTempUnit); _bT2o.textContent = fmt.text; _bT2o.style.color = fmt.color; }
      } else {
        _bT2o.textContent = mos1.toFixed(1) + (dual ? ' / ' + mos2.toFixed(1) : '') + ' °C';
        _bT2o.style.color = this._cellTempColor(dual ? Math.max(mos1, mos2) : mos1);
      }
    }
    const _bMno = getEl('bMinCell');
    if (_bMno) {
      if (minCellCustom) {
        if (!_minCellRaw) { _bMno.textContent = '--'; _bMno.style.color = '#8b949e'; }
        else if (_minCellRaw.isText) { _bMno.textContent = _minCellRaw.text; _bMno.style.color = '#c9d1d9'; }
        else { const fmt = _fmtCustom(_minCellRaw.val, minCellUnit); _bMno.textContent = fmt.text; _bMno.style.color = fmt.color; }
      } else {
        _bMno.textContent = minCell1.toFixed(3) + ' V';
        _bMno.style.color = this._cellVoltColor(minCell1);
      }
    }
    const _bMxo = getEl('bMaxCell');
    if (_bMxo) {
      if (maxCellCustom) {
        if (!_maxCellRaw) { _bMxo.textContent = '--'; _bMxo.style.color = '#8b949e'; }
        else if (_maxCellRaw.isText) { _bMxo.textContent = _maxCellRaw.text; _bMxo.style.color = '#c9d1d9'; }
        else { const fmt = _fmtCustom(_maxCellRaw.val, maxCellUnit); _bMxo.textContent = fmt.text; _bMxo.style.color = fmt.color; }
      } else {
        _bMxo.textContent = maxCell1.toFixed(3) + ' V';
        _bMxo.style.color = this._cellVoltColor(maxCell1);
      }
    }
    const _bDiso = getEl('bBattDis');
    if (_bDiso) {
      if (battDisCustom) {
        if (!_battDisRaw) { _bDiso.textContent = '--'; _bDiso.style.color = '#8b949e'; }
        else if (_battDisRaw.isText) { _bDiso.textContent = _battDisRaw.text; _bDiso.style.color = '#c9d1d9'; }
        else { const fmt = _fmtCustom(_battDisRaw.val, battDisUnit); _bDiso.textContent = fmt.text; _bDiso.style.color = fmt.color; }
      } else {
        _bDiso.textContent = battDis1Raw !== null ? battDis1.toFixed(2) + ' kWh' : '-- kWh';
        _bDiso.style.color = '';
      }
    }

    // ── HTML stat tile — endurance ──
    // Fix #13: remove ETA duplication — label says ETA, value shows only the duration
    const _tillStr = this._fmtTill(endHours);
    const _bEnduStat = getEl('bEnduranceStat');
    if (_bEnduStat) { _bEnduStat.textContent = endText; _bEnduStat.style.color = endColor; }
    const _bEnduStatLbl = getEl('bEnduStatLbl');
    if (_bEnduStatLbl) _bEnduStatLbl.textContent = isETA ? 'ETA' : (this.config.label_endurance || 'ENDURANCE');
    const _bEnduTimeEl = getEl('bEnduranceTime');
    if (_bEnduTimeEl) { _bEnduTimeEl.textContent = _tillStr; _bEnduTimeEl.style.color = endHours !== null ? endColor : '#8b949e'; }

    const pvBlocks = getEl('pvBlocks');
    // Fix #11: guard pvBlocks rebuild (was regenerating 20 divs on every state update)
    if (pvBlocks && pvTotal !== this._prevPvBlocksTotal) {
      this._prevPvBlocksTotal = pvTotal;
      const lit = Math.round((pvTotal / pvMax) * 20); const heights = [20, 35, 50, 60, 70, 80, 90, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]; let html = ''; for (let i = 0; i < 20; i++) html += `<div style="flex:1;background:${i < lit ? 'rgba(255,255,255,0.55)' : '#21262d'};height:${i < lit ? heights[i] : 100}%;opacity:${i < lit ? 1 : 0.35};border-radius:2px;"></div>`; pvBlocks.innerHTML = html;
    }

    // EV
    const evGroup = getEl('evGroup');
    if (evGroup) {
      if (!this.config._show_ev) {
        evGroup.style.display = 'none';
        // Fix #12: removed early return here — was silently skipping any code added after this block
      } else {
        evGroup.style.display = '';
      // Some integrations expose charger power but no compatible state entity.
      // Keep explicit states authoritative and only fall back to measured power
      // when the state is missing, unknown, or unavailable.
      const isChargingEV = chargerStateStr === 'charging' || (!chargerStateStr && chargerPower > 10);
      const isCompleted = chargerStateStr === 'completed' || chargerStateStr === 'finished';
      const evFlow = getEl('flowHomeEV');
      const evIcon = getEl('evIconImg');
      if (evFlow) {
        if (isChargingEV) {
          evFlow.setAttribute('opacity', '0.9'); evFlow.setAttribute('stroke', '#2b59ff');
          // Fix #6: always reset opacity before applying filter (was stuck at 0.3 if previously disconnected)
          if (evIcon) { evIcon.style.opacity = '1'; evIcon.setAttribute('filter', 'url(#iconGlowOrange)'); }
        } else if (isCompleted) {
          evFlow.setAttribute('opacity', '0');
          if (evIcon) { evIcon.style.opacity = '1'; evIcon.setAttribute('filter', 'url(#iconGlowGreen)'); }
        } else {
          evFlow.setAttribute('opacity', '0');
          if (evIcon) { evIcon.setAttribute('filter', ''); evIcon.style.opacity = '0.3'; }
        }
      }
      if (isChargingEV || isCompleted) {
        setText('evPowerVal', chargerPowerRaw !== null ? chargerPower.toFixed(0) + ' W' : '-- W');
        setText('evCurrentVal', chargerCurrentRaw !== null ? chargerCurrent.toFixed(1) + ' A' : '-- A');
        setText('evSocVal', chargerSocRaw !== null ? chargerSoc.toFixed(0) + ' %' : '-- %');
        let evEta = '--';
        if (isChargingEV) {
          if (chargerEtaSensor !== null && !isNaN(chargerEtaSensor)) evEta = this._fmtTime(chargerEtaSensor / 60);
          else if (chargerBattCapWh && chargerSoc > 0 && chargerPower > 0) {
            const remainingWh = chargerBattCapWh * (100 - chargerSoc) / 100;
            const hours = remainingWh / chargerPower;
            evEta = this._fmtTime(hours);
          }
        } else if (isCompleted) {
          evEta = 'Full';
        }
        setText('evEtaVal', evEta);
      } else {
        setText('evPowerVal', '-- W');
        setText('evCurrentVal', '-- A');
        setText('evSocVal', '-- %');
        setText('evEtaVal', '--');
      }
      } // end else (_show_ev)
    }
  }
}
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'k-flow-card',
  name: 'K-Flow Card',
  description: 'Real-time solar/battery/grid energy flow card with animated power paths, dual-battery support, EV charger integration, and per-tile label overrides.',
  preview: true,
  version: '1.1.0',
});
customElements.define('k-flow-card', KFlowCard);