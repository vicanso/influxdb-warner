const Promise = require('bluebird');
const moment = require('moment');
const yaml = require('yaml');
const EventEmitter = require('events');
const _ = require('lodash');
const Influx = require('influxdb-nodejs');
const vm = require('vm');
const pkg = require('./package');
const debug = require('debug')(pkg.name);

const defaultChecker = () => Promise.resolve();

/**
 * getUrl - Get the influxdb connect url
 * @param  {Object} opt The connect option
 * @return {String}     [description]
 */
function getUrl(opt) {
  const protocol = opt.protocol || 'http';
  const port = opt.port || 8086;
  let auth = '';
  /* istanbul ignore if */
  if (opt.user && opt.password) {
    auth = `${opt.user}:${opt.password}@`;
  }
  return `${protocol}://${auth}${opt.host}:${port}/${opt.database}`;
}

/**
 * isValidDay - validate the day
 * @param  {[type]}  desc [description]
 * @return {Boolean}      [description]
 */
function isValidDay(desc) {
  const dayList = _.isArray(desc) ? desc : [desc];
  const currentDay = new Date().getDay() + 1;
  const result = _.map(dayList, (item) => {
    const arr = item.split('-');
    if (currentDay < arr[0]) {
      return false;
    }
    /* istanbul ignore if */
    if (arr[1] && currentDay > arr[1]) {
      return false;
    }
    return true;
  });
  return _.some(result);
}

/**
 * isValidTime - validate the time
 * @param  {[type]}  desc [description]
 * @return {Boolean}      [description]
 */
function isValidTime(desc) {
  const timeList = _.isArray(desc) ? desc : [desc];
  const result = _.map(timeList, (item) => {
    const arr = item.split('-');
    const time = moment().format('HH:mm');
    /* istanbul ignore if */
    if (time < arr[0]) {
      return false;
    }
    /* istanbul ignore if */
    if (arr[1] && time > arr[1]) {
      return false;
    }
    return true;
  });
  return _.some(result);
}

/**
 * addFunction - add the function for the reader
 * @param {[type]} reader [description]
 * @param {[type]} func   [description]
 */
function addFunction(reader, func) {
  /* istanbul ignore if */
  if (!func) {
    return;
  }
  const arr = _.isArray(func) ? func : [func];
  _.forEach(arr, (item) => {
    const reg = /([\s\S]+)\(([\s\S]+)\)/;
    const result = reg.exec(item);
    const args = [result[1]].concat(result[2].split(','));
    reader.addFunction(...args);
  });
}

/**
 * addGroup - add the group for the reader
 * @param {[type]} reader [description]
 * @param {[type]} group  [description]
 */
function addGroup(reader, group) {
  /* istanbul ignore if */
  if (!group) {
    return;
  }
  const arr = _.isArray(group) ? group : [group];
  _.forEach(arr, item => reader.addGroup(item));
}

function addWhere(reader, where) {
  /* istanbul ignore if */
  if (!where) {
    return;
  }
  const arr = _.isArray(where) ? where : [where];
  _.forEach(arr, (item) => {
    const reg = /^\d+(\.\d+)?$/;
    const tmpArr = item.split(/\s+/);
    const v = tmpArr[2];
    const value = reg.test(v) ? parseFloat(v) : v;
    reader.where(tmpArr[0], value, tmpArr[1]);
  });
}

class Warner extends EventEmitter {
  constructor(data, options) {
    super();
    this.config = yaml.eval(data);
    this.options = options || {};
  }
  timeout(ms) {
    this.options.timeout = ms;
  }
  check(client, setting) {
    const options = [];
    _.forEach(setting, (opts, measurement) => {
      _.forEach(opts, (option) => {
        const item = _.extend({
          measurement,
        }, option);
        options.push(item);
      });
    });
    const checker = (option) => {
      const measurement = option.measurement;
      if (option.pass) {
        return Promise.resolve();
      }
      /* istanbul ignore if */
      if (option.time && !isValidTime(option.time)) {
        return Promise.resolve();
      }
      /* istanbul ignore if */
      if (option.day && !isValidDay(option.day)) {
        return Promise.resolve();
      }
      const reader = client.query(measurement);
      reader.set(_.pick(option, 'start end'.split(' ')));
      addFunction(reader, option.func);
      addGroup(reader, option.group);
      addWhere(reader, option.where);
      reader.set('format', 'json');
      const ql = reader.toSelect();
      return reader.then((data) => {
        debug('ql:%s, result:%j', ql, data);
        _.forEach(data[measurement], (item) => {
          const arr = _.isArray(option.check) ? option.check : [option.check];
          const checkList = _.map(arr, str => `(${str})`);
          const script = new vm.Script(`matched = ${checkList.join(' || ')}`);
          const context = vm.createContext(_.extend({
            matched: false,
          }, item));
          script.runInContext(context);
          debug('context:%j', context);
          if (context.matched) {
            this.emit('warn', _.extend({
              measurement,
              ql,
              text: option.text,
            }, item));
          }
        });
      }).catch((err) => {
        /* eslint no-param-reassign:0 */
        err.ql = ql;
        /* istanbul ignore next */
        if (this.listenerCount('error')) {
          this.emit('error', err);
        }
      });
    };
    return Promise.map(options, checker, {
      concurrency: 10,
    });
  }
  start(interval, beforeCheck = defaultChecker) {
    const run = () => {
      _.forEach(this.config, (item, database) => {
        const options = _.extend({
          database,
        }, _.pick(item, ['protocol', 'host', 'port', 'user', 'pass']));
        const url = getUrl(options);
        const client = new Influx(url);
        if (this.options.timeout) {
          client.timeout = this.options.timeout;
        }
        this.check(client, item.measurement);
      });
    };
    /* eslint no-console:0 */
    beforeCheck().then(run)
      .catch(() => console.info('This time the check will be pass'));
    /* istanbul ignore next */
    return setInterval(() => {
      /* eslint no-console:0 */
      beforeCheck().then(run)
        .catch(() => console.info('This time the check will be pass'));
    }, interval).unref();
  }
}

module.exports = Warner;
