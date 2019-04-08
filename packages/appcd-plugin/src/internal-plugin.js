import Dispatcher from 'appcd-dispatcher';
import PluginBase from './plugin-base';

import { AppcdError, codes } from 'appcd-response';

/**
 * Internal plugin implementation logic.
 */
export default class InternalPlugin extends PluginBase {
	/**
	 * Dispatches a request to the plugin's dispatcher.
	 *
	 * @param {Object} ctx - A dispatcher context.
	 * @param {Function} next - A function to continue to next dispatcher route.
	 * @returns {Promise}
	 * @access public
	 */
	async dispatch(ctx, next) {
		try {
			return this.dispatcher.call(ctx.path, ctx);
		} catch (err) {
			if (err instanceof AppcdError && err.statusCode === codes.NOT_FOUND) {
				return next();
			}
			throw err;
		}
	}

	/**
	 * Loads the internal plugin entry point in the sandbox and activates it.
	 *
	 * @returns {Promise}
	 * @access private
	 */
	async onStart() {
		try {
			await this.activate();
		} catch (err) {
			this.info.error = err.message;
			this.info.stack = err.stack;
			this.logger.error(err);
			throw err;
		}

		try {
			const { response } = await Dispatcher.call('/appcd/config', { type: 'subscribe' });
			response.on('data', response => {
				if (response.type === 'event') {
					this.config = response.message;
					this.configSubscriptionId = response.sid;
				}
			});
		} catch (err) {
			this.logger.warn('Failed to subscribe to config');
			this.logger.warn(err);
		}
	}

	/**
	 * Deactivates the plugin.
	 *
	 * @returns {Promise}
	 * @access private
	 */
	async onStop() {
		if (this.configSubscriptionId) {
			try {
				await Dispatcher.call('/appcd/config', {
					sid: this.configSubscriptionId,
					type: 'unsubscribe'
				});
			} catch (err) {
				this.logger.warn('Failed to unsubscribe from config');
				this.logger.warn(err);
			}
		}

		if (this.module && typeof this.module.deactivate === 'function') {
			try {
				await this.module.deactivate();
			} catch (err) {
				this.logger.error(err);
				throw err;
			}
		}
	}
}
