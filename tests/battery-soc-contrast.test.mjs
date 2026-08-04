import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../dist/k-flow-card.js', import.meta.url), 'utf8');
const registry = new Map();
class FakeHTMLElement {
  attachShadow() {
    this.shadowRoot = { innerHTML: '', getElementById: () => null };
    return this.shadowRoot;
  }
}
const context = vm.createContext({
  console,
  Date,
  HTMLElement: FakeHTMLElement,
  window: { customCards: [] },
  customElements: { define: (name, klass) => registry.set(name, klass) },
});
vm.runInContext(source, context);
const KFlowCard = registry.get('k-flow-card');

for (const soc of [0, 20, 40, 54, 75, 100]) {
  test(`battery SOC remains readable at ${soc}%`, () => {
    const card = new KFlowCard();
    assert.equal(card._battFill(soc).textColor, '#fff');
  });
}

test('battery SOC labels have a dark contrast outline', () => {
  for (const id of ['fcBattVal', 'fcBattVal1', 'fcBattVal2']) {
    const tag = source.match(new RegExp(`<text id="${id}"[^>]+>`))?.[0] ?? '';
    assert.match(tag, /paint-order:\s*stroke fill/);
    assert.match(tag, /stroke:\s*#0d1117/);
  }
});
