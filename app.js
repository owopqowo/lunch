import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(client) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

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

  app.post('/api/menus', async (req, res) => {
    const { name, description } = req.body ?? {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    try {
      const result = await client.execute({
        sql: 'INSERT INTO menus (name, description) VALUES (?, ?) RETURNING *',
        args: [name.trim(), description ?? null],
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

  return app;
}
