import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(client) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/config', (req, res) => {
    res.json({ kakaoJsKey: process.env.KAKAO_JS_KEY || null });
  });

  app.get('/api/menus', async (req, res) => {
    try {
      const result = await client.execute(
        'SELECT * FROM menus ORDER BY votes DESC, created_at DESC'
      );
      res.json(result.rows);
    } catch (e) {
      res.status(500).json({ error: 'DB error' });
    }
  });

  app.get('/api/menus/random', async (req, res) => {
    try {
      const result = await client.execute(
        'SELECT * FROM menus ORDER BY RANDOM() LIMIT 1'
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'no menus' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: 'DB error' });
    }
  });

  app.post('/api/menus', async (req, res) => {
    const { name, description, category } = req.body ?? {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    try {
      const dup = await client.execute({
        sql: "SELECT id FROM menus WHERE lower(replace(name, ' ', '')) = lower(replace(?, ' ', ''))",
        args: [name.trim()],
      });
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: 'duplicate' });
      }
      const result = await client.execute({
        sql: 'INSERT INTO menus (name, description, category) VALUES (?, ?, ?) RETURNING *',
        args: [
          name.trim(),
          (typeof description === 'string' && description.trim()) ? description.trim() : null,
          (typeof category === 'string' && category.trim()) ? category.trim() : null,
        ],
      });
      res.status(201).json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: 'DB error' });
    }
  });

  app.post('/api/menus/:id/vote', async (req, res) => {
    try {
      const result = await client.execute({
        sql: 'UPDATE menus SET votes = votes + 1 WHERE id = ? RETURNING *',
        args: [req.params.id],
      });
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'not found' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: 'DB error' });
    }
  });

  app.patch('/api/menus/:id', async (req, res) => {
    const { name, description, category } = req.body ?? {};
    if (typeof name === 'string' && !name.trim()) {
      return res.status(400).json({ error: 'name cannot be empty' });
    }
    try {
      if (typeof name === 'string' && name.trim()) {
        const dup = await client.execute({
          sql: "SELECT id FROM menus WHERE lower(replace(name, ' ', '')) = lower(replace(?, ' ', '')) AND id != ?",
          args: [name.trim(), req.params.id],
        });
        if (dup.rows.length > 0) {
          return res.status(409).json({ error: 'duplicate' });
        }
      }
      const result = await client.execute({
        sql: `UPDATE menus
                SET name = COALESCE(?, name),
                    description = COALESCE(?, description),
                    category = COALESCE(?, category)
              WHERE id = ? RETURNING *`,
        args: [
          typeof name === 'string' ? name.trim() : null,
          description ?? null,
          (typeof category === 'string' && category.trim()) ? category.trim() : null,
          req.params.id,
        ],
      });
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'not found' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: 'DB error' });
    }
  });

  app.delete('/api/menus/:id', async (req, res) => {
    try {
      const result = await client.execute({
        sql: 'DELETE FROM menus WHERE id = ?',
        args: [req.params.id],
      });
      if (result.rowsAffected === 0) {
        return res.status(404).json({ error: 'not found' });
      }
      res.status(204).end();
    } catch (e) {
      res.status(500).json({ error: 'DB error' });
    }
  });

  return app;
}
