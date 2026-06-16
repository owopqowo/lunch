import { makeClient, initSchema } from './db.js';
import { createApp } from './app.js';

const client = makeClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

await initSchema(client);

const app = createApp(client);
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Lunch app listening on http://localhost:${port}`);
});
