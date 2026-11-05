import { Router } from 'express';
import { first, query, transaction, nowUtc } from '../db.js';
import { baseUrl } from '../lib/catalog.js';
import { fail } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { cleanSection, pageDefinition, readPages, savePage, storePageImage } from '../lib/pages.js';

export const pageRoutes = Router();
pageRoutes.get('/pages', async (req, res) => res.json({ pages: await readPages(baseUrl(req)) }));
pageRoutes.use('/admin/pages', requireAdmin, (req, _res, next) => {
  if (req.user.role !== 'super_admin') fail(403, 'Only the super admin can edit pages.');
  next();
});
pageRoutes.get('/admin/pages', async (req, res) => res.json({ pages: await readPages(baseUrl(req), true) }));
pageRoutes.put('/admin/pages/:page', async (req, res) => {
  await savePage(req.params.page, req.body ?? {});
  res.json({ message: 'Page saved.', page: (await readPages(baseUrl(req), true))[req.params.page] });
});
pageRoutes.post('/admin/pages/:page/photo', async (req, res) =>
  res.json({ path: await storePageImage(req.params.page, req.body?.data) }),
);
pageRoutes.post('/admin/pages/:page/sections', async (req, res) => {
  const page = req.params.page;
  pageDefinition(page);
  const type = req.body?.type;
  const data = cleanSection(type, req.body?.data);
  const now = nowUtc();
  const r = await query(
    'INSERT INTO page_sections (page, type, data, sort_order, is_visible, created_at, updated_at) SELECT ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1, 1, ?, ? FROM page_sections WHERE page = ?',
    [page, type, JSON.stringify(data), now, now, page],
  );
  res.status(201).json({ id: r.insertId });
});
pageRoutes.put('/admin/pages/:page/sections/:id', async (req, res) => {
  const section = await first('SELECT * FROM page_sections WHERE id = ? AND page = ?', [
    req.params.id,
    req.params.page,
  ]);
  if (!section) fail(404, 'Section not found.');
  const data = cleanSection(section.type, req.body?.data);
  await query('UPDATE page_sections SET data = ?, is_visible = ?, updated_at = ? WHERE id = ?', [
    JSON.stringify(data),
    req.body?.is_visible === false ? 0 : 1,
    nowUtc(),
    section.id,
  ]);
  res.json({ message: 'Section saved.' });
});
pageRoutes.post('/admin/pages/:page/sections/:id/move', async (req, res) => {
  await transaction(async (conn) => {
    const [rows] = await conn.query('SELECT id FROM page_sections WHERE page = ? ORDER BY sort_order, id FOR UPDATE', [
      req.params.page,
    ]);
    const index = rows.findIndex((s) => s.id === Number(req.params.id));
    if (index < 0) fail(404, 'Section not found.');
    const swap = index + (req.body?.direction === 'up' ? -1 : 1);
    if (rows[swap]) [rows[index], rows[swap]] = [rows[swap], rows[index]];
    for (const [i, row] of rows.entries())
      await conn.query('UPDATE page_sections SET sort_order = ? WHERE id = ?', [i + 1, row.id]);
  });
  res.json({ ok: true });
});
pageRoutes.delete('/admin/pages/:page/sections/:id', async (req, res) => {
  await query('DELETE FROM page_sections WHERE page = ? AND id = ?', [req.params.page, req.params.id]);
  res.json({ message: 'Section deleted.' });
});
