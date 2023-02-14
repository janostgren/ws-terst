// import fetch, { Response } from 'node-fetch';
import * as axios from 'axios';
import * as https from 'https';
import * as http from 'http';
import * as WebSocket from 'ws';
import { EventEmitter } from 'events';

import log, { getLogger } from '../Logging';
import * as log4js from 'log4js';
import * as FormData from 'form-data';

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export class Client {
    private joinTeamPromises: Map<string, Promise<any>>;
    private myLogger: log4js.Logger;
    private client: axios.AxiosInstance;

    constructor(
        readonly domain: string,
        readonly userid: string,
        readonly token: string,
    ) {
        this.domain = domain.replace(/\/*$/, '');
        this.joinTeamPromises = new Map();
        this.myLogger = getLogger('MM Client', 'trace');
        let httpsAgent = new https.Agent({
            keepAlive: true,
        });
        let httpAgent = new http.Agent({
            keepAlive: true,
        });


        const bearer: string = this.token ? `Bearer ${this.token}` : '';
        this.client = axios.default.create({
            baseURL: this.domain,
            httpsAgent: httpsAgent,
            httpAgent:httpAgent,
            headers: {
                Authorization: bearer,
            },
        });
    }

    private async send_raw(
        method: Method,
        endpoint: string,
        data?: any | FormData,
        auth: boolean = true,
    ): Promise<any> {
        if (auth && this.token === undefined) {
            throw new Error('Cannot send request without access token');
        }

        const options: axios.AxiosRequestConfig = {
            method: method,
            url: `/api/v4${endpoint}`,
            data: data,
        };

        this.myLogger.trace(`${method}  ${endpoint} user_id: ${this.userid}`);
        try {
            let response: axios.AxiosResponse = await this.client.request(
                options,
            );
            return response.data;
        } catch (error: any) {
            let message: string = error.message;
            let errName = 'ApiError';
            let ae: boolean = axios.isAxiosError(error);
            let errData:any=error.response?.data || {}
            let errObject:ErrorObject={
                "is_oauth":false,
                "id":"",
                "request_id":"",
                "status_code":0
            }
            if (ae) {
                
                if (error.response) {
                    // The request was made and the server responded with a status code
                    // that falls out of the range of 2xx

                    if (error.response.data) {
                        errData=error.response.data
                        let dm: any = error.response.data.message;
                        message += dm ? '. ' + dm : '';
                        errName = error.response.data.id || errName;
                        errObject.status_code=errData.status_code
                        errObject.id=errData.id,
                        errObject.request_id=errData.request_id
                    }
                } else if (error.request) {
                }
            } else {
            }

            let clientError = new ClientError(message,method, endpoint, errData,errObject)
            clientError.name = errName;
            this.myLogger.fatal('%s %s message: %s',method,endpoint,message)
            throw clientError;
        }
    }

    private async send(
        method: Method,
        endpoint: string,
        data?: any,
        auth: boolean = true,
    ): Promise<any> {
        return await this.send_raw(method, endpoint, data, auth);
    }

    public async get(
        endpoint: string,
        data?: any,
        auth: boolean = true,
    ): Promise<any> {
        return await this.send('GET', endpoint, data, auth);
    }
    public async post(
        endpoint: string,
        data?: any,
        auth: boolean = true,
    ): Promise<any> {
        return await this.send('POST', endpoint, data, auth);
    }
    public async put(
        endpoint: string,
        data?: any,
        auth: boolean = true,
    ): Promise<any> {
        return await this.send('PUT', endpoint, data, auth);
    }
    public async delete(
        endpoint: string,
        data?: any,
        auth: boolean = true,
    ): Promise<any> {
        return await this.send('DELETE', endpoint, data, auth);
    }

    public websocket(): ClientWebsocket {
        return new ClientWebsocket(this);
    }

    public async joinTeam(userid: string, teamid: string): Promise<any> {
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

interface PromiseCallbacks {
    resolve;
    reject;
}

export class ClientWebsocket extends EventEmitter {
    private myLogger: log4js.Logger;
    private ws: WebSocket;
    private seq: number;
    private promises: PromiseCallbacks[];
    public openPromise: Promise<void>;

    constructor(private client: Client) {
        super();
        this.myLogger = getLogger('Websocket');
        if (this.client.token === null) {
            throw new Error('Cannot open websocket without access token');
        }
        const parts=this.client.domain.split(':')
        
        let wsProto=parts[0] === "http" ? "ws":"wss"
        const wsUrl = `${wsProto}${this.client.domain.slice(4)}/api/v4/websocket`;
        
        this.ws = new WebSocket(wsUrl, {
            followRedirects: true,
        });
        this.seq = 0;
        this.promises = [];
        let resolve;
        this.openPromise = new Promise(r => (resolve = r));

        this.ws.on('open', async () => {
            await this.send('authentication_challenge', {
                token: this.client.token,
            });
            resolve();
        });
        this.ws.on('message', m => {
            const ev = JSON.parse(m);
            this.myLogger.trace('Message: %s', m.toString());
            if (ev.seq_reply !== undefined) {
                const promise = this.promises[ev.seq_reply];
                if (promise === null) {
                    log.warn(
                        `websocket: Received reply with unknown sequence number: ${m}`,
                    );
                }
                if (ev['status'] === 'OK') {
                    promise.resolve(ev.data);
                } else {
                    promise.reject(ev.error);
                }
                delete this.promises[ev.seq_reply];
            } else {
                this.emit('message', ev);
            }
        });
        this.ws.on('close', e => this.emit('close', e));
        this.ws.on('error', e => this.emit('error', e));
    }

    public async close(): Promise<void> {
        // If the websocket is already closed, we will not receive a close event.
        if (this.ws.readyState === WebSocket.CLOSED) {
            return;
        }
        this.ws.close();
        await new Promise(resolve => this.ws.once('close', resolve));
    }
    public async send(action: string, data: unknown): Promise<any> {
        this.seq += 1;
        this.ws.send(
            JSON.stringify({
                action: action,
                seq: this.seq,
                data: data,
            }),
        );
        return await new Promise(
            (resolve, reject) =>
                (this.promises[this.seq] = {
                    resolve: resolve,
                    reject: reject,
                }),
        );
    }
}

export class ClientError extends Error {
    constructor(
        message:string,
        public readonly method: Method,
        public readonly endpoint: string,
        public readonly data: any,
        public readonly m: ErrorObject,
    ) {
        super(message);
        this.message+=`status_code:${this.m.status_code} method:${method} endpoint:${endpoint}`
        /*
        this.message = `${this.m.status_code} ${this.method} ${
            this.endpoint
        }: ${JSON.stringify(this.m)}`;
        if (this.data !== undefined) {
            this.message += `\nData: ${JSON.stringify(this.data)}`;
        }
        */
    }
}

export interface ErrorObject {
    id: string;
    status_code: number;
    request_id: string;
    is_oauth: boolean;
}
