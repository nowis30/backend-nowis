import { createServer } from 'http';

import { app } from './server/app';
import { env } from './server/env';

const server = createServer(app);
const port = env.PORT;

server.listen(port, () => {
  // Log minimal server start information.
  console.log(`API Nowis démarrée sur http://localhost:${port}`);
});
