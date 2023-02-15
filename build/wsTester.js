"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsTester = void 0;
const EventEmitter = require("events");
const log4sj = require("log4js");
//import { Client, ClientWebsocket } from "./Client";
const Client_1 = require("./faye-ws/Client");
class WsTester extends EventEmitter {
    constructor(domain, userid, token) {
        super();
        this.domain = domain;
        this.userid = userid;
        this.token = token;
        this.myLogger = log4sj.getLogger("WsTester");
        this.myLogger.level = 'debug';
        this.client = new Client_1.Client(domain, userid, token);
        this.ws = this.client.websocket();
        this.ws.on("close", (code, reason) => {
            this.myLogger.error('Websocket closed code=%s , reason=%s', code, reason ? reason.toString() : "");
            this.stop(1);
        });
        this.ws.on('error', e => {
            this.myLogger.error(`Error when initializing websocket connection.\n${e.stack}`);
        });
    }
    async init() {
        await this.ws.open();
    }
    async sleep(ms) {
        this.myLogger.debug("Going to sleep for %d ms", ms);
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async run() {
        let ok = true;
        while (ok) {
            try {
                await this.sleep(2000);
            }
            catch (err) {
                this.myLogger.error(err);
                ok = false;
            }
        }
    }
    async stop(exitCode = 0) {
        this.myLogger.info("Exiting with code=%d", exitCode);
        process.exit(exitCode);
    }
}
exports.WsTester = WsTester;
//# sourceMappingURL=wsTester.js.map