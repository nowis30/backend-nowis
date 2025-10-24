"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const app_1 = require("./server/app");
const env_1 = require("./server/env");
// Render (et la plupart des PaaS) fournissent une variable d'env PORT et
// exigent que l'application écoute sur 0.0.0.0 à ce port.
const server = (0, http_1.createServer)(app_1.app);
const port = env_1.env.PORT;
const host = '0.0.0.0';
server.listen(port, host, () => {
    // Log minimal server start information.
    console.log(`API Nowis démarrée sur http://${host}:${port}`);
});
