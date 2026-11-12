const { test, expect } = require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');

test('Editor Testi e grafica permette testo, dimensione e stile in anteprima',()=>{
 const admin=fs.readFileSync(path.join(__dirname,'../admin/src/index.html'),'utf8');
 expect(admin).toContain('id="veText"');
 expect(admin).toContain("textDirty=false,selectedTag='P'");
 expect(admin).not.toContain("let selectedTag='P';");
 expect(admin).toContain('id="veSize" type="number"');
 expect(admin).toContain("textField.value=patch.text??receivedText");
 expect(admin).toContain("e.source!==iframe.contentWindow");
 expect(admin).toContain("VISUAL_SELECT_RECEIVED");
 expect(admin).toContain("text.addEventListener('input',()=>{textDirty=true;apply()})");
 expect(admin).toContain('if(textDirty)patch.text=text.value');
 expect(admin).toContain('...(visualStyles[selected]||{})');
 expect(admin).toContain("localStorage.setItem(visualDraftKey");
 expect(admin).toContain("function normalizeVisualStyles(input)");
 expect(admin).toContain("id=\"veColorHex\"");
 expect(admin).toContain("id=\"veAddColor\"");
 expect(admin).toContain("function normalizeVisualPalette(input)");
 expect(admin).toContain("value._visual_palette=normalizeVisualPalette(visualPalette)");
 expect(admin).toContain("persistedPalette");
 expect(admin).toContain("nf-visual-palette-v1");
 expect(admin).toContain("...normalizeVisualStyles(value._visual_styles)");
 expect(admin).toContain("normalizeVisualStyles(verify.data?.content_value?._visual_styles||{})");
});

test('Home comunica al pannello Admin la selezione del testo e riceve le modifiche',()=>{
 const home=fs.readFileSync(path.join(__dirname,'../src/src/index.html'),'utf8');
 expect(home).toContain("const candidates='h1,h2,h3,p,.eyebrow,.section-kicker,.section-lead,.included,.time strong,.time small'");
 expect(home).toContain("e.composedPath()");
 expect(home).toContain("type:'nf-visual-select'");
 expect(home).toContain("el.innerText||el.textContent||''");
 expect(home).toContain("window.parent.postMessage");
 expect(home).toContain("textContent:el.textContent||''");
 expect(home).toContain("type:'nf-visual-applied'");
 expect(home).toContain("setProperty(name,String(value),'important')");
 expect(home).toContain("actual={fontSize:cs.fontSize,fontFamily:cs.fontFamily,color:cs.color,textFillColor:cs.webkitTextFillColor,textAlign:cs.textAlign}");
 expect(home).toContain("set('-webkit-text-fill-color',p.color)");
 expect(home).toContain("if(typeof p==='string')");
});

test('Home applica davvero font, dimensione e colore anche sopra regole CSS important',async({page})=>{
 await page.goto('/?visual-editor=1');
 await page.addStyleTag({content:'#nf-playwright-visual-target{font-size:72px!important;font-family:Arial,sans-serif!important;color:rgb(0,0,0)!important;-webkit-text-fill-color:rgb(0,0,0)!important}'});
 const result=await page.evaluate(()=>new Promise(resolve=>{
  const el=document.querySelector('h1');
  if(!el){resolve({error:'Nessun h1 trovato'});return;}
  el.id='nf-playwright-visual-target';
  const handler=e=>{
   if(e.data?.type!=='nf-visual-applied')return;
   window.removeEventListener('message',handler);
   const cs=getComputedStyle(el);
   resolve({applied:e.data.applied,fontSize:cs.fontSize,fontFamily:cs.fontFamily,color:cs.color,textFillColor:cs.webkitTextFillColor});
  };
  window.addEventListener('message',handler);
  window.postMessage({type:'nf-visual-update',selector:'#nf-playwright-visual-target',patch:{fontSize:'37px',fontFamily:'Georgia,serif',color:'#ff0000'},sequence:987},'*');
  setTimeout(()=>{window.removeEventListener('message',handler);resolve({error:'Timeout conferma anteprima'});},2000);
 }));
 expect(result.error).toBeUndefined();
 expect(result.applied).toBe(true);
 expect(result.fontSize).toBe('37px');
 expect(result.fontFamily.toLowerCase()).toContain('georgia');
 expect(result.color).toBe('rgb(255, 0, 0)');
 expect(result.textFillColor).toBe('rgb(255, 0, 0)');
});
