const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

test('editor Testi e grafica resta modificabile e offre controlli grafici', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../admin/src/index.html'), 'utf8');
  expect(source).toContain('siteEditorForm');
  expect(source).toContain('id="veWidth"');
  expect(source).toContain('id="veFit"');
  expect(source).not.toContain('Modalità sola lettura');
});

test('CTA eventi centrata e immagini eventi ottimizzate prima dell’upload', async () => {
  const home = fs.readFileSync(path.join(__dirname, '../src/src/index.html'), 'utf8');
  const manager = fs.readFileSync(path.join(__dirname, '../admin/gestione-immagini.html'), 'utf8');
  expect(home).toContain('id="nf-event-cta-centering-v1"');
  expect(home).toContain('#eventList .event-action{display:table;margin:20px auto 0;text-align:center}');
  expect(manager).toContain('const optimized=await optimizeImageFile(file)');
  expect(manager).toContain('contentType:optimized.type');
});
