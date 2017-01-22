const assert = require('assert');
const path = require('path');
const Influx = require('influxdb-nodejs');
const _ = require('lodash');
const configFile = path.join(__dirname, '../example/config.yml');
const Warner = require('..');
const config = require('fs')
  .readFileSync(configFile, 'utf8');
const yaml = require('yaml');

function randomChar(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
  const charsCount = chars.length;
  const arr = [];
  for (let i = 0; i < length; i += 1) {
    arr.push(chars[_.random(0, charsCount)]);
  }
  return arr.join('');
}

function randomWrite(client) {
  client.write('login')
    .tag({
      result: _.sample(['success', 'fail']),
      type: _.sample(['vip', 'normal']),
      os: _.sample(['ios', 'android', 'others']),
    })
    .field({
      account: randomChar(6),
    })
    .queue();
}

describe('influxdb-warner', () => {
  const warner = new Warner(config);
  it('init', (done) => {
    const max = 100;
    const client = new Influx('http://127.0.0.1:8086/warner');
    client.dropDatabase()
      .then(() => {
        return client.createDatabase();
      })
      .then(() => {
        for (let i = 0; i < max; i++) {
          randomWrite(client);
        }
        return client.syncWrite();
      })
      .then(() => {
        return client.query('login')
          .set('format', 'json');
      })
      .then((data) => {
        assert.equal(data.login.length, max);
        done();
      }).catch(done);
  });

  it('check', (done) => {
    let count = 0;
    warner.on('warn', (data) => {
      assert.equal(data.measurement, 'login');
      assert(data.value);
      const qlIndex = _.indexOf([
        'select count("account") from "login" where "result" = \'success\' and time >= now() - 5m',
        'select count("account") from "login" where "result" = \'fail\'',
        'select count("account") from "login" where "result" = \'fail\' group by "type"',
      ], data.ql);
      assert(qlIndex !== -1);
      const textIndex = _.indexOf([
        'The count of successful login is abnormal',
        'The count of failed login is abnormal',
        'The count of failed login(group by account\'s type) is abnormal',
      ], data.text);
      assert(textIndex !== -1);
      count++;
      if (count >= 4) {
        done();
      }
    }).on('error', done);
    const delay = (ms) => {
      return new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
    };
    warner.start(10 * 1000, delay(10));
  });
});
