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

  return app;
}
