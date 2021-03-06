/* eslint-disable promise/always-return */

/* istanbul ignore if */
if (!Error.prepareStackTrace) {
	require('source-map-support/register');
}

import appcdLogger from 'appcd-logger';
import Dispatcher from 'appcd-dispatcher';
import fs from 'fs-extra';
import getMachineId from 'appcd-machine-id';
import path from 'path';
import Response, { AppcdError, codes, i18n } from 'appcd-response';
import * as request from '@axway/amplify-request';

import { arch, osInfo, redact } from 'appcd-util';
import { expandPath } from 'appcd-path';
import { isDir } from 'appcd-fs';
import { v4 as uuidv4 } from 'uuid';

const { __n } = i18n();

const { error, log, warn } = appcdLogger('appcd:telemetry');
const { highlight } = appcdLogger.styles;

const jsonRegExp = /\.json$/;

/**
 * Records and sends telemetry data.
 */
export default class Telemetry extends Dispatcher {
	/**
	 * Cache of telemetry specific config settings.
	 * @type {Object}
	 */
	config = {
		enabled:       false,
		eventsDir:     null,
		sendBatchSize: 10,
		sendInterval:  60000, // 1 minute
		url:           null
	};

	/**
	 * The time, in milliseconds, that the last send was fired.
	 * @type {Number}
	 */
	lastSend = null;

	/**
	 * A promise that is resolved when telemetry data is not being sent to the server.
	 * @type {Promise}
	 */
	pending = Promise.resolve();

	/**
	 * Options to pass into the HTTP client.
	 * @type {Object}
	 */
	requestOptions = {};

	/**
	 * A flag that indicates if the telemetry system is running.
	 * @type {Boolean}
	 */
	running = false;

	/**
	 * The timer for sending telemetry data.
	 * @type {Timer}
	 */
	sendTimer = null;

	/**
	 * The session id.
	 * @type {String}
	 */
	sessionId = uuidv4();

	/**
	 * Constructs an analytics instance.
	 *
	 * @param {AppcdConfig} cfg - The Appc Daemon config object.
	 * @param {String} version - The app version.
	 * @param {String} [hardwareId] - A unique machine ID.
	 * @access public
	 */
	constructor(cfg, version, hardwareId) {
		if (!cfg || typeof cfg !== 'object') {
			throw new TypeError('Expected config to be a valid config object');
		}

		// telemetry.guid can be removed in 3.x as telemetry.app is favoured
		const app = cfg.get('telemetry.app') || cfg.get('telemetry.guid');
		if (!app || typeof app !== 'string') {
			throw new Error('Config is missing a required, valid "telemetry.app"');
		}

		super();

		/**
		 * The Appc Daemon application guid.
		 * @type {String}
		 */
		this.app = app;

		/**
		 * The Appc Daemon config object.
		 * @type {AppcdConfig}
		 */
		this.cfg = cfg;

		/**
		 * The machine id. This value is used to also determine if the telemetry system has been
		 * initialized.
		 * @type {String}
		 */
		this.hardwareId = hardwareId;

		/**
		 * The app version.
		 * @type {String}
		 */
		this.version = version;

		// wire up the telemetry route
		this.register('/', ctx => this.addEvent(ctx));
		this.register('/crash', ctx => this.addCrash(ctx));

		{
			const architecture = arch();
			const { name, version } = osInfo();

			this.osInfo = {
				version,
				name: name || process.platform,
				arch: architecture
			};
		}
	}

	/**
	 * Handles incoming add event requests and writes the event to disk.
	 *
	 * @param {Object} ctx - A dispatcher request context.
	 * @access private
	 */
	addEvent(ctx) {
		try {
			if (!this.hardwareId) {
				throw new AppcdError(codes.NOT_INITIALIZED, 'The telemetry system has not been initialized');
			}

			if (!this.config.enabled || !this.eventsDir) {
				ctx.response = new Response(codes.TELEMETRY_DISABLED);
				return;
			}

			let { app, event } = ctx.request;

			if (!event || typeof event !== 'string') {
				throw new AppcdError(codes.BAD_REQUEST, 'Invalid telemetry event');
			}

			const data = { ...ctx.request };
			delete data.app;
			delete data.event;
			delete data.params;

			const id = uuidv4();

			// spec: https://techweb.axway.com/confluence/display/analytics/Analytics+JSON+Payload+V4
			const payload = {
				id,
				data:       redact(data),
				event,
				os: 		this.osInfo,
				app:		app || this.app,
				timestamp: 	Date.now(),
				version: 	'4',
				hardware: {
					id: this.hardwareId
				},
				session: {
					id: this.sessionId
				},
				distribution: {
					environment:    this.config.environment,
					version:        this.version
				}
			};

			const filename = path.join(this.eventsDir, `${id}.json`);

			// make sure the events directory exists
			fs.mkdirsSync(this.eventsDir);

			log('Writing event: %s', highlight(filename));
			log(payload);

			try {
				fs.writeFileSync(filename, JSON.stringify(payload));
			} catch (e) {
				/* istanbul ignore next */
				throw new AppcdError(codes.SERVER_ERROR, 'Failed to write event data: %s', e.message);
			}

			ctx.response = new Response(codes.CREATED);
		} catch (e) {
			error('Failed to add event:');
			error(e.stack);
			ctx.response = e;
		}
	}

	/**
	 * Handles incoming add crash requests..
	 *
	 * @param {Object} ctx - A dispatcher request context.
	 * @access private
	 */
	addCrash(ctx) {
		if (this.config.environment !== 'production') {
			return;
		}
		if (!ctx.request.message) {
			warn('Error messages must be provided in crashes');
			return;
		}
		ctx.request.event = 'crash.report';
		this.addEvent(ctx);
	}

	/**
	 * Initializes the telemetry system.
	 *
	 * @param {String} homeDir - The path to the appcd home directory where the machine id will be
	 * persisted to.
	 * @returns {Promise}
	 * @access public
	 */
	async init(homeDir) {
		if (this.running) {
			return;
		}

		if (!homeDir || typeof homeDir !== 'string') {
			throw new TypeError('Expected home directory to be a non-empty string');
		}

		// set the config and wire up the watcher
		const updateConfig = async function () { // note: this cannot be an arrow function
			const telemetryConfig = this.cfg.get('telemetry') || {};

			const eventsDir = telemetryConfig.eventsDir || null;
			if (eventsDir !== this.config.eventsDir) {
				this.eventsDir = eventsDir ? expandPath(eventsDir) : null;
			}

			// copy over the config
			Object.assign(this.config, telemetryConfig);

			if (!this.config.environment) {
				this.config.environment = 'production';
			}

			// make sure things are sane
			if (this.config.sendBatchSize) {
				this.config.sendBatchSize = Math.max(this.config.sendBatchSize, 1);
			}

			// don't let the sendInterval or sendTimeout dip below 1 second
			this.config.sendInterval = Math.max(this.config.sendInterval, 1000);

			// set the request options
			this.requestOptions = await request.options({
				defaults: this.cfg.get('network') || {},
				retry:    0,
				timeout:  Math.max(telemetryConfig.sendTimeout || 10000, 1000),
				url:      telemetryConfig.url
			});
		}.bind(this);

		await updateConfig();
		this.cfg.watch('network', updateConfig);
		this.cfg.watch('telemetry', updateConfig);

		this.eventsDir = expandPath(this.config.eventsDir || path.join(homeDir, 'telemetry'));

		if (!this.hardwareId) {
			this.hardwareId = await getMachineId(path.join(homeDir, '.mid'));
		}

		this.running = true;

		// send any unsent events
		this.sendEvents().catch(() => {});

		return this;
	}

	/**
	 * Sends a batch of events to the server.
	 *
	 * @param {Array.<Object>} batch - An array of telemetry events to send.
	 * @returns {Promise}
	 */
	async sendBatch(batch) {
		log(__n(batch.length, 'Sending %%s event', 'Sending %%s events', highlight(batch.length)));

		try {
			await request.got.post({
				...this.requestOptions,
				json: batch.map(b => b.evt)
			});
			log(__n(batch.length, 'Successfully sent %%s event', 'Successfully sent %%s events', highlight(batch.length)));
			await Promise.all(batch.map(({ file }) => fs.remove(file)));
		} catch (err) {
			error(__n(
				batch.length,
				'Failed to send %%s event:',
				'Failed to send %%s events:',
				highlight(batch.length)
			));
			error(err.stack);
			throw err || new Error(`${err.response.statusCode} - ${err.response.statusMessage}`);
		}
	}

	/**
	 * Sends batches of all events and resolves when done.
	 *
	 * @param {Boolean} [flush] - When `true`, it bypasses the send interval and flushes all unsent
	 * events.
	 * @returns {Promise}
	 */
	sendEvents(flush) {
		const scheduleSendEvents = () => {
			// when flushing, we don't schedule a send
			if (!flush && this.running) {
				this.sendTimer = setTimeout(() => this.sendEvents().catch(() => {}), 1000);
			}
		};

		return this.pending = Promise.resolve()
			.then(async () => {
				const { eventsDir, lastSend } = this;
				const { enabled, sendBatchSize, sendInterval, url } = this.config;

				if (!enabled || !url || !eventsDir || !isDir(eventsDir) || (!flush && lastSend && (lastSend + sendInterval) > Date.now())) {
					// not enabled or not time to send
					return scheduleSendEvents();
				}

				let batch = [];
				let files = fs.readdirSync(eventsDir).filter(name => jsonRegExp.test(name));
				let counter = 0;

				for (let i = 0; i < files.length; i++) {
					const file = path.join(eventsDir, files[i]);

					try {
						batch.push({
							evt: await fs.readJson(file),
							file
						});
						counter++;
					} catch (e) {
						// Rather then squelch the error we'll remove here
						log(`Failed to read ${highlight(file)}, removing`);
						await fs.remove(file);
					}

					// send batch if full
					if (batch.length >= sendBatchSize) {
						await this.sendBatch(batch);

						// reset
						batch = [];
						i = -1;
						files = fs.readdirSync(eventsDir).filter(name => jsonRegExp.test(name));
					}
				}

				// send remaining events
				if (batch.length) {
					await this.sendBatch(batch);
				}

				// check if we found any events to send
				if (!counter) {
					log('No events to send');
				}

				this.lastSend = Date.now();
				scheduleSendEvents();
			})
			.catch(err => {
				this.lastSend = Date.now();
				scheduleSendEvents();
				throw err;
			});
	}

	/**
	 * Stops sending telemetry events and waits for any pending requests to finish.
	 *
	 * @returns {Promise}
	 * @access public
	 */
	async shutdown() {
		clearTimeout(this.sendTimer);
		this.running = false;

		try {
			// wait for the pending post to finish
			await this.pending;

			// wait for any remaining events to be sent
			await this.sendEvents(true);
		} catch (err) {
			warn('Failed to send events during shutdown');
			warn(err.stack);
		}
	}
}
