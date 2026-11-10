// Ottimizzatore archivio immagini: un solo comando, sostituzione verificata e originali conservati.
export function mountStorageOptimizer({ db, root, readOnly, environment = 'configurato' }) {
  if (!root || root.dataset.optimizerMounted === '1') return;
  root.dataset.optimizerMounted = '1';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const formatBytes = bytes => {
    const value = Number(bytes);
    if (!Number.isFinite(value)) return '—';
    return value >= 1048576 ? (value / 1048576).toFixed(2) + ' MB' : (value / 1024).toFixed(0) + ' KB';
  };
  const eligible = file => /^image\/(jpeg|png|webp)$/i.test(file.mime || '') ||
    /\.(jpe?g|png|webp)$/i.test(file.name || '');
  const tables = [
    { table: 'site_images', key: 'id', column: 'image_path', type: 'text' },
    { table: 'gallery_images', key: 'id', column: 'image_path', type: 'text' },
    { table: 'artist_images', key: 'id', column: 'image_path', type: 'text' },
    { table: 'events', key: 'id', column: 'image_path', type: 'text' },
    { table: 'homepage_popup', key: 'id', column: 'media_files', type: 'json' },
    { table: 'site_content', key: 'content_key', column: 'content_value', type: 'json' }
  ];
  const state = { files: [], candidates: [], scanned: false, busy: false };

  root.innerHTML = '<section class="site-group" id="storageOptimizer">' +
    '<h3>Ottimizzazione archivio immagini</h3>' +
    '<p class="media-note">Un solo clic: individua le immagini collegate al sito che superano 1 MB, crea copie WebP, le verifica e aggiorna i riferimenti nel database. Gli originali restano conservati come backup.</p>' +
    '<p class="media-note"><strong>Ambiente:</strong> Supabase ' + esc(environment) + '. L’ottimizzazione automatica resta disabilitata in produzione; inventario e gestione archivio restano disponibili.</p>' +
    '<div class="site-savebar"><button type="button" id="optimizerRun" class="primary">Ottimizza e sostituisci immagini</button>' +
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
          output.push({ name: entry.name, path, mime, size: Number(entry.metadata?.size || 0) });
        }
      }
      if (entries.length < 100) break;
    }
    return output;
  }

  function pathMatches(value, path) {
    if (typeof value !== 'string') return false;
    let decoded = value;
    try { decoded = decodeURIComponent(value); } catch (_) {}
    return decoded === path || decoded.endsWith('/' + path) ||
      decoded.includes('/' + path + '?') || decoded.includes('/' + path + '#');
  }

  function replaceNested(value, oldPath, newPath, newUrl) {
    if (typeof value === 'string') {
      if (!pathMatches(value, oldPath)) return { value, count: 0 };
      const isUrl = /^https?:\/\//i.test(value);
      return { value: isUrl ? newUrl : newPath, count: 1 };
    }
    if (Array.isArray(value)) {
      let count = 0;
      const next = value.map(item => {
        const result = replaceNested(item, oldPath, newPath, newUrl);
        count += result.count;
        return result.value;
      });
      return { value: next, count };
    }
    if (value && typeof value === 'object') {
      let count = 0;
      const next = {};
      for (const [key, item] of Object.entries(value)) {
        const result = replaceNested(item, oldPath, newPath, newUrl);
        next[key] = result.value;
        count += result.count;
      }
      return { value: next, count };
    }
    return { value, count: 0 };
  }

  async function collectReferences() {
    const references = [];
    const pageSize = 500;
    for (const spec of tables) {
      for (let offset = 0; ; offset += pageSize) {
        const result = await db.from(spec.table)
          .select(spec.key + ',' + spec.column)
          .range(offset, offset + pageSize - 1);
        if (result.error) throw new Error('Lettura riferimenti ' + spec.table + ': ' + result.error.message);
        const rows = result.data || [];
        for (const row of rows) {
          references.push({ ...spec, keyValue: row[spec.key], oldValue: row[spec.column] });
        }
        if (rows.length < pageSize) break;
      }
    }
    return references;
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
      const result = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
      if (!result) throw new Error('Conversione WebP non riuscita.');
      return { blob: result, width: canvas.width, height: canvas.height,
        savings: Math.max(0, 1 - result.size / blob.size) };
    } finally { bitmap?.close?.(); }
  }

  async function updateReferences(file, newPath, newUrl, references) {
    const changes = [];
    try {
      for (const ref of references) {
        let nextValue, count = 0;
        if (ref.type === 'text') {
          if (!pathMatches(ref.oldValue, file.path)) continue;
          nextValue = /^https?:\/\//i.test(ref.oldValue) ? newUrl : newPath;
          count = 1;
        } else {
          const replaced = replaceNested(ref.oldValue, file.path, newPath, newUrl);
          nextValue = replaced.value;
          count = replaced.count;
        }
        if (!count) continue;
        changes.push({ ...ref, newValue: nextValue });
        const result = await db.from(ref.table).update({ [ref.column]: nextValue })
          .eq(ref.key, ref.keyValue).select(ref.key);
        if (result.error) throw new Error('Aggiornamento ' + ref.table + ': ' + result.error.message);
        if (!result.data || result.data.length !== 1) {
          throw new Error('Aggiornamento non verificato in ' + ref.table + ' per il riferimento ' + file.path);
        }
      }
      return changes;
    } catch (error) {
      const rollbackErrors = await rollback(changes);
      if (rollbackErrors.length) throw new Error((error.message || String(error)) +
        ' Ripristino parziale: ' + rollbackErrors.join('; '));
      throw error;
    }
  }

  async function rollback(changes) {
    const errors = [];
    for (const change of [...changes].reverse()) {
      const result = await db.from(change.table).update({ [change.column]: change.oldValue })
        .eq(change.key, change.keyValue).select(change.key);
      if (result.error || !result.data || result.data.length !== 1) {
        errors.push(change.table + '/' + change.keyValue + ': ' + (result.error?.message || 'verifica fallita'));
      }
    }
    return errors;
  }

  async function verifyReferences(file, references) {
    for (const ref of references) {
      const result = await db.from(ref.table).select(ref.key + ',' + ref.column).eq(ref.key, ref.keyValue);
      if (result.error) throw new Error('Verifica riferimenti ' + ref.table + ': ' + result.error.message);
      const row = result.data?.[0];
      if (!row) throw new Error('Riga non più disponibile in ' + ref.table);
      const value = row[ref.column];
      if (ref.type === 'text' ? pathMatches(value, file.path) :
        replaceNested(value, file.path, '', '').count > 0) {
        throw new Error('Riferimento originale ancora presente in ' + ref.table);
      }
    }
  }

  async function run() {
    if (readOnly) return status('Sola lettura: funzione non disponibile in questo ambiente.');
    if (state.busy) return;
    state.busy = true;
    const button = $('optimizerRun');
    button.disabled = true;
    $('optimizerResults').innerHTML = '';
    $('optimizerSummary').textContent = '';
    const created = [];
    let replaced = 0, skipped = 0, savedBytes = 0;
    try {
      status('1/5 · Analisi archivio e riferimenti nel database '+esc(environment)+'…');
      const [allFiles, references] = await Promise.all([listFolder(), collectReferences()]);
      const files = allFiles.filter(file => eligible(file) && file.size > 1024 * 1024);
      const candidates = files.map(file => ({
        ...file,
        refs: references.filter(ref => ref.type === 'text'
          ? pathMatches(ref.oldValue, file.path)
          : replaceNested(ref.oldValue, file.path, '', '').count > 0)
      })).filter(file => file.refs.length > 0);
      state.files = candidates;
      if (!candidates.length) {
        $('optimizerSummary').textContent = allFiles.length + ' immagini rilevate · ' +
          files.length + ' oltre 1 MB · 0 collegate al database. Nessuna modifica eseguita.';
        status('Nessuna immagine collegata da ottimizzare.');
        return;
      }

      for (let index = 0; index < candidates.length; index++) {
        const file = candidates[index];
        status('2/5 · Ottimizzazione ' + (index + 1) + '/' + candidates.length + ': ' + file.path);
        if (file.size > 25 * 1024 * 1024) {
          skipped++;
          file.result = 'Saltata: file oltre 25 MB, richiede controllo dedicato.';
          continue;
        }
        const downloaded = await db.storage.from('site-media').download(file.path);
        if (downloaded.error) throw new Error('Download ' + file.path + ': ' + downloaded.error.message);
        const converted = await optimize(downloaded.data);
        if (converted.blob.size >= file.size * 0.97) {
          skipped++;
          file.result = 'Saltata: risparmio inferiore al 3%.';
          continue;
        }

        const newPath = 'optimization-review/' + file.path + '.' + Date.now() + '.webp';
        status('3/5 · Caricamento e verifica della nuova immagine…');
        const uploaded = await db.storage.from('site-media').upload(newPath, converted.blob, {
          contentType: 'image/webp', upsert: false, cacheControl: '31536000'
        });
        if (uploaded.error) throw new Error('Upload WebP ' + newPath + ': ' + uploaded.error.message);
        created.push(newPath);

        const checked = await db.storage.from('site-media').download(newPath);
        if (checked.error || !checked.data) throw new Error('La copia WebP non è scaricabile: ' + newPath);
        if (checked.data.type && checked.data.type !== 'image/webp') throw new Error('La copia caricata non è WebP.');
        let checkBitmap;
        try {
          checkBitmap = await createImageBitmap(checked.data);
          if (!checkBitmap.width || !checkBitmap.height) throw new Error('La copia WebP non è decodificabile.');
        } finally { checkBitmap?.close?.(); }
        if (checked.data.size >= file.size * 0.97) throw new Error('La copia verificata non è sufficientemente più leggera.');

        const newUrl = db.storage.from('site-media').getPublicUrl(newPath).data.publicUrl;
        status('4/5 · Aggiornamento riferimenti nel database '+esc(environment)+'…');
        const changes = await updateReferences(file, newPath, newUrl, file.refs);
        if (!changes.length) throw new Error('Nessun riferimento aggiornato: sostituzione annullata.');
        try {
          await verifyReferences(file, changes);
        } catch (error) {
          const rollbackErrors = await rollback(changes);
          if (rollbackErrors.length) throw new Error(error.message + ' Ripristino incompleto: ' + rollbackErrors.join('; '));
          throw error;
        }
        file.newPath = newPath;
        file.outputSize = checked.data.size;
        file.savings = 1 - checked.data.size / file.size;
        file.result = 'Sostituita · ' + changes.length + ' riferimenti aggiornati';
        replaced++;
        savedBytes += file.size - checked.data.size;
      }

      status('5/5 · Controllo finale completato.');
      $('optimizerSummary').textContent = allFiles.length + ' immagini totali · ' + files.length +
        ' oltre 1 MB · ' + replaced + ' sostituite · ' + skipped + ' saltate · risparmio ' +
        formatBytes(savedBytes) + '. Originali conservati come backup.';
      $('optimizerResults').innerHTML = candidates.map(file =>
        '<article class="media-card"><b>' + esc(file.path) + '</b><p class="media-note">' +
        formatBytes(file.size) + ' · ' + esc(file.result || 'Non elaborata') +
        (file.newPath ? '<br>Nuovo file: ' + esc(file.newPath) + '<br>Riduzione: ' +
          Math.round(file.savings * 100) + '% · ' + formatBytes(file.outputSize) : '') +
        '</p></article>'
      ).join('');
      status('Operazione conclusa. ' + replaced + ' immagini sostituite; originali intatti.');
    } catch (error) {
      $('optimizerSummary').textContent = 'Operazione interrotta. ' + replaced +
        ' immagini già sostituite prima dell’errore; le immagini originali restano conservate. ' +
        (created.length ? created.length + ' copie WebP di sicurezza restano in optimization-review.' : '');
      status('Errore: ' + (error.message || String(error)));
    } finally {
      state.busy = false;
      button.disabled = false;
    }
  }

  $('optimizerRun').addEventListener('click', run);
  if (readOnly) {
    $('optimizerRun').disabled = true;
    $('optimizerRun').title = 'Ottimizzazione automatica disabilitata in questo ambiente.';
  }
}
