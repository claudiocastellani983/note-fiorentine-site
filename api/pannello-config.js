module.exports = function handler(req, res) {
  const supabaseUrl = process.env.NF_PANEL_SUPABASE_URL;
  const supabaseAnonKey = process.env.NF_PANEL_SUPABASE_ANON_KEY;
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!supabaseUrl || !supabaseAnonKey) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: 'Pannello 2.0 non ancora abilitato per questo ambiente.' }));
  }
  res.statusCode = 200;
  return res.end(JSON.stringify({ supabaseUrl, supabaseAnonKey }));
};
