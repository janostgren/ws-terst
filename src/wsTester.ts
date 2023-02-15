import EventEmitter = require("events");

import * as log4sj from "log4js";

//import { Client, ClientWebsocket } from "./Client";
import { Client, ClientWebsocket } from "./faye-ws/Client";

export class WsTester extends EventEmitter {
  private myLogger: log4sj.Logger;
  private client: Client;
  private ws: ClientWebsocket;
  constructor(
    readonly domain: string,
    readonly userid: string,
    readonly token: string
  ) {
    super();
    this.myLogger = log4sj.getLogger("WsTester");
    this.myLogger.level='debug'
    this.client = new Client(domain, userid, token);
    this.ws = this.client.websocket();
    this.ws.on("close", (code, reason) => {
        this.myLogger.error(
            'Websocket closed code=%s , reason=%s',code, reason ? reason.toString():""
        );
        this.stop(1)
    });
    this.ws.on('error', e => {
        this.myLogger.error(
            `Error when initializing websocket connection.\n${e.stack}`,
        );
    });
  }

  public async init() {
      await this.ws.open()

  }

  public async sleep (ms) {
      this.myLogger.debug("Going to sleep for %d ms",ms)
        return new Promise(resolve => setTimeout(resolve, ms))
  }

  public async run() {
    let ok:boolean=true
    while (ok)  {
        try {

            await this.sleep(2000)

        }
        catch(err) {
            this.myLogger.error(err)
            ok=false
        }
    }


  }

  public async stop(exitCode = 0) {
    this.myLogger.info("Exiting with code=%d", exitCode);
    process.exit(exitCode);
  }
}
