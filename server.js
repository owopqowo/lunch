import { makeClient, initSchema } from './db.js';
import { createApp } from './app.js';

const client = makeClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

try {
  await initSchema(client);
} catch (e) {
  console.error('DB init failed:', e.message);
  process.exit(1);
}

const app = createApp(client);
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Lunch app listening on http://localhost:${port}`);
});
