const uuid = require('uuid');
const Response = require('appcd-response').default;

function sleep() {
	return new Promise(resolve => setTimeout(resolve, 1000));
}

module.exports = {
	activate() {
		appcd.register('/reverse', ctx => {
			console.log('Asking bar to reverse', ctx.request.data.str);
			return appcd.call('/bar/1.0.0/reverse', { data: ctx.request.data })
				.then(({ response }) => {
					console.log('bar reversed:', response);
					ctx.response = response;
				});
		});

		appcd.register('/pass', (ctx, next) => next());

		appcd.register('/pass', (ctx, next) => {
			ctx.response = 'pass!';
		});

		appcd.register('/time', ctx => {
			const { type, sid, topic } = ctx.request;

			if (type === 'unsubscribe') {
				return appcd.call('/bar/1.0.0/time', { type, sid, topic });
			}

			return appcd.call('/bar/1.0.0/time', { type })
				.then(result => {
					result.response
						.on('data', res => {
							ctx.response.write(res);
						})
						.on('end', () => {
							console.log('bar response ended');
							ctx.response.end();
						});
				});
		});

		// appcd.register('/uuid', ctx => {
		// 	const uuids = [ uuid.v4(), uuid.v4(), uuid.v4() ];
		// 	return uuids.reduce((p, v) => {
		// 		ctx.response.write({ uuid: uuid.v4() });
		// 		return p.then(() => sleep());
		// 	}, Promise.resolve());
		// });
		//
		// appcd.register('/friend-time', ctx => {
		// 	return appcd.call(`/${friend}/1.0.0/time`)
		// 		.then(({ response }) => {
		// 			ctx.response = response;
		// 		});
		// });
	}
};
