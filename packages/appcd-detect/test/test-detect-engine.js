import Dispatcher from 'appcd-dispatcher';
import DetectEngine from '../dist/detect-engine';
import fs from 'fs-extra';
import FSWatchManager from 'appcd-fswatcher';
import gawk from 'gawk';
import path from 'path';
import tmp from 'tmp';

import { exe } from 'appcd-subprocess';
import { isFile } from 'appcd-fs';
import { real } from 'appcd-path';
import { sleep } from 'appcd-util';

const _tmpDir = tmp.dirSync({
	prefix: 'appcd-detect-test-',
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

describe('Detect Engine', () => {
	before(function () {
		this.fsw = new FSWatchManager();
		Dispatcher.register('/appcd/fswatch', this.fsw.dispatcher);
	});

	after(function () {
		Dispatcher.unregister('/appcd/fswatch', this.fsw.dispatcher);
		this.fsw.shutdown();
		fs.removeSync(tmpDir);
	});

	beforeEach(function () {
		this.PATH = process.env.PATH;
	});

	afterEach(function () {
		process.env.PATH = this.PATH;
		delete process.env.DETECT_TEST_PATH;
		delete process.env.DETECT_TEST_PATH2;
	});

	describe('constructor', () => {
		it('should throw if checkDir is not a function', () => {
			expect(() => {
				new DetectEngine({ checkDir: 123 });
			}).to.throw(TypeError, 'Expected checkDir to be a function');
		});

		it('should throw if env is not a string', () => {
			expect(() => {
				new DetectEngine({ env: 123 });
			}).to.throw(TypeError, 'Expected env to be a string or an array of strings');
		});

		it('should throw if env is not an array of strings', () => {
			expect(() => {
				new DetectEngine({ env: [ 'foo', 123 ] });
			}).to.throw(TypeError, 'Expected env to be a string or an array of strings');
		});

		it('should throw if exe is not a string', () => {
			expect(() => {
				new DetectEngine({ exe: 123 });
			}).to.throw(TypeError, 'Expected exe to be a non-empty string');
		});

		it('should throw if paths is not a string', () => {
			expect(() => {
				new DetectEngine({ paths: 123 });
			}).to.throw(TypeError, 'Expected paths to be a string or an array of strings');
		});

		it('should throw if paths is not an array of strings', () => {
			expect(() => {
				new DetectEngine({ paths: [ 'foo', 123 ] });
			}).to.throw(TypeError, 'Expected paths to be a string or an array of strings');
		});

		it('should throw if processResults() is not a function', () => {
			expect(() => {
				new DetectEngine({ processResults: 123 });
			}).to.throw(TypeError, 'Expected processResults() to be a function');
		});

		it('should throw if registryKeys is null', () => {
			expect(() => {
				new DetectEngine({ registryKeys: null });
			}).to.throw(TypeError, 'Expected registryKeys to be an object, array of objects, or a function');
		});

		it('should throw if registryKeys is not a function or object', () => {
			expect(() => {
				new DetectEngine({ registryKeys: 'foo' });
			}).to.throw(TypeError, 'Expected registryKeys to be an object, array of objects, or a function');
		});

		it('should throw if registryKeys is an array with a non-object', () => {
			expect(() => {
				new DetectEngine({ registryKeys: [ 'foo' ] });
			}).to.throw(TypeError, 'Expected registryKeys to be an array of objects with a "key" and "name"');
		});

		it('should throw if registryKeys is an array with object missing key', () => {
			expect(() => {
				new DetectEngine({ registryKeys: [ { foo: 'bar' } ] });
			}).to.throw(TypeError, 'Expected registryKeys to be an array of objects with a "key" and "name"');
		});

		it('should throw if registryKeys is an array with object missing name', () => {
			expect(() => {
				new DetectEngine({ registryKeys: [ { key: 'foo' } ] });
			}).to.throw(TypeError, 'Expected registryKeys to be an array of objects with a "key" and "name"');
		});

		it('should throw if registryKeys is an object missing key', () => {
			expect(() => {
				new DetectEngine({ registryKeys: { foo: 'bar' } });
			}).to.throw(TypeError, 'Expected registryKeys to be an object with a "key" and "name"');
		});

		it('should throw if registryKeys is an object missing name', () => {
			expect(() => {
				new DetectEngine({ registryKeys: { key: 'foo' } });
			}).to.throw(TypeError, 'Expected registryKeys to be an object with a "key" and "name"');
		});
	});

	describe('getPaths()', () => {
		it('should return an empty array', done => {
			const engine = new DetectEngine();
			engine.getPaths()
				.then(results => {
					expect(results).to.be.an('array');
					expect(results).to.have.lengthOf(0);
					done();
				})
				.catch(done);
		});

		it('should return an array with an environment variable path', done => {
			process.env.DETECT_TEST_PATH = __dirname;

			const engine = new DetectEngine({ env: 'DETECT_TEST_PATH' });
			engine.getPaths()
				.then(results => {
					expect(results).to.be.an('array');
					expect(results).to.have.lengthOf(1);
					expect(results[0]).to.equal(__dirname);
					done();
				})
				.catch(done);
		});

		it('should return an array with multiple environment variable paths', done => {
			process.env.DETECT_TEST_PATH = __dirname;
			process.env.DETECT_TEST_PATH2 = path.join(__dirname, 'foo');

			const engine = new DetectEngine({ env: [ 'DETECT_TEST_PATH', 'DETECT_TEST_PATH2' ] });
			engine.getPaths()
				.then(results => {
					expect(results).to.be.an('array');
					expect(results).to.have.lengthOf(2);
					expect(results[0]).to.equal(__dirname);
					expect(results[1]).to.equal(path.join(__dirname, 'foo'));
					done();
				})
				.catch(done);
		});

		it('should return an array with the executable directory', done => {
			process.env.PATH = path.join(__dirname, 'mocks');

			const executable = 'test' + exe;
			const engine = new DetectEngine({ exe: executable });
			engine.getPaths()
				.then(results => {
					expect(results).to.be.an('array');
					expect(results).to.have.lengthOf(1);
					expect(results[0]).to.equal(process.env.PATH);
					done();
				})
				.catch(done);
		});

		it('should not find a path when executable does not exist', done => {
			process.env.PATH = path.join(__dirname, 'mocks');

			const executable = 'doesnotexist' + exe;
			const engine = new DetectEngine({ exe: executable });
			engine.getPaths()
				.then(results => {
					expect(results).to.be.an('array');
					expect(results).to.have.lengthOf(0);
					done();
				})
				.catch(done);
		});

		it('should return an array with a single path', done => {
			const engine = new DetectEngine({ paths: __dirname });
			engine.getPaths()
				.then(results => {
					expect(results).to.be.an('array');
					expect(results).to.have.lengthOf(1);
					expect(results[0]).to.equal(__dirname);
					done();
				})
				.catch(done);
		});

		it('should return an array with multiple paths', done => {
			const engine = new DetectEngine({ paths: [ __dirname, '', path.join(__dirname, 'foo') ] });
			engine.getPaths()
				.then(results => {
					expect(results).to.be.an('array');
					expect(results).to.have.lengthOf(2);
					expect(results[0]).to.equal(__dirname);
					expect(results[1]).to.equal(path.join(__dirname, 'foo'));
					done();
				})
				.catch(done);
		});

		it('should not find a path when the path is not a directory', done => {
			const engine = new DetectEngine({ paths: __filename });
			engine.getPaths()
				.then(results => {
					expect(results).to.be.an('array');
					expect(results).to.have.lengthOf(0);
					done();
				})
				.catch(done);
		});
	});

	describe('detect()', () => {
		afterEach(function () {
			if (this.handle) {
				this.handle.stop();
			}
		});

		it('should reject if paths is not a string', done => {
			const engine = new DetectEngine();
			engine.detect({ paths: 123 })
				.on('error', err => {
					try {
						expect(err).to.be.an.instanceof(TypeError);
						expect(err.message).to.equal('Expected paths to be a string or an array of strings');
						done();
					} catch (e) {
						done(e);
					}
				});
		});

		it('should reject if paths is not an array of strings', done => {
			const engine = new DetectEngine();
			engine.detect({ paths: [ 'foo', 123 ] })
				.on('error', err => {
					try {
						expect(err).to.be.an.instanceof(TypeError);
						expect(err.message).to.equal('Expected paths to be a string or an array of strings');
						done();
					} catch (e) {
						done(e);
					}
				});
		});

		it('should get a single object for the result', done => {
			const engine = new DetectEngine({
				checkDir(dir) {
					expect(dir).to.equal(__dirname);
					return { foo: 'bar' };
				}
			});

			engine
				.detect({
					paths: __dirname,
					// harmlessly enable redetect which will be disabled if watch is not enabled
					// this is more for code coverage
					redetect: true
				})
				.on('results', results => {
					expect(results).to.deep.equal({ foo: 'bar' });
					done();
				})
				.on('error', done);
		});

		it('should call detect function for each path', done => {
			const engine = new DetectEngine({
				checkDir(dir) {
					expect(dir).to.equal(__dirname);
					return { foo: 'bar' };
				},
				multiple: true
			});

			engine
				.detect({ paths: __dirname })
				.on('results', results => {
					expect(results).to.be.an('array');
					expect(results).to.deep.equal([ { foo: 'bar' } ]);
					done();
				})
				.on('error', done);
		});

		it('should return cache for non-forced second call', done => {
			let counter = 0;
			const engine = new DetectEngine({
				checkDir(dir) {
					expect(dir).to.equal(__dirname);
					counter++;
					return { foo: 'bar' };
				},
				multiple: true
			});

			engine
				.detect({ paths: __dirname })
				.on('results', results => {
					expect(results).to.be.an('array');
					expect(results).to.deep.equal([ { foo: 'bar' } ]);

					engine
						.detect({ paths: __dirname })
						.on('results', results => {
							expect(results).to.be.an('array');
							expect(results).to.deep.equal([ { foo: 'bar' } ]);
							expect(counter).to.equal(1);
							done();
						})
						.on('error', done);
				})
				.on('error', done);
		});

		it('should return cache for forced second call', done => {
			let counter = 0;
			const engine = new DetectEngine({
				checkDir(dir) {
					expect(dir).to.equal(__dirname);
					counter++;
					return { foo: 'bar' };
				},
				multiple: true
			});

			engine
				.detect({ paths: __dirname })
				.on('results', results => {
					expect(results).to.be.an('array');
					expect(results).to.deep.equal([ { foo: 'bar' } ]);

					engine
						.detect({ paths: __dirname, force: true })
						.on('results', results => {
							expect(results).to.be.an('array');
							expect(results).to.deep.equal([ { foo: 'bar' } ]);
							expect(counter).to.equal(2);
							done();
						})
						.on('error', done);
				})
				.on('error', done);
		});

		it('should handle a path that does not exist', done => {
			const p = path.join(__dirname, 'doesnotexist');
			const engine = new DetectEngine({
				checkDir(dir) {
					expect(dir).to.equal(p);
				},
				multiple: true
			});

			engine
				.detect({ paths: p })
				.on('results', results => {
					expect(results).to.be.an('array');
					expect(results).to.have.lengthOf(0);
					done();
				})
				.on('error', done);
		});

		it('should scan subdirectories if detect function returns falsey result', done => {
			const m = __dirname;
			const p = path.join(__dirname, 'mocks');
			const engine = new DetectEngine({
				checkDir(dir) {
					if (dir === p) {
						return { foo: 'bar' };
					}
				},
				depth: 1,
				multiple: true
			});

			engine
				.detect({ paths: m })
				.on('results', results => {
					expect(results).to.be.an('array');
					expect(results).to.deep.equal([ { foo: 'bar' } ]);
					done();
				})
				.on('error', done);
		});

		it('should return multiple results', done => {
			const engine = new DetectEngine({
				checkDir() {
					return [
						{ foo: 'bar' },
						{ baz: 'wiz' }
					];
				},
				multiple: true
			});

			engine
				.detect({ paths: __dirname })
				.on('results', results => {
					expect(results).to.be.an('array');
					expect(results).to.deep.equal([
						{ foo: 'bar' },
						{ baz: 'wiz' }
					]);
					done();
				})
				.on('error', done);
		});

		it('should update result after second call', done => {
			let counter = 0;
			const engine = new DetectEngine({
				checkDir(dir) {
					expect(dir).to.equal(__dirname);
					if (++counter === 1) {
						return { foo: 'bar' };
					}
					return { baz: 'wiz' };
				},
				multiple: true
			});

			engine
				.detect({ paths: __dirname })
				.on('results', results => {
					expect(results).to.be.an('array');
					expect(results).to.deep.equal([ { foo: 'bar' } ]);

					engine
						.detect({ paths: __dirname, force: true })
						.on('results', results => {
							expect(results).to.be.an('array');
							expect(results).to.deep.equal([ { baz: 'wiz' } ]);
							done();
						})
						.on('error', done);
				})
				.on('error', done);
		});

		it('should call processResults before returning', done => {
			const engine = new DetectEngine({
				checkDir(dir) {
					expect(dir).to.equal(__dirname);
					return { foo: 'bar' };
				},
				processResults(results) {
					expect(results).to.deep.equal({ foo: 'bar' });
					return { baz: 'wiz' };
				}
			});

			engine
				.detect({ paths: __dirname })
				.on('results', results => {
					expect(results).to.deep.equal({ baz: 'wiz' });
					done();
				})
				.on('error', done);
		});

		it('should queue up multiple calls', function (done) {
			this.timeout(5000);
			this.slow(4000);

			let counter = 0;
			const engine = new DetectEngine({
				processResults() {
					counter++;
					return sleep(counter === 1 ? 500 : 50);
				}
			});

			let finishCounter = 0;
			let finishErr;
			function finish(err) {
				err && (finishErr = err);
				if (++finishCounter === 2) {
					done(finishErr);
				}
			}

			engine
				.detect({ paths: __dirname })
				.on('results', () => {
					expect(counter++).to.equal(1);
					finish();
				})
				.on('error', finish);

			setTimeout(() => {
				engine
					.detect({ paths: __dirname })
					.on('results', () => {
						expect(counter++).to.equal(2);
						finish();
					})
					.on('error', finish);
			}, 100);
		});
	});

	describe('watch', () => {
		it('should watch a path for changes', function (done) {
			this.timeout(5000);
			this.slow(4000);

			let counter = 0;
			const tmp = makeTempDir();
			const engine = new DetectEngine({
				checkDir() {
					if (++counter === 1) {
						return null;
					}
					return { foo: 'bar' };
				}
			});

			this.handle = engine
				.detect({ paths: tmp, watch: true })
				.on('results', results => {
					this.handle.stop();
					if (counter === 1) {
						done(new Error('Expected results to be emitted only if result is not null'));
					} else if (counter > 1) {
						expect(results).to.deep.equal({ foo: 'bar' });
						done();
					}
				})
				.on('error', done);

			setTimeout(() => {
				fs.writeFileSync(path.join(tmp, 'foo.txt'), 'bar');
			}, 100);
		});

		it('should watch for updates in a detected path', function (done) {
			this.timeout(5000);
			this.slow(4000);

			let counter = 0;
			const tmp = makeTempDir();
			const testFile = path.join(tmp, 'test.txt');
			fs.writeFileSync(testFile, 'foo');

			const engine = new DetectEngine({
				checkDir(dir) {
					const file = path.join(dir, 'test.txt');
					if (isFile(file)) {
						return { contents: fs.readFileSync(file).toString() };
					}
				}
			});

			this.handle = engine
				.detect({ paths: tmp, watch: true, redetect: true })
				.on('results', results => {
					counter++;
					if (counter === 1) {
						expect(results).to.deep.equal({ contents: 'foo' });
					} else if (counter === 2) {
						expect(results).to.deep.equal({ contents: 'bar' });
						this.handle.stop();
						done();
					}
				})
				.on('error', done);

			setTimeout(() => {
				// update the test file to trigger re-detection
				fs.writeFileSync(testFile, 'bar');
			}, 1000);
		});

		it('should recursivly watch for updateds in a detected path', function (done) {
			this.timeout(5000);
			this.slow(4000);

			let counter = 0;
			const tmp = makeTempDir();
			const subdir = path.join(tmp, 'test');
			fs.mkdirSync(subdir);
			const testFile = path.join(subdir, 'test.txt');
			fs.writeFileSync(testFile, 'foo');

			const engine = new DetectEngine({
				checkDir(dir) {
					const file = path.join(dir, 'test', 'test.txt');
					if (isFile(file)) {
						return { contents: fs.readFileSync(file).toString() };
					}
				}
			});

			this.handle = engine
				.detect({ paths: tmp, watch: true, recursive: true, redetect: true })
				.on('results', results => {
					counter++;
					if (counter === 1) {
						expect(results).to.deep.equal({ contents: 'foo' });
					} else if (counter === 2) {
						expect(results).to.deep.equal({ contents: 'bar' });
						this.handle.stop();
						done();
					}
				})
				.on('error', done);

			setTimeout(() => {
				// update the test file to trigger re-detection
				fs.writeFileSync(testFile, 'bar');
			}, 1000);
		});

		it('should redetect after initial detection', function (done) {
			this.timeout(5000);
			this.slow(4000);

			let checkDirCounter = 0;
			let resultsCounter = 0;
			const tmp = makeTempDir();

			const engine = new DetectEngine({
				checkDir() {
					if (++checkDirCounter === 1) {
						return Promise.resolve()
							.then(() => gawk({ version: '1.0.0' }))
							.catch(() => {});
					}

					return Promise.resolve()
						.then(() => gawk({ version: '2.0.0' }))
						.catch(err => {});
				},
				depth: 1,
				multiple: true
			});

			this.handle = engine
				.detect({ paths: tmp, watch: true, redetect: true })
				.on('results', results => {
					switch (++resultsCounter) {
						case 1:
							expect(results).to.deep.equal([ { version: '1.0.0' } ]);

							// trigger an update
							fs.writeFileSync(path.join(tmp, 'foo.txt'), 'bar');
							break;

						case 2:
							expect(results).to.deep.equal([ { version: '2.0.0' } ]);
							done();
							break;
					}
				});
		});
	});
});