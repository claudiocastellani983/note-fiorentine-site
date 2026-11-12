const { test, expect } = require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');

test('Editor Testi e grafica permette testo, dimensione e stile in anteprima',()=>{
 const admin=fs.readFileSync(path.join(__dirname,'../admin/src/index.html'),'utf8');
 expect(admin).toContain('id="veText"');
 expect(admin).toContain('id="veSize" type="number"');
 expect(admin).toContain("textField.value=patch.text??receivedText");
 expect(admin).toContain("e.source!==iframe.contentWindow");
 expect(admin).toContain("VISUAL_SELECT_RECEIVED");
 expect(admin).toContain("text.addEventListener('input',()=>{textDirty=true;apply()})");
 expect(admin).toContain('if(textDirty)patch.text=text.value');
 expect(admin).toContain('...(visualStyles[selected]||{})');
 expect(admin).toContain("localStorage.setItem(visualDraftKey");
});

test('Home comunica al pannello Admin la selezione del testo e riceve le modifiche',()=>{
 const home=fs.readFileSync(path.join(__dirname,'../src/src/index.html'),'utf8');
 expect(home).toContain("e.target.closest('h1,h2,h3,p,.eyebrow,.section-kicker,.section-lead,.included,.time strong,.time small')");
 expect(home).toContain("type:'nf-visual-select'");
 expect(home).toContain("el.innerText||el.textContent||''");
 expect(home).toContain("window.parent.postMessage");
 expect(home).toContain("textContent:el.textContent||''");
 expect(home).toContain("addEventListener('message',e=>{if(e.data?.type==='nf-visual-update')apply(e.data.selector,e.data.patch)}");
});
