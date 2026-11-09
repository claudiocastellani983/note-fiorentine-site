// Archivio immagini: analisi e copie ottimizzate non distruttive.
// Non modifica mai i riferimenti del sito e non elimina gli originali.
export function mountStorageOptimizer({ db, root, readOnly }) {
  if (!root || root.dataset.optimizerMounted === '1') return;
  root.dataset.optimizerMounted = '1';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const formatBytes = bytes => {
    if (!Number.isFinite(Number(bytes))) return '—';
    const value = Number(bytes);
    return value >= 1048576 ? (value / 1048576).toFixed(2) + ' MB' : (value / 1024).toFixed(0) + ' KB';
  };
  const eligible = file => /^image\/(jpeg|png|webp)$/i.test(file.mime || '') ||
    /\.(jpe?g|png|webp)$/i.test(file.name || '');
  const state = { files: [], candidates: [], scanned: false };

  root.innerHTML = '<section class="site-group" id="storageOptimizer">' +
    '<h3>Ottimizzazione archivio immagini</h3>' +
    '<p class="media-note">Analizza le immagini già presenti in Storage, individua quelle pesanti e prepara copie WebP in una cartella separata. Gli originali e i collegamenti del sito restano invariati.</p>' +
    '<p class="media-note"><strong>Ambiente:</strong> progetto collegato all’Admin di test. Questa procedura non accede all’archivio di produzione.</p>' +
    '<div class="site-savebar"><input type="file" id="optimizerSamples" accept="image/jpeg,image/png,image/webp" multiple style="max-width:360px"><button type="button" id="optimizerUploadSamples">Carica campioni grezzi su Test</button></div>' +
    '<p class="media-note">Per provare l’intero flusso, carica qui immagini di test originali superiori a 1 MB. I campioni vengono salvati soltanto nel bucket Test, nella cartella optimizer-input.</p>' +
    '<div class="site-savebar"><button type="button" id="optimizerScan" class="primary">1 · Analizza archivio</button>' +
    '<button type="button" id="optimizerPrepare" disabled>2 · Prepara copie ottimizzate</button>' +
    '<span id="optimizerStatus" class="status" role="status" aria-live="polite"></span></div>' +
    '<div id="optimizerSummary" class="media-note" style="margin-top:12px"></div>' +
    '<div id="optimizerResults" class="media-grid"></div></section>';
  const $ = id => root.querySelector('#' + id);
  const status = message => { $('optimizerStatus').textContent = message; };

  async function listFolder(prefix = '', depth = 0) {
    if (depth > 6) throw new Error('Struttura cartelle troppo profonda: interrotta per sicurezza.');
    const output = [];
    for (let offset = 0; ; offset += 100) {
      const response = await db.storage.from('site-media').list(prefix, {
        limit: 100, offset, sortBy: { column: 'name', order: 'asc' }
      });
      if (response.error) throw response.error;
      const entries = response.data || [];
      for (const entry of entries) {
        const path = prefix ? prefix + '/' + entry.name : entry.name;
        if (path === 'optimization-review' || path.startsWith('optimization-review/')) continue;
        if (!entry.id && !entry.metadata) {
          output.push(...await listFolder(path, depth + 1));
          continue;
        }
        const mime = entry.metadata?.mimetype || entry.metadata?.contentType || '';
        if (mime.startsWith('image/') || /\.(jpe?g|png|webp|gif|svg)$/i.test(entry.name)) {
          output.push({ name: entry.name, path, mime, size: Number(entry.metadata?.size || 0),
            createdAt: entry.created_at || entry.updated_at || '' });
        }
      }
      if (entries.length < 100) break;
    }
    return output;
  }

  async function collectReferences() {
    const refs = new Set();
    const addValue = value => {
      if (value == null) return;
      if (typeof value === 'string') {
        refs.add(value);
        try {
          const url = new URL(value);
          refs.add(decodeURIComponent(url.pathname.split('/').slice(-2).join('/')));
          refs.add(decodeURIComponent(url.pathname.split('/').slice(-1)[0]));
        } catch (_) {}
      } else if (Array.isArray(value)) value.forEach(addValue);
      else if (typeof value === 'object') Object.values(value).forEach(addValue);
    };
    const queries = [
      ['gallery_images', 'image_path'], ['site_images', 'image_path'],
      ['artist_images', 'image_path'], ['events', 'image_path'],
      ['homepage_popup', 'media_files'], ['site_content', 'content_value']
    ];
    for (const [table, column] of queries) {
      const result = await db.from(table).select(column);
      if (result.error) throw new Error('Lettura riferimenti ' + table + ': ' + result.error.message);
      for (const row of result.data || []) addValue(row[column]);
    }
    return refs;
  }

  function isReferenced(path, refs) {
    if (refs.has(path)) return true;
    for (const ref of refs) {
      if (typeof ref === 'string' && (ref.endsWith('/' + path) || ref.includes('/' + path + '?'))) return true;
    }
    return false;
  }

  async function uploadSamples() {
    if (readOnly) return status('Modalità sola lettura: caricamento campioni disabilitato.');
    const input = $('optimizerSamples'), button = $('optimizerUploadSamples');
    const files = [...(input.files || [])];
    if (!files.length) return status('Seleziona almeno un’immagine di prova.');
    button.disabled = true;
    try {
      let uploaded = 0;
      for (const file of files) {
        if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error('Formato non supportato: ' + file.name);
        if (file.size <= 1024 * 1024) throw new Error('Ogni campione deve superare 1 MB: ' + file.name);
        if (file.size > 15 * 1024 * 1024) throw new Error('File oltre il limite di 15 MB: ' + file.name);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        const path = 'optimizer-input/' + crypto.randomUUID() + '-' + safeName;
        const result = await db.storage.from('site-media').upload(path, file, {
          contentType: file.type, upsert: false, cacheControl: '31536000'
        });
        if (result.error) throw new Error('Upload campione ' + file.name + ': ' + result.error.message);
        uploaded++;
      }
      input.value = '';
      status(uploaded + ' campioni originali caricati nel solo progetto Test. Avvio nuova analisi…');
      await scan();
    } catch (error) {
      status('Caricamento campioni interrotto: ' + (error.message || String(error)) + '. Gli eventuali campioni già caricati restano nel progetto Test.');
    } finally { button.disabled = false; }
  }

  async function scan() {
    const button = $('optimizerScan');
    button.disabled = true;
    $('optimizerPrepare').disabled = true;
    status('Lettura file e riferimenti nel database…');
    $('optimizerResults').innerHTML = '';
    $('optimizerSummary').textContent = '';
    try {
      const [files, refs] = await Promise.all([listFolder(), collectReferences()]);
      state.files = files.filter(file => eligible(file) && file.size > 1024 * 1024)
        .map(file => ({ ...file, referenced: isReferenced(file.path, refs) }))
        .sort((a, b) => b.size - a.size);
      state.candidates = [];
      state.scanned = true;
      const total = state.files.reduce((sum, file) => sum + file.size, 0);
      const linked = state.files.filter(file => file.referenced).length;
      $('optimizerSummary').textContent = files.length + ' immagini totali rilevate · ' +
        state.files.length + ' oltre 1 MB (' + formatBytes(total) + ') · ' +
        linked + ' con riferimenti individuati nel database. I file senza riferimenti non vengono eliminati.';
      $('optimizerPrepare').disabled = readOnly || state.files.length === 0;
      render();
      status(state.files.length ? 'Analisi completata.' : 'Nessuna immagine oltre 1 MB trovata.');
    } catch (error) {
      status('Analisi non riuscita: ' + (error.message || String(error)));
    } finally {
      button.disabled = false;
    }
  }

  async function optimize(blob) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(blob);
      const width = bitmap.width, height = bitmap.height;
      if (!width || !height) throw new Error('Dimensioni immagine non valide.');
      const scale = Math.min(1, 1800 / width, 1800 / height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas non disponibile.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let outputWidth = canvas.width, outputHeight = canvas.height;
      let result = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
      if (!result) throw new Error('Conversione WebP non riuscita.');
      if (result.size >= blob.size * 0.97) {
        const smaller = document.createElement('canvas');
        const scaleDown = Math.min(1, 1500 / width, 1500 / height);
        smaller.width = Math.max(1, Math.round(width * scaleDown));
        smaller.height = Math.max(1, Math.round(height * scaleDown));
        const ctx = smaller.getContext('2d');
        if (!ctx) throw new Error('Canvas ridotto non disponibile.');
        ctx.drawImage(bitmap, 0, 0, smaller.width, smaller.height);
        const reduced = await new Promise(resolve => smaller.toBlob(resolve, 'image/webp', 0.72));
        if (reduced && reduced.size < result.size) { result = reduced; outputWidth = smaller.width; outputHeight = smaller.height; }
      }
      return { blob: result, width: outputWidth, height: outputHeight,
        savings: Math.max(0, 1 - result.size / blob.size) };
    } finally { bitmap?.close?.(); }
  }

  async function prepare() {
    if (readOnly) return status('Modalità sola lettura: copie non consentite in questo ambiente.');
    if (!state.scanned) return status('Esegui prima l’analisi.');
    const button = $('optimizerPrepare');
    button.disabled = true;
    state.candidates = [];
    let completed = 0;
    const total = state.files.length;
    try {
      for (const file of state.files) {
        completed++;
        status('Preparazione ' + completed + '/' + total + ': ' + file.name);
        const downloaded = await db.storage.from('site-media').download(file.path);
        if (downloaded.error) throw new Error('Download ' + file.path + ': ' + downloaded.error.message);
        const converted = await optimize(downloaded.data);
        if (converted.blob.size >= file.size * 0.97) {
          state.candidates.push({ ...file, skipped: true, reason: 'Risparmio inferiore al 3%' });
          continue;
        }
        const outputPath = 'optimization-review/' + file.path + '.webp';
        const upload = await db.storage.from('site-media').upload(outputPath, converted.blob, {
          contentType: 'image/webp', upsert: false, cacheControl: '31536000'
        });
        if (upload.error) {
          if (/already exists|duplicate/i.test(upload.error.message || '')) {
            state.candidates.push({ ...file, outputPath, skipped: true, reason: 'Copia già presente' });
            continue;
          }
          throw new Error('Upload copia ' + outputPath + ': ' + upload.error.message);
        }
        state.candidates.push({ ...file, outputPath, outputSize: converted.blob.size,
          outputWidth: converted.width, outputHeight: converted.height, savings: converted.savings,
          outputUrl: db.storage.from('site-media').getPublicUrl(outputPath).data.publicUrl });
        render();
      }
      render();
      status('Completato: ' + state.candidates.filter(item => item.outputPath && !item.skipped).length +
        ' copie create. Originali e collegamenti non modificati.');
    } catch (error) {
      render();
      status('Interrotto: ' + (error.message || String(error)) +
        '. Le copie già create sono rimaste nella cartella optimization-review; nessun originale è stato toccato.');
    } finally { button.disabled = false; }
  }

  function render() {
    const host = $('optimizerResults');
    const rows = state.scanned ? state.files : [];
    host.innerHTML = rows.map(file => {
      const candidate = state.candidates.find(item => item.path === file.path);
      const url = db.storage.from('site-media').getPublicUrl(file.path).data.publicUrl;
      const result = candidate?.outputUrl
        ? '<p class="media-note">Copia: ' + esc(formatBytes(candidate.outputSize)) +
          ' · risparmio ' + Math.round(candidate.savings * 100) + '% · ' +
          candidate.outputWidth + '×' + candidate.outputHeight + '</p><a href="' + esc(candidate.outputUrl) +
          '" target="_blank" rel="noopener" style="color:var(--gold)">Apri copia WebP</a>'
        : candidate?.skipped ? '<p class="media-note">' + esc(candidate.reason) + '</p>' : '';
      return '<article class="media-card"><img class="media-preview" loading="lazy" src="' + esc(url) +
        '" alt=""><b>' + esc(file.path) + '</b><p class="media-note">' + formatBytes(file.size) +
        ' · ' + (file.referenced ? 'riferimento DB individuato' : 'nessun riferimento DB individuato') +
        '</p>' + result + '</article>';
    }).join('') || (state.scanned ? '<p class="media-note">Nessun file da mostrare.</p>' : '');
  }

  $('optimizerScan').addEventListener('click', scan);
  $('optimizerPrepare').addEventListener('click', prepare);
  $('optimizerUploadSamples').addEventListener('click', uploadSamples);
  if (readOnly) {
    $('optimizerPrepare').title = 'Disponibile solo nelle anteprime Admin abilitate alla scrittura sul progetto Test.';
    $('optimizerUploadSamples').disabled = true;
  }
}