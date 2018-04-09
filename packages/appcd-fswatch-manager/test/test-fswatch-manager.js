import appcdLogger from 'appcd-logger';
import fs from 'fs-extra';
import FSWatchManager from '../dist/fswatch-manager';
import path from 'path';
import tmp from 'tmp';

import { DispatcherError } from 'appcd-dispatcher';
import { real } from 'appcd-path';
import { renderTree, reset, roots } from 'appcd-fswatcher';

const log = appcdLogger('test:appcd:fswatch:manager').log;
const { highlight } = appcdLogger.styles;

const _tmpDir = tmp.dirSync({
	mode: '755',
	prefix: 'appcd-fswatch-manager-test-',
	unsafeCleanup: true
}).name;
const tmpDir = real(_tmpDir);

function makeTempName() {
	return path.join(_tmpDir, Math.random().toString(36).substring(7));
}

function makeTempDir() {
	const dir = makeTempName();
	fs.mkdirsSync(dir);
	return dir;
}

describe('FSWatchManager', () => {
	describe('error handling', () => {
		it('should continue to next route if type is a call', done => {
			const manager = new FSWatchManager();

			Promise.resolve()
				.then(() => new Promise(resolve => {
					manager.handler({
						path: '/',
						request: {},
						response: {
							end() {
								// noop
							},
							once() {
								// noop
							},
							write() {
								// noop
							}
						}
					}, () => {
						resolve();
						return Promise.resolve();
					});
				}))
				.then(() => done())
				.catch(done);
		});

		it('should fail if watch path not specified', done => {
			const manager = new FSWatchManager();

			Promise.resolve()
				.then(() => new Promise(() => {
					manager.handler({
						path: '/',
						request: {
							sessionId: 0,
							type: 'subscribe'
						},
						response: {
							end() {
								// noop
							},
							once() {
								// noop
							},
							write() {
								// noop
							}
						}
					}, () => Promise.resolve());
				}))
				.then(() => {
					done(new Error('Expected error because watch path was not specified'));
				}, err => {
					expect(err).to.be.instanceof(DispatcherError);
					expect(err.status).to.equal(400);
					expect(err.statusCode).to.equal('400.5');
					expect(err.message).to.equal('Missing required parameter "path"');
					done();
				})
				.catch(done);
		});
	});

	describe('watch', () => {
		after(() => {
			fs.removeSync(tmpDir);
		});

		afterEach(function (done) {
			this.timeout(10000);
			reset();
			log(renderTree());
			setTimeout(() => done(), 1000);
		});

		it('should subscribe to fs watcher', function (done) {
			this.timeout(10000);
			this.slow(8000);

			const tmp = makeTempDir();
			log('Creating tmp directory: %s', highlight(tmp));

			const filename = path.join(tmp, 'foo.txt');
			const manager = new FSWatchManager();
			let counter = 0;

			const stats = manager.status();
			expect(stats.nodes).to.equal(0);
			expect(stats.fswatchers).to.equal(0);
			expect(stats.watchers).to.equal(0);

			expect(manager.tree).to.equal('<empty tree>');

			setTimeout(() => {
				Promise.resolve()
					.then(() => new Promise((resolve, reject) => {
						log('Subscribing');
						manager.handler({
							request: {
								data: { path: tmp },
								type: 'subscribe'
							},
							response: {
								end() {
									// noop
								},
								once() {
									// noop
								},
								write(response) {
									try {
										switch (++counter) {
											case 1:
												expect(response.message.toString()).to.equal('Subscribed');
												expect(response.message.status).to.equal(201);
												expect(response.topic).to.equal(tmp);
												expect(response.type).to.equal('subscribe');
												break;

											case 2:
												expect(response).to.deep.equal({
													message: {
														action: 'add',
														filename: 'foo.txt',
														file: real(filename)
													},
													sid: response.sid,
													topic: tmp,
													type: 'event'
												});

												const stats = manager.status();
												expect(stats.nodes).to.be.above(0);
												expect(stats.fswatchers).to.be.above(0);
												expect(stats.watchers).to.equal(1);

												setTimeout(() => {
													try {
														// `tree` takes a few milliseconds to update
														expect(manager.tree).to.not.equal('<empty tree>');

														log('Unsubscribing');
														const ctx = {
															request: {
																sid: response.sid,
																topic: tmp,
																type: 'unsubscribe'
															},
															response: {
																end() {
																	// noop
																},
																once() {
																	// noop
																},
																write() {
																	// noop
																}
															}
														};
														manager.handler(ctx, () => Promise.resolve());

														expect(ctx.response.toString()).to.equal('Unsubscribed');
														expect(ctx.response.status).to.equal(200);
														expect(ctx.response.statusCode).to.equal('200.1');
														expect(Object.keys(manager.subscriptions)).to.have.lengthOf(0);

														expect(roots).to.deep.equal({});

														resolve();
													} catch (e) {
														reject(e);
													}
												}, 1000);
										}
									} catch (e) {
										reject(e);
									}
								}
							}
						}, () => Promise.resolve());
					}))
					.then(() => done())
					.catch(done);

				setTimeout(() => {
					log('Writing %s', highlight(filename));
					fs.writeFileSync(filename, 'foo!');
				}, 100);
			}, 100);
		});

		it('should shutdown all watchers', function (done) {
			this.timeout(10000);
			this.slow(8000);

			const tmp = makeTempDir();
			log('Creating tmp directory: %s', highlight(tmp));

			const fooDir = path.join(tmp, 'foo');
			log('Creating foo directory: %s', highlight(fooDir));
			fs.mkdirsSync(fooDir);

			const barDir = path.join(tmp, 'bar');
			log('Creating bar directory: %s', highlight(barDir));
			fs.mkdirsSync(barDir);

			const manager = new FSWatchManager();

			manager.handler({
				request: {
					data: { path: fooDir },
					sessionId: 0,
					type: 'subscribe'
				},
				response: {
					end() {
						// noop
					},
					once() {
						// noop
					},
					write() {
						// noop
					}
				}
			}, () => Promise.resolve());

			manager.handler({
				request: {
					data: { path: barDir },
					sessionId: 1,
					type: 'subscribe'
				},
				response: {
					end() {
						// noop
					},
					once() {
						// noop
					},
					write() {
						// noop
					}
				}
			}, () => Promise.resolve());

			setTimeout(() => {
				try {
					const stats = manager.status();
					expect(stats.nodes).to.be.above(0);
					expect(stats.fswatchers).to.be.above(0);
					expect(stats.watchers).to.equal(2);

					manager.shutdown();

					setTimeout(() => {
						try {
							const stats = manager.status();
							expect(stats.nodes).to.equal(0);
							expect(stats.fswatchers).to.equal(0);
							expect(stats.watchers).to.equal(0);
							done();
						} catch (e) {
							done(e);
						}
					}, 1000);
				} catch (e) {
					done(e);
				}
			}, 1000);
		});
	});
});
