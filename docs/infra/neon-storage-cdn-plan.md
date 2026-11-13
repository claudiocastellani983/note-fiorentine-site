# Note Fiorentine — Neon Object Storage + Cloudflare Workers Free cache

## Scopo

Servire immagini e video pubblici del sito da Neon Object Storage senza esporre credenziali e senza consumare il limite Neon Free a ogni visualizzazione. R2 non è richiesto: Cloudflare viene usato solo come edge cache Worker.

## Vincoli economici

- Neon Free include 5 GB di Object Storage e 5 GB/mese di public network transfer per progetto.
- Il trasferimento pubblico Neon è condiviso fra Postgres, Object Storage e Functions. Al raggiungimento della quota Free, il compute viene sospeso fino al reset mensile o all'upgrade; non si deve effettuare upgrade automatico.
- Cloudflare Workers Free include 100.000 richieste al giorno e 10 ms CPU per invocazione. Le richieste servite dalla cache Worker contano comunque nel limite giornaliero, mentre CPU è consumata solo sui cache miss.
- Workers Caching è disponibile anche per Workers su workers.dev; non richiede R2 né una zona DNS del dominio del ristorante per il primo test.
- Non selezionare Workers Paid, non aggiungere un metodo di pagamento. Se la dashboard chiede carta o checkout per attivare il Free, fermarsi.

Fonti:
- https://neon.com/docs/introduction/plans
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/cache/

## Architettura

Browser → URL Worker pubblico `*.workers.dev/media/<object-key>` → cache edge Cloudflare → origin Neon public_read bucket.

- Il bucket Neon privato resta destinato a file amministrativi/privati.
- I file pubblici devono essere copiati in un bucket distinto con accesso `public_read`, non rendere pubblico il bucket privato.
- Il Worker inoltra solo GET/HEAD per path allowlisted; rifiuta altri metodi e traversal.
- Origin fisso: endpoint S3 del branch Neon di produzione, bucket pubblico dedicato.
- Il Worker non riceve né espone credenziali S3: legge solo oggetti public_read.
- Cache key normalizzata su path + query di versione; ignorare query tracking non funzionali.
- Risposte immagini/video con Content-Type verificato, X-Content-Type-Options nosniff, Cache-Control per browser/edge.
- TTL iniziale prudente: browser 60 secondi, edge 10 minuti; dopo aver implementato versioning degli oggetti, TTL edge può salire a 1 giorno o più.
- Gli upload admin devono creare chiavi versionate nuove (o includere un parametro versione) e aggiornare il riferimento nel database, evitando overwrite che lascino cache obsolete.
- Nessuna cache di risposte di errore, oggetti privati o richieste autenticate.

## Test richiesti prima della migrazione

1. Verificare nel dashboard Cloudflare che Workers Free sia attivabile senza metodo di pagamento.
2. Creare Worker su workers.dev in ambiente staging; non collegare DNS di notefiorentine.it.
3. Configurare origin del bucket pubblico staging Neon e fare un GET anonimo di un file di test.
4. Eseguire due GET consecutivi: primo MISS, secondo HIT; controllare header/cache status e che il secondo non generi un nuovo trasferimento dal Neon origin.
5. Verificare MIME, range request per video, 404, metodi vietati, query versioning e cache invalidation.
6. Caricare un'immagine aggiornata da admin con nuova chiave e verificare che la preview la visualizzi subito.
7. Misurare richieste Worker, cache hit ratio e trasferimento Neon durante un test di navigazione rappresentativo.
8. Verificare che i limiti Free non vengano superati; nessuna promozione a piano a pagamento.

## Stato

- Neon project staging: creato.
- Neon private bucket `note-fiorentine-media`: creato e verificato.
- Possibilità di creare bucket `public_read`: verificata via API sul branch staging; bucket temporaneo di test eliminato dopo il test di provisioning.
- Test HTTP anonimo reale: ancora non completato; l'ambiente di esecuzione corrente non ha risolto il DNS dell'endpoint storage durante il tentativo di upload del file di test.
- Cloudflare Workers: account esistente, ma non è stato creato/deployato alcun Worker.
- Nessuna modifica a Supabase Production, Vercel Production o DNS.
