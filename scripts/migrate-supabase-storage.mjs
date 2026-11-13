const SOURCE_URL = "https://nculgrwlzjitggjcgbpp.supabase.co";
const SOURCE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jdWxncndsemppdGdnamNnYnBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3MTQ4ODYsImV4cCI6MjEwOTI5MDg4Nn0.x7jUboKRJvpy8HTNt3rcSRA0XGxzABUwitQXR0xsJ9E";
const DESTINATION_URL = "https://qhqsxmnhbhkskwpecheu.supabase.co";
const DESTINATION_KEY = process.env.NF_DEST_SUPABASE_SERVICE_ROLE_KEY;

if (!DESTINATION_KEY) throw new Error("Manca il secret NF_DEST_SUPABASE_SERVICE_ROLE_KEY.");

const buckets = ["site-media", "performance-videos"];
const headers = { apikey: SOURCE_ANON_KEY, Authorization: `Bearer ${SOURCE_ANON_KEY}` };

async function listFolder(bucket, prefix = "") {
  const response = await fetch(`${SOURCE_URL}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } })
  });
  if (!response.ok) throw new Error(`Elenco sorgente fallito (${bucket}/${prefix}): HTTP ${response.status} ${(await response.text()).slice(0,300)}`);
  const entries = await response.json();
  if (!Array.isArray(entries)) throw new Error(`Risposta inattesa durante l'elenco di ${bucket}/${prefix}`);
  const files = [];
  for (const entry of entries) {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id == null && entry.metadata == null) {
      files.push(...await listFolder(bucket, key));
    } else {
      files.push({ bucket, key, metadata: entry.metadata ?? {} });
    }
  }
  return files;
}

function encodeObjectPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function transfer(file) {
  const source = `${SOURCE_URL}/storage/v1/object/public/${encodeURIComponent(file.bucket)}/${encodeObjectPath(file.key)}`;
  const download = await fetch(source);
  if (!download.ok) throw new Error(`Download fallito ${file.bucket}/${file.key}: HTTP ${download.status}`);
  const bytes = await download.arrayBuffer();
  const mime = file.metadata.mimetype || download.headers.get("content-type") || "application/octet-stream";
  const destination = `${DESTINATION_URL}/storage/v1/object/${encodeURIComponent(file.bucket)}/${encodeObjectPath(file.key)}`;
  const upload = await fetch(destination, {
    method: "POST",
    headers: {
      apikey: DESTINATION_KEY,
      Authorization: `Bearer ${DESTINATION_KEY}`,
      "Content-Type": mime,
      "x-upsert": "true",
      "cache-control": "max-age=31536000"
    },
    body: bytes
  });
  if (!upload.ok) throw new Error(`Upload fallito ${file.bucket}/${file.key}: HTTP ${upload.status} ${(await upload.text()).slice(0,300)}`);
  return { bucket: file.bucket, key: file.key, bytes: bytes.byteLength, mime };
}

let total = 0;
let totalBytes = 0;
for (const bucket of buckets) {
  const files = await listFolder(bucket);
  console.log(`Bucket ${bucket}: ${files.length} oggetti individuati`);
  for (const file of files) {
    const result = await transfer(file);
    total++;
    totalBytes += result.bytes;
    console.log(`OK ${result.bucket}/${result.key} — ${result.bytes} byte`);
  }
}
console.log(`TRASFERIMENTO COMPLETATO: ${total} oggetti, ${totalBytes} byte`);
