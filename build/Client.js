"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientError = exports.ClientWebsocket = exports.Client = void 0;
// import fetch, { Response } from 'node-fetch';
const axios = require("axios");
const https = require("https");
const http = require("http");
const WebSocket = require("ws");
const events_1 = require("events");
const log4js = require("log4js");
class Client {
    constructor(domain, userid, token) {
        this.domain = domain;
        this.userid = userid;
        this.token = token;
        this.domain = domain.replace(/\/*$/, "");
        this.joinTeamPromises = new Map();
        this.myLogger = log4js.getLogger("MM Client");
        this.myLogger.level = "trace";
        let httpsAgent = new https.Agent({
            keepAlive: true,
        });
        let httpAgent = new http.Agent({
            keepAlive: true,
        });
        const bearer = this.token ? `Bearer ${this.token}` : "";
        this.client = axios.default.create({
            baseURL: this.domain,
            httpsAgent: httpsAgent,
            httpAgent: httpAgent,
            headers: {
                Authorization: bearer,
            },
        });
    }
    async send_raw(method, endpoint, data, auth = true) {
        var _a;
        if (auth && this.token === undefined) {
            throw new Error("Cannot send request without access token");
        }
        const options = {
            method: method,
            url: `/api/v4${endpoint}`,
            data: data,
        };
        this.myLogger.trace(`${method}  ${endpoint} user_id: ${this.userid}`);
        try {
            let response = await this.client.request(options);
            return response.data;
        }
        catch (error) {
            let message = error.message;
            let errName = "ApiError";
            let ae = axios.isAxiosError(error);
            let errData = ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || {};
            let errObject = {
                is_oauth: false,
                id: "",
                request_id: "",
                status_code: 0,
            };
            if (ae) {
                if (error.response) {
                    // The request was made and the server responded with a status code
                    // that falls out of the range of 2xx
                    if (error.response.data) {
                        errData = error.response.data;
                        let dm = error.response.data.message;
                        message += dm ? ". " + dm : "";
                        errName = error.response.data.id || errName;
                        errObject.status_code = errData.status_code;
                        (errObject.id = errData.id),
                            (errObject.request_id = errData.request_id);
                    }
                }
                else if (error.request) {
                }
            }
            else {
            }
            let clientError = new ClientError(message, method, endpoint, errData, errObject);
            clientError.name = errName;
            this.myLogger.fatal("%s %s message: %s", method, endpoint, message);
            throw clientError;
        }
    }
    async send(method, endpoint, data, auth = true) {
        return await this.send_raw(method, endpoint, data, auth);
    }
    async get(endpoint, data, auth = true) {
        return await this.send("GET", endpoint, data, auth);
    }
    async post(endpoint, data, auth = true) {
        return await this.send("POST", endpoint, data, auth);
    }
    async put(endpoint, data, auth = true) {
        return await this.send("PUT", endpoint, data, auth);
    }
    async delete(endpoint, data, auth = true) {
        return await this.send("DELETE", endpoint, data, auth);
    }
    websocket() {
        return new ClientWebsocket(this);
    }
    async joinTeam(userid, teamid) {
        // Since ids are fixed length, it is okay to just concatenate.
        const key = userid + teamid;
        const sent = this.joinTeamPromises.get(key);
        if (sent !== undefined) {
            return sent;
        }
        const promise = this.post(`/teams/${teamid}/members`, {
            user_id: userid,
            team_id: teamid,
        });
        this.joinTeamPromises.set(key, promise);
        const result = await promise;
        this.joinTeamPromises.delete(key);
        return result;
    }
}
exports.Client = Client;
class ClientWebsocket extends events_1.EventEmitter {
    constructor(client) {
        super();
        this.client = client;
        this.myLogger = log4js.getLogger("Websocket");
        this.myLogger.level = "trace";
        if (this.client.token === null) {
            throw new Error("Cannot open websocket without access token");
        }
        this.seq = 0;
        this.promises = [];
    }
    async open() {
        const parts = this.client.domain.split(":");
        let wsProto = parts[0] === "http" ? "ws" : "wss";
        const wsUrl = `${wsProto}${this.client.domain.slice(4)}/api/v4/websocket`;
        const options = {
            followRedirects: true,
            headers: {
                Authorization: "Bearer " + this.client.token,
            },
        };
        this.ws = new WebSocket(wsUrl, [], options);
        let resolve;
        let openPromise = new Promise((r) => (resolve = r));
        this.ws.on("open", async () => {
            this.myLogger.debug("ws open event ");
            /*
            await this.send("authentication_challenge", {
              token: this.client.token,
            });
            resolve();
            */
        });
        this.ws.on("unexpected-response", (resp) => {
            this.myLogger.error("Unexpected response %s", resp);
        });
        this.ws.on("message", (m) => {
            const ev = JSON.parse(m);
            this.myLogger.trace("Message: %s", m.toString());
            if (ev.seq_reply !== undefined) {
                const promise = this.promises[ev.seq_reply];
                if (promise === null) {
                    this.myLogger.warn(`websocket: Received reply with unknown sequence number: ${m}`);
                }
                if (ev["status"] === "OK") {
                    promise.resolve(ev.data);
                }
                else {
                    promise.reject(ev.error);
                }
                delete this.promises[ev.seq_reply];
            }
            else {
                this.emit("message", ev);
            }
        });
        this.ws.on("close", (code, reason) => this.emit("close", code, reason));
        this.ws.on("error", (e) => this.emit("error", e));
    }
    async close() {
        // If the websocket is already closed, we will not receive a close event.
        if (this.ws.readyState === WebSocket.CLOSED) {
            return;
        }
        this.ws.close();
        await new Promise((resolve) => this.ws.once("close", resolve));
    }
    async send(action, data) {
        this.seq += 1;
        this.ws.send(JSON.stringify({
            action: action,
            seq: this.seq,
            data: data,
        }));
        return await new Promise((resolve, reject) => (this.promises[this.seq] = {
            resolve: resolve,
            reject: reject,
        }));
    }
}
exports.ClientWebsocket = ClientWebsocket;
class ClientError extends Error {
    constructor(message, method, endpoint, data, m) {
        super(message);
        this.method = method;
        this.endpoint = endpoint;
        this.data = data;
        this.m = m;
        this.message += `status_code:${this.m.status_code} method:${method} endpoint:${endpoint}`;
    }
}
exports.ClientError = ClientError;
//# sourceMappingURL=Client.js.map