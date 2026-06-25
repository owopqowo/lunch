import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDuplicateName } from './db.js';

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

  // 추가도 수정·삭제처럼 외부 직접 호출은 막는다(어뷰징 방지).
  // 일반 사용자는 POST /api/requests(add)로 요청만 보내고, 승인 처리는
  // 라우트가 아니라 db.js의 createMenu를 직접 재사용한다.
  app.post('/api/menus', (req, res) => {
    return res.status(403).json({ error: 'adding is disabled' });
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
    // 로그인 도입 전까지 이름/설명 수정은 막아둔다(누구나 수정 가능한 상태라 어뷰징 위험).
    // 카테고리 자동 채움(category만 전달)은 시스템 기능이라 허용한다.
    if (name !== undefined || description !== undefined) {
      return res.status(403).json({ error: 'editing is disabled' });
    }
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
    // 로그인 도입 전까지 삭제는 막아둔다(누구나 삭제 가능한 상태라 어뷰징 위험).
    return res.status(403).json({ error: 'deleting is disabled' });
  });

  // 추가·수정·삭제는 직접 반영하지 않고 요청으로 받아 관리자가 검토한다.
  app.post('/api/requests', async (req, res) => {
    const { type, menu_id, name, description, reason } = req.body ?? {};
    if (!['add', 'edit', 'delete'].includes(type)) {
      return res.status(400).json({ error: 'invalid type' });
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const hasName = trimmedName.length > 0;
    const hasDescription = typeof description === 'string' && description.trim().length > 0;

    if (type === 'add' && !hasName) {
      return res.status(400).json({ error: 'name is required' });
    }
    if ((type === 'edit' || type === 'delete') && menu_id == null) {
      return res.status(400).json({ error: 'menu_id is required' });
    }
    if (type === 'edit' && !hasName && !hasDescription) {
      return res.status(400).json({ error: 'nothing to change' });
    }

    try {
      // add는 즉시 추가와 동일하게 중복 이름(공백/대소문자 무시)을 막는다.
      if (type === 'add' && await isDuplicateName(client, trimmedName)) {
        return res.status(409).json({ error: 'duplicate' });
      }
      // edit/delete는 대상 메뉴가 실제로 존재하는지 확인한다.
      if (type === 'edit' || type === 'delete') {
        const target = await client.execute({
          sql: 'SELECT id FROM menus WHERE id = ?',
          args: [menu_id],
        });
        if (target.rows.length === 0) {
          return res.status(404).json({ error: 'menu not found' });
        }
      }

      const result = await client.execute({
        sql: `INSERT INTO requests (type, menu_id, name, description, reason)
              VALUES (?, ?, ?, ?, ?) RETURNING *`,
        args: [
          type,
          type === 'add' ? null : menu_id,
          hasName ? trimmedName : null,
          hasDescription ? description.trim() : null,
          (typeof reason === 'string' && reason.trim()) ? reason.trim() : null,
        ],
      });
      res.status(201).json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: 'DB error' });
    }
  });

  return app;
}
