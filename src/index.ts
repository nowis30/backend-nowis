import { createServer } from 'http';

import { app } from './server/app';
import { env } from './server/env';

// Render (et la plupart des PaaS) fournissent une variable d'env PORT et
// exigent que l'application écoute sur 0.0.0.0 à ce port.
const server = createServer(app);
const port = env.PORT;
const host = '0.0.0.0';

server.listen(port, host, () => {
  // Log minimal server start information.
  console.log(`API Nowis démarrée sur http://${host}:${port}`);
});
