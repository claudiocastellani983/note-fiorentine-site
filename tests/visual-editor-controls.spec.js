const { test, expect } = require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
test('Editor Testi e grafica mantiene i campi contenuto modificabili',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../admin/src/index.html'),'utf8');
 expect(s).toContain('siteEditorForm');
 expect(s).toContain('veWidth');
 expect(s).toContain('veFit');
 expect(s).not.toContain("Modalità sola lettura");
});
test('Editor visuale consente di selezionare testo, pulsanti e immagini e regolare posizione/dimensione',()=>{
 const h=fs.readFileSync(path.join(__dirname,'../src/src/index.html'),'utf8');
 expect(h).toContain('button,a,img');
 expect(h).toContain('tagName:el.tagName');
 expect(h).toContain('el.style.width=p.width');
 expect(h).toContain('el.style.marginLeft=p.marginLeft');
});
