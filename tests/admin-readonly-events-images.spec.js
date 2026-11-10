const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

test('editor Testi e grafica è solo consultazione', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../admin/src/index.html'), 'utf8');
  expect(source).toContain('Modalità sola lettura');
  expect(source).toContain("el.readOnly=true");
  expect(source).toContain("el.disabled=true");
  expect(source).toContain("form.onsubmit=e=>{e.preventDefault();return false;}");
});

test('CTA eventi centrata e immagini eventi ottimizzate prima dell’upload', async () => {
  const home = fs.readFileSync(path.join(__dirname, '../src/src/index.html'), 'utf8');
  const manager = fs.readFileSync(path.join(__dirname, '../admin/gestione-immagini.html'), 'utf8');
  expect(home).toContain('align-self:center; justify-content:center; text-align:center; margin:20px auto 0;');
  expect(manager).toContain('const optimized=await optimizeImageFile(file)');
  expect(manager).toContain('contentType:optimized.type');
});
