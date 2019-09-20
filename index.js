'use strict';

const chalk = require('chalk');
const prompt = require('prompt');
const messagePrefix = 'Google Bucket Remover: ';
const wait = ms => new Promise((r, j) => setTimeout(r, ms));

class Remover {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('google');

    this.commands = {
      gbucketremove: {
        usage: 'Remove all files in Google buckets',
        lifecycleEvents: [
          'remove'
        ],
        options: {
          verbose: {
            usage: 'Increase verbosity',
            shortcut: 'v'
          }
        }
      }
    };

    this.hooks = {
      'before:remove:remove': () => Promise.resolve().then(this.remove.bind(this)),
      'gbucketremove:remove': () => Promise.resolve().then(this.remove.bind(this))
    };
  }

  log(message) {
    if (this.options.verbose) {
      this.serverless.cli.log(message);
    }
  }

  remove() {
    const self = this;

    const getAllKeys = (bucket) => {
      const get = (src = {}) => {
        const keys = src.keys || [];
        const param = {
          bucket: bucket
        };
        if (src.nextPageToken) {
          param.pageToken = src.nextPageToken;
        }
        return self.provider.request('storage', 'objects', 'list',  param).then((result) => {
          return new Promise((resolve) => {
             if (!result.items || !result.items.length) {
               resolve({keys: [], nextPageToken: ""})
             }
             let newKeys = result.items.map((item) => {
               return {
                 bucket: bucket,
                 object: item.name
               }
             });
            resolve({keys: keys.concat(newKeys), nextPageToken: result.nextPageToken});
          });
        });
      };
      const list = (src = {}) => {
        return get(src).then((result) => result.nextPageToken ? list(result) : result);
      };
      return list();
    };
    const executeRemove = (params) => {
      return Promise.all(params.keys.map(param => {
        return self.provider.request('storage', 'objects', 'delete', param);
      }));
    };
    const removeAll = (b) => {
      return getAllKeys(b).then((params) => {params===[] ? executeRemove(params).then(() => {removeAll(b)}) : params})
    };

    const populateConfig = () => {
      return this.serverless.variables.populateObject(this.serverless.service.custom.remover)
        .then(fileConfig => {
          const defaultConfig = {
            prompt: false,
            buckets: [],
          };
          return Object.assign({}, defaultConfig, fileConfig);
        });
    };

    return new Promise((resolve) => {
      return populateConfig().then(config => {
        if (!config.prompt) {
          let promisses = [];
          for (const b of config.buckets) {
            promisses.push(removeAll(b).then(() => {
              const message = `Success: ${b} is empty.`;
              self.log(message);
              self.serverless.cli.consoleLog(`${messagePrefix}${chalk.yellow(message)}`);
            }).catch((err) => {
              const message = `Faild: ${b} may not be empty: ${err}`;
              self.log(message);
              self.log(err);
              self.serverless.cli.consoleLog(`${messagePrefix}${chalk.yellow(message)}`);
              throw new Error("gbucket empty failed");
            }));
          }
          promisses.push(wait(5000));
          return Promise.all(promisses).then(resolve);
        }
        prompt.message = messagePrefix;
        prompt.delimiter = '';
        prompt.start();
        const schema = {properties: {}};
        config.buckets.forEach((b) => {
          schema.properties[b] = {
            message: `Make ${b} empty. Are you sure? [yes/no]:`,
            validator: /(yes|no)/,
            required: true,
            warning: 'Must respond yes or no'
          };
        });
        prompt.get(schema, (err, result) => {
          let promisses = [];
          for (const b of config.buckets) {
            if (result[b].match(/^y/)) {
              promisses.push(getAllKeys(b).then(executeRemove).then(() => {
                const message = `Success: ${b} is empty.`;
                self.log(message);
                self.serverless.cli.consoleLog(`${messagePrefix}${chalk.yellow(message)}`);
              }).catch(() => {
                const message = `Faild: ${b} may not be empty.`;
                self.log(message);
                self.serverless.cli.consoleLog(`${messagePrefix}${chalk.yellow(message)}`);
              }));
            } else {
              promisses.push(Promise.resolve().then(() => {
                const message = `Remove cancelled: ${b}`;
                self.log(message);
                self.serverless.cli.consoleLog(`${messagePrefix}${chalk.yellow(message)}`);
              }));
            }
          }
          Promise.all(promisses).then(resolve);
        });
      });
    });
  }
}

module.exports = Remover;
