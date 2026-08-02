import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class FakeElement {
  constructor() {
    this.attributes = {};
    this.style = {};
    this.textContent = '';
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  querySelector() {
    return null;
  }
}

const elements = Object.fromEntries(
  [
    'evGroup',
    'flowHomeEV',
    'evIconImg',
    'evPowerVal',
    'evCurrentVal',
    'evSocVal',
    'evEtaVal',
  ].map((id) => [id, new FakeElement()]),
);

const shadowRoot = {
  innerHTML: '',
  getElementById(id) {
    return elements[id] ?? null;
  },
};

class FakeHTMLElement {
  attachShadow() {
    this.shadowRoot = shadowRoot;
    return shadowRoot;
  }
}

const registry = new Map();
const context = vm.createContext({
  console,
  Date,
  HTMLElement: FakeHTMLElement,
  window: { customCards: [] },
  customElements: {
    define(name, klass) {
      registry.set(name, klass);
    },
  },
});

const source = fs.readFileSync(new URL('../dist/k-flow-card.js', import.meta.url), 'utf8');
vm.runInContext(source, context);

const KFlowCard = registry.get('k-flow-card');
assert.ok(KFlowCard, 'k-flow-card should register itself');

const card = new KFlowCard();
card.config = {
  _show_ev: true,
  charger_power: 'sensor.sem_ev_power',
  // SEM can provide EV power without exposing a K-Flow-compatible
  // charger state entity. This reproduces the Zaptec/SEM setup.
  charger_state: '',
};
card._hass = {
  states: {
    'sensor.sem_ev_power': {
      state: '6.9',
      attributes: { unit_of_measurement: 'kW' },
    },
  },
};

card._updateDynamic();

assert.equal(elements.evGroup.style.display, '', 'EV group should remain visible');
assert.equal(
  elements.flowHomeEV.attributes.opacity,
  '0.9',
  'positive charger power should activate the EV flow when no state entity is configured',
);
assert.equal(elements.evPowerVal.textContent, '6900 W');
assert.equal(elements.evCurrentVal.textContent, '-- A', 'an unconfigured optional current sensor must not be shown as 0 A');
assert.equal(elements.evSocVal.textContent, '-- %', 'an unconfigured optional SOC sensor must not be shown as 0%');
assert.equal(elements.evIconImg.style.opacity, '1');

function resetEvElements() {
  for (const element of Object.values(elements)) {
    element.attributes = {};
    element.style = {};
    element.textContent = '';
  }
}

resetEvElements();
const disconnectedCard = new KFlowCard();
disconnectedCard.config = {
  _show_ev: true,
  charger_power: 'sensor.sem_ev_power',
  charger_state: 'sensor.charger_state',
};
disconnectedCard._hass = {
  states: {
    'sensor.sem_ev_power': {
      state: '6.9',
      attributes: { unit_of_measurement: 'kW' },
    },
    'sensor.charger_state': { state: 'disconnected', attributes: {} },
  },
};
disconnectedCard._updateDynamic();
assert.equal(
  elements.flowHomeEV.attributes.opacity,
  '0',
  'an explicit non-charging state should remain authoritative',
);
assert.equal(elements.evPowerVal.textContent, '-- W');

resetEvElements();
const chargingCard = new KFlowCard();
chargingCard.config = {
  _show_ev: true,
  charger_power: 'sensor.sem_ev_power',
  charger_state: 'sensor.charger_state',
};
chargingCard._hass = {
  states: {
    'sensor.sem_ev_power': {
      state: '0',
      attributes: { unit_of_measurement: 'W' },
    },
    'sensor.charger_state': { state: 'charging', attributes: {} },
  },
};
chargingCard._updateDynamic();
assert.equal(elements.flowHomeEV.attributes.opacity, '0.9');
assert.equal(elements.evPowerVal.textContent, '0 W');

resetEvElements();
const unavailableStateCard = new KFlowCard();
unavailableStateCard.config = {
  _show_ev: true,
  charger_power: 'sensor.sem_ev_power',
  charger_state: 'sensor.charger_state',
};
unavailableStateCard._hass = {
  states: {
    'sensor.sem_ev_power': {
      state: '6900',
      attributes: { unit_of_measurement: 'W' },
    },
    'sensor.charger_state': { state: 'unavailable', attributes: {} },
  },
};
unavailableStateCard._updateDynamic();
assert.equal(
  elements.flowHomeEV.attributes.opacity,
  '0.9',
  'positive measured power should be used when the configured state entity is unavailable',
);
assert.equal(elements.evPowerVal.textContent, '6900 W');

resetEvElements();
const unknownStateCard = new KFlowCard();
unknownStateCard.config = {
  _show_ev: true,
  charger_power: 'sensor.sem_ev_power',
  charger_state: 'sensor.charger_state',
};
unknownStateCard._hass = {
  states: {
    'sensor.sem_ev_power': {
      state: '6900',
      attributes: { unit_of_measurement: 'W' },
    },
    'sensor.charger_state': { state: 'unknown', attributes: {} },
  },
};
unknownStateCard._updateDynamic();
assert.equal(elements.flowHomeEV.attributes.opacity, '0.9');

resetEvElements();
const telemetryCard = new KFlowCard();
telemetryCard.config = {
  _show_ev: true,
  charger_power: 'sensor.ev_power',
  charger_current: 'sensor.ev_current',
  charger_soc: 'sensor.ev_soc',
  charger_eta: 'sensor.ev_eta',
  charger_state: 'sensor.charger_state',
};
telemetryCard._hass = {
  states: {
    'sensor.ev_power': { state: '6.9', attributes: { unit_of_measurement: 'kW' } },
    'sensor.ev_current': { state: '10.5', attributes: { unit_of_measurement: 'A' } },
    'sensor.ev_soc': { state: '42', attributes: { unit_of_measurement: '%' } },
    'sensor.ev_eta': { state: '90', attributes: { unit_of_measurement: 'min' } },
    'sensor.charger_state': { state: 'charging', attributes: {} },
  },
};
telemetryCard._updateDynamic();
assert.equal(elements.evPowerVal.textContent, '6900 W');
assert.equal(elements.evCurrentVal.textContent, '10.5 A');
assert.equal(elements.evSocVal.textContent, '42 %');
assert.equal(elements.evEtaVal.textContent, '1h 30m');

const layoutCard = new KFlowCard();
layoutCard.setConfig({ _show_ev: true });
const svgMarkup = layoutCard.shadowRoot.innerHTML;
const viewBoxMatch = svgMarkup.match(/viewBox="[^"]*\s([\d.]+)"/);
assert.ok(viewBoxMatch, 'flow SVG should define a viewBox');
const viewBoxHeight = Number(viewBoxMatch[1]);
for (const id of ['evPowerVal', 'evCurrentVal', 'evSocVal', 'evEtaVal']) {
  const yMatch = svgMarkup.match(new RegExp(`id="${id}"[^>]*\\sy="([\\d.]+)"`));
  assert.ok(yMatch, `${id} should define a y coordinate`);
  assert.ok(
    Number(yMatch[1]) <= viewBoxHeight,
    `${id} at y=${yMatch[1]} must fit inside the SVG viewBox height ${viewBoxHeight}`,
  );
}
