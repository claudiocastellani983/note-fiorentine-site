(()=>{
'use strict';
const KEY='nf-release-drafts-v1', DB='nf-release-assets-v1', STORE='assets';
const $=id=>document.getElementById(id);
let drafts=readDrafts(), dbPromise=null;
function readDrafts(){try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[]}catch(_){return[]}}
function persist(){localStorage.setItem(KEY,JSON.stringify(drafts));render()}
function openDb(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});return dbPromise}
async function putAsset(id,file){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(file,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function getAsset(id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(id);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)})}
async function deleteAsset(id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
function fileRef(file){return {name:file.name,type:file.type||'application/octet-stream',size:file.size,lastModified:file.lastModified}}
async function captureFiles(files){const refs=[];for(const file of files){if(!file||!file.name)continue;const id=crypto.randomUUID();await putAsset(id,file);refs.push({...fileRef(file),assetId:id})}return refs}
function fieldValue(el){if(el.type==='checkbox')return el.checked;if(el.type==='file')return undefined;return el.value}
async function formPayload(form){const fields={};for(const el of form.querySelectorAll('input[name],textarea[name],select[name],[data-site-field],[data-site-en-field]')){const key=el.name||el.dataset.siteField||el.dataset.siteEnField;if(!key||el.type==='file')continue;fields[key]=fieldValue(el)}
const files=[];for(const el of form.querySelectorAll('input[type=file]')){if(el.files?.length){const refs=await captureFiles([...el.files]);files.push({field:el.name||el.dataset.siteImage||el.dataset.imfile||'file',files:refs})}}
return {fields,files}}
function stage(type,section,payload){const item={id:crypto.randomUUID(),type,section:section||'Generale',createdAt:new Date().toISOString(),payload};drafts.push(item);persist();status('Bozza salvata localmente: '+item.section+'. Nessuna modifica online.');return item}
function status(s){const el=$('status');if(el)el.textContent=s;const dbg=window.__NF_DEBUG;if(dbg?.setStatus)dbg.setStatus(s)}
function render(){
 let panel=$('nfDraftPanel');if(!panel){const app=$('app');if(!app)return;panel=document.createElement('section');panel.id='nfDraftPanel';panel.className='panel';panel.style.cssText='border-color:#c5a16b';const top=app.querySelector('.panel');if(top)top.insertAdjacentElement('afterend',panel);else app.prepend(panel)}
 const count=drafts.length;
 panel.innerHTML='<div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap"><div><strong style="color:var(--gold)">Release in preparazione</strong><p class="muted" style="margin:5px 0">Bozze conservate su questo dispositivo. Non vengono inviate al sito o a Supabase.</p><span class="status">'+count+' modifiche in attesa di revisione</span></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="nfDraftExport" class="primary">Esporta pacchetto</button><button type="button" id="nfDraftReview">Rivedi bozze</button><button type="button" id="nfDraftClear" class="danger">Svuota bozze</button></div></div><p class="media-note" style="margin:10px 0 0">Il pacchetto contiene i dati delle modifiche e gli eventuali file caricati. È un dossier di revisione, non una pubblicazione automatica.</p>';
 $('nfDraftExport').onclick=exportPackage;$('nfDraftReview').onclick=review;$('nfDraftClear').onclick=clearDrafts;
}
function review(){
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const w=window.open('','_blank','width=760,height=700');if(!w){alert(drafts.length+' bozze da rivedere.');return}
 w.document.write('<!doctype html><meta charset="utf-8"><title>Bozze Note Fiorentine</title><body style="font:15px system-ui;background:#171411;color:#f1e7d6;padding:24px"><h1 style="color:#c5a16b">Bozze · Note Fiorentine</h1><p>'+drafts.length+' modifiche in attesa</p>'+drafts.map((d,i)=>'<article style="border:1px solid #4b4033;border-radius:10px;padding:14px;margin:12px 0"><h3 style="color:#c5a16b">'+(i+1)+'. '+esc(d.section)+' — '+esc(d.type)+'</h3><small>'+esc(new Date(d.createdAt).toLocaleString())+'</small><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(JSON.stringify(d.payload,null,2))+'</pre></article>').join('')+'</body>');w.document.close()
}
function dataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob)})}
async function exportPackage(){
 const btn=$('nfDraftExport');btn.disabled=true;btn.textContent='Preparazione…';
 try{const out=[];for(const d of drafts){const item=JSON.parse(JSON.stringify(d));const refs=[];const walk=async value=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){for(const v of value)await walk(v);return}if(value.assetId){const blob=await getAsset(value.assetId);if(!blob)throw Error('File mancante: '+value.name);refs.push({assetId:value.assetId,name:value.name,type:value.type,size:value.size,data:await dataUrl(blob)});return}for(const v of Object.values(value))await walk(v)};await walk(item.payload);item.assets=refs;out.push(item)}
 const pack={format:'note-fiorentine-release-draft',version:1,createdAt:new Date().toISOString(),source:'admin-preview-local',approvalRequired:true,productionWrites:false,drafts:out};
 const blob=new Blob([JSON.stringify(pack,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='note-fiorentine-release-draft-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);status('Pacchetto bozze esportato. Non è stato pubblicato nulla.');
 }catch(e){status('Esportazione non riuscita: '+(e.message||e));}finally{btn.disabled=false;btn.textContent='Esporta pacchetto'}
}
async function clearDrafts(){if(!confirm('Eliminare tutte le bozze locali e i file associati? L’operazione non modifica il sito pubblico.'))return;for(const d of drafts){const walk=async v=>{if(!v||typeof v!=='object')return;if(Array.isArray(v)){for(const x of v)await walk(x);return}if(v.assetId)await deleteAsset(v.assetId);for(const x of Object.values(v))if(x&&typeof x==='object')await walk(x)};await walk(d.payload)}drafts=[];persist();status('Bozze locali eliminate. Il sito pubblico è invariato.')}
async function captureSubmit(e){
 const form=e.target;if(!form||form.id==='loginForm')return;
 if(!['editForm','siteEditorForm'].includes(form.id))return;
 e.preventDefault();e.stopImmediatePropagation();
 try{const payload=await formPayload(form);const section=form.id==='siteEditorForm'?'Testi e grafica':($('sectionTitle')?.textContent||'Contenuti');stage(form.id==='siteEditorForm'?'site-content':'record',section,payload);if(form.id==='editForm'){$('editor')?.classList.add('hidden')}else status('Bozza grafica salvata. Rivedila ed esporta il pacchetto quando hai terminato.')}
 catch(err){status('Bozza non salvata: '+(err.message||err))}
}
async function capturePopup(id){
 try{
  if(id==='savePopupAdmin'){const files=await captureFiles([...($('popupAdminFiles')?.files||[])]);stage('popup-settings','Popup',{active:$('popupAdminActive')?.checked,email:$('popupAdminEmail')?.value||'',files})}
  else{
   const files=await captureFiles([...($('pFiles')?.files||[])]),images=[];
   document.querySelectorAll('[data-imfile]').forEach(el=>{const id=el.dataset.imfile;images.push({id,file:el.files?.[0]||null,focal_x:document.querySelector('[data-fx="'+id+'"]')?.value,focal_y:document.querySelector('[data-fy="'+id+'"]')?.value,focal_zoom:document.querySelector('[data-fz="'+id+'"]')?.value,alt_text:document.querySelector('[data-alt="'+id+'"]')?.value})});
   const imageFiles=[];for(const x of images)if(x.file){const [ref]=await captureFiles([x.file]);imageFiles.push({id:x.id,file:ref,focal_x:x.focal_x,focal_y:x.focal_y,focal_zoom:x.focal_zoom,alt_text:x.alt_text})}else imageFiles.push({...x,file:null});
   stage('popup-and-media','Immagini e popup',{active:$('pActive')?.checked,title_it:$('pTitleIt')?.value,title_en:$('pTitleEn')?.value,body_it:$('pBodyIt')?.value,body_en:$('pBodyEn')?.value,button_label_it:$('pButtonIt')?.value,button_label_en:$('pButtonEn')?.value,email:$('pEmail')?.value,files,imageFiles});
  }
 }catch(err){status('Bozza popup non salvata: '+(err.message||err))}
}
document.addEventListener('submit',captureSubmit,true);
document.addEventListener('click',async e=>{
 const btn=e.target.closest('button');if(!btn)return;
 if(btn.id==='savePopupAdmin'||btn.id==='saveMedia'){e.preventDefault();e.stopImmediatePropagation();await capturePopup(btn.id);return}
 if(btn.matches('[data-del],[data-pub]')){e.preventDefault();e.stopImmediatePropagation();const item=btn.closest('.item');stage(btn.hasAttribute('data-del')?'delete-record':'toggle-publish',$('sectionTitle')?.textContent||'Contenuti',{rowIndex:btn.dataset.del??btn.dataset.pub,label:item?.querySelector('strong')?.textContent||item?.innerText||'Elemento'});return}
},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render);else render();
window.__NF_DRAFTS={count:()=>drafts.length,exportPackage,review};
})();