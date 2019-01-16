import appcdLogger from 'appcd-logger';
import Dispatcher from 'appcd-dispatcher';
import msgpack from 'msgpack-lite';
import WebServer, { WebSocket } from 'appcd-http';
import WebSocketSession from '../dist/websocket-session';

import { IncomingMessage } from 'http';

const { log } = appcdLogger('test:appcd:core:websocket-session');

describe('WebSocketSession', () => {
	afterEach(async function () {
		if (this.server) {
			await this.server.shutdown();
			this.server = null;
		}
	});

	it('should fail if constructor args are invalid', () => {
		expect(() => {
			new WebSocketSession();
		}).to.throw(TypeError, 'Expected a WebSocket instance');

		expect(() => {
			new WebSocketSession(null);
		}).to.throw(TypeError, 'Expected a WebSocket instance');

		expect(() => {
			new WebSocketSession({});
		}).to.throw(TypeError, 'Expected a WebSocket instance');

		expect(() => {
			const ws = new WebSocket('ws://127.0.0.1:1337').on('error', () => {});
			new WebSocketSession(ws);
		}).to.throw(TypeError, 'Expected a IncomingMessage instance');

		expect(() => {
			const ws = new WebSocket('ws://127.0.0.1:1337').on('error', () => {});
			new WebSocketSession(ws, {});
		}).to.throw(TypeError, 'Expected a IncomingMessage instance');

		expect(() => {
			const ws = new WebSocket('ws://127.0.0.1:1337').on('error', () => {});
			const msg = new IncomingMessage();
			new WebSocketSession(ws, msg, function () {});
		}).to.throw(TypeError, 'Expected a Dispatcher instance');

		expect(() => {
			const ws = new WebSocket('ws://127.0.0.1:1337').on('error', () => {});
			const msg = new IncomingMessage();
			new WebSocketSession(ws, msg, {});
		}).to.throw(TypeError, 'Expected a Dispatcher instance');
	});

	it('should dispatch WebSocket request', async function () {
		this.server = new WebServer({
			hostname: '127.0.0.1',
			port:     1337
		});

		const dispatcher = new Dispatcher();
		let uuid = 0;

		dispatcher.register('/foo', ctx => {
			log('Executing /foo handler');
			ctx.response = 'bar!';
		});

		this.server.on('websocket', (ws, msg) => new WebSocketSession(ws, msg, dispatcher));

		await this.server.listen();
		log('Web server listening');

		await new Promise((resolve, reject) => {
			// call the websocket
			const socket = new WebSocket('ws://127.0.0.1:1337')
				.on('error', () => {})
				.on('message', msg => {
					if (typeof msg === 'string') {
						try {
							msg = JSON.parse(msg);
						} catch (e) {
							// squeltch
						}
					} else {
						msg = msgpack.decode(msg);
					}

					log('Got message from server:', msg);

					try {
						expect(msg).to.be.an('object');
						expect(msg.status).to.equal(200);
						expect(msg.message).to.equal('bar!');
						resolve();
					} catch (e) {
						reject(e);
					}
				})
				.on('open', () => {
					log('Socket open, sending request');

					socket.send(JSON.stringify({
						data: 'foo',
						id: uuid++,
						path: '/foo',
						version: '1.0'
					}));
				});
		});
	});
});
