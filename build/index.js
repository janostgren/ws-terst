"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = void 0;
const wsTester_1 = require("./wsTester");
const log4js = require("log4js");
const yargs = require("yargs");
const argv = yargs
    .scriptName("ws-tester")
    .help("help")
    .alias("h", "help")
    .option("domain", { describe: "mattermost url", nargs: 1, demand: true })
    .option("userid", { describe: "mattermost userid", nargs: 1, demand: true })
    .option("token", {
    describe: "token for authentication",
    nargs: 1,
    demand: true,
}).argv;
const myLogger = log4js.getLogger('index.js');
const wsTester = new wsTester_1.WsTester(argv.domain, argv.userid, argv.token);
process.on('SIGTERM', () => {
    myLogger.info('Received SIGTERM. Shutting down bridge.');
});
process.on('SIGINT', () => {
    myLogger.info('Received SIGINT. Shutting down bridge.');
    void wsTester.stop(0);
});
async function run() {
    try {
        await wsTester.init();
        await wsTester.run();
    }
    catch (err) {
        console.error(err);
        throw err;
    }
}
exports.run = run;
run();
//# sourceMappingURL=index.js.map