const moment = require('moment');
const yaml = require('yaml');
const EventEmitter = require('events');
const _ = require('lodash');
const Influx = require('influxdb-nodejs');
const vm = require('vm');
const pkg = require('./package');
const debug = require('debug')(pkg.name);

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
  if (opt.user && opt.pass) {
    auth = `${opt.user}:${opt.pass}@`;
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
    const tmpArr = item.split(/\s+/);
    const v = tmpArr[2];
    const value = _.isNumber(v) ? parseFloat(v) : v;
    reader.where(tmpArr[0], value, tmpArr[1]);
  });
}

class Warner extends EventEmitter {
  constructor(data) {
    super();
    this.config = yaml.eval(data);
  }
  check(client, setting) {
    _.forEach(setting, (opts, measurement) => {
      _.forEach(opts, (option) => {
        /* istanbul ignore if */
        if (option.time && !isValidTime(option.time)) {
          return;
        }
        /* istanbul ignore if */
        if (option.day && !isValidDay(option.day)) {
          return;
        }
        const reader = client.query(measurement);
        reader.set(_.pick(option, 'start end'.split(' ')));
        addFunction(reader, option.func);
        addGroup(reader, option.group);
        addWhere(reader, option.where);
        reader.set('format', 'json');
        const ql = reader.toSelect();
        reader.then((data) => {
          debug('ql:%s, result:%j', ql, data);
          _.forEach(data[measurement], (item) => {
            const key = option.check.split(' ')[0];
            const script = new vm.Script(`matched = ${option.check}`);
            const context = vm.createContext(_.extend({
              matched: false,
            }, item));
            script.runInContext(context);
            debug('context:%j', context);
            if (context.matched) {
              this.emit('warn', {
                measurement,
                ql,
                text: option.text,
                value: item[key],
              });
            }
          });
        }).catch((err) => {
          /* istanbul ignore next */
          if (this.listenerCount('error')) {
            this.emit('error', err);
          }
        });
      });
    });
  }
  start(interval, promise) {
    const p = promise || Promise.resolve();
    const run = () => {
      _.forEach(this.config, (item, database) => {
        const options = _.extend({
          database,
        }, _.pick(item, ['protocol', 'host', 'port', 'user', 'pass']));
        const url = getUrl(options);
        const client = new Influx(url);
        this.check(client, item.measurement);
      });
    };
    p.then(run);
    /* istanbul ignore next */
    return setInterval(() => {
      p.then(run);
    }, interval).unref();
  }
}

module.exports = Warner;
