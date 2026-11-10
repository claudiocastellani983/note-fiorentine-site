const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('Admin editor non reintroduce i vecchi sottotitoli della copertina', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../admin/src/index.html'), 'utf8');
  expect(source).toContain("hero_kicker:'Ristorante Toscano & Live Music'");
  expect(source).not.toContain('Firenze · Ristorante toscano');
  expect(source).not.toContain('Florence · Tuscan Restaurant');
  expect(source).toContain("data._translations?.en?.[key]");
});
