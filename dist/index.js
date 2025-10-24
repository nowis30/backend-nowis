"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const app_1 = require("./server/app");
const env_1 = require("./server/env");
const server = (0, http_1.createServer)(app_1.app);
const port = env_1.env.PORT;
server.listen(port, () => {
    // Log minimal server start information.
    console.log(`API Nowis démarrée sur http://localhost:${port}`);
});
