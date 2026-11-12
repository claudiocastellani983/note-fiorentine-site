const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test.describe('Supporto Vimeo e YouTube nelle sezioni video', () => {
  const home = read('src/src/index.html');
  const menu = read('src/src/menu.html');
  const admin = read('admin/src/index.html');
  const imageAdmin = read('admin/gestione-immagini.html');
  const migration = read('supabase/migrations/20261111_video_url_vimeo_support.sql');

  test('Admin salva e verifica i link dei video ambienti senza sovrapporre il campo legacy', () => {
    expect(admin).toContain("'Video ambienti':{table:'restaurant_videos'");
    expect(admin).toContain("'video_url','Link video Vimeo/YouTube','url',1");
    expect(admin).toContain("if(current==='Video ambienti')");
    expect(admin).toContain("obj.youtube_url=null");
    expect(admin).toContain("selectedFields=current==='Musica dal vivo'?'id,title,description,video_path,video_url,updated_at,sort_order,is_published':'id,title,description,youtube_url,video_url,video_orientation,updated_at,sort_order,is_published'");
    expect(admin).toContain("['title','description','youtube_url','video_url','video_orientation','sort_order','is_published']");
    expect(admin).toContain("current==='Musica dal vivo'||current==='Video ambienti'");
    expect(admin).toContain("'vimeo.com','player.vimeo.com'");
  });

  test('Gestione immagini accetta Vimeo e YouTube per artisti e ambienti', () => {
    expect(imageAdmin).toContain('function extractVimeo(value)');
    expect(imageAdmin).toContain("url.protocol!=='https:'");
    expect(imageAdmin).toContain('https://player.vimeo.com/video/');
    expect(imageAdmin).toContain('Link Vimeo o YouTube');
    expect(imageAdmin).toContain("'id,title,video_path,video_url,sort_order,is_published,created_at'");
    expect(imageAdmin).toContain("video_url:youtubeUrl.value.trim()");
    expect(imageAdmin).toContain("video_url:url");
    expect(imageAdmin).toContain("externalVideoSource(videoSource)");
    expect(imageAdmin).toContain("item.video_url||item.video_path");
    expect(imageAdmin).toContain("item.video_url||item.youtube_url");
  });

  test('Home integra Vimeo e YouTube nella galleria video degli artisti', () => {
    expect(home).toContain("data-artist-gallery=\"videos\"");
    expect(home).toContain("function externalVideoEmbed(value)");
    expect(home).toContain("item.video_url||item.video_path");
    expect(home).toContain("video_path,video_url,video_orientation");
    expect(home).toContain("https://player.vimeo.com/video/");
    expect(home).toContain("https://www.youtube-nocookie.com/embed/");
    expect(home).toContain("frame.loading='eager'");
    expect(home).toContain("frame.allowFullscreen=true");
    expect(home).toContain("Compatibilità con lo schema legacy prima dell'applicazione della migrazione video_url.");
    expect(home).toContain("Il collegamento di questo video non è valido o non è supportato.");
  });

  test('Menu supporta Vimeo nella sezione delle performance', () => {
    expect(menu).toContain('video_path,video_url,translations');
    expect(menu).toContain('https://player.vimeo.com/video/');
    expect(menu).toContain("media=document.createElement('iframe')");
    expect(menu).toContain("media=document.createElement('video')");
  });

  test('La migrazione conserva le colonne legacy e rende facoltativo youtube_url', () => {
    expect(migration).toMatch(/alter table public\.performance_videos\s+add column if not exists video_url text;/);
    expect(migration).toMatch(/alter table public\.restaurant_videos\s+add column if not exists video_url text;/);
    expect(migration).toContain('youtube_url resta disponibile');
    expect(migration).toContain('alter column youtube_url drop not null');
  });
});
