import { WsTester } from "./wsTester";
import * as log4js from "log4js";
import * as yargs from "yargs";


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

    const myLogger: log4js.Logger = log4js.getLogger('index.js');
    const wsTester:WsTester=new WsTester(argv.domain,argv.userid,argv.token)
    
   
    process.on('SIGTERM', () => {
        myLogger.info('Received SIGTERM. Shutting down bridge.');
        
    });
    process.on('SIGINT', () => {
        myLogger.info('Received SIGINT. Shutting down bridge.');
        void wsTester.stop(0);
    });

    export async function run():Promise<void> {
        try {
            await wsTester.init()
            await wsTester.run()  
        } 
        catch (err) {
            console.error(err)
            throw err
        }
    }
  
    run()


   
   
