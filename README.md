# influxdb-warner

[![Build Status](https://travis-ci.org/vicanso/influxdb-warner.svg?branch=master)](https://travis-ci.org/vicanso/influxdb-warner)
[![Coverage Status](https://img.shields.io/coveralls/vicanso/influxdb-warner/master.svg?style=flat)](https://coveralls.io/r/vicanso/influxdb-warner?branch=master)
[![npm](http://img.shields.io/npm/v/influxdb-warner.svg?style=flat-square)](https://www.npmjs.org/package/influxdb-warner)
[![Github Releases](https://img.shields.io/npm/dm/influxdb-warner.svg?style=flat-square)](https://github.com/vicanso/influxdb-warner)

I used `influxdb` to record system performance statistics and monitoring, but at work I was not able to keep a close eye on statistical graphs, so I wrote `influxdb-warner` to read the most recent `influxdb` data using a simple configuration. When the check function is fail, then trigger a warn event. In the event I can send e-mail(I use this way), play a specific sound, etc., so I can handle the exception asap.

### Installation

```bash
npm install influxdb-warner
```

### API

#### start

- `interval`  Check interval

- `beforeCheck` The function return promise for control check, if resolve, the check will be continued. Otherwise this time will be passed. [optional]

```js
const Warner = require('influxdb-warner');
const yamlConfig = require('fs').readFileSync('./config.yml', 'utf8');
const warner = new Warner(yamlConfig);
warner.on('warn', (data) => {
  // { measurement: 'login',
  //   ql: 'select count("account") from "login" where "result" = \'fail\' group by "type"',
  //   text: 'The count of failed login(group by account\'s type) is abnormal',
  //   ... }
  // send email
});
warner.start(60 * 1000, () => Promise.resolve());
```

```yaml
# the influxdb database
warner:
  # the inflxudb host
  host: "127.0.0.1"
  # the influxdb port, default is 8086, [optional]
  port: 8086
  # the influxdb protocol, default is "http", [optional]
  protocol: http
  # the user for influxdb, [optional]
  # user: user
  # the password for influxdb, [optional]
  # password: password
  measurement:
    login:
      -
        # pass the check
        # [optional]
        pass: false
        # day filter, Monday:1, ... Sunday:7
        # [optional]
        # eg: "1-7" means Monday to Sunday
        # eg: ["1-3", "6-7"] means Monday to Wednesday
        # and Saturday to Sunday
        day: "1-7"
        # time filter
        # [optional]
        # eg: "00:00-12:00", or ["00:00-09:00", "13:00-18:00"]
        time: "00:00-24:00"
        # when the check is fail, the warn text
        text: The count of successful login is abnormal
        # the influxdb where conditions
        # [optional]
        where:
          - result = success
        # the start time of influxdb query
        # [optional]
        start: "-5m"
        # the ene time of influxdb query, default is now()
        # [optional]
        # end: "now()"
        # the influxdb function for data
        # [optional]
        func:
          - count(account)
        # check for each series of the result,
        # if the check return true,
        # the warn event will be emited
        check: count < 100
      -
        day: ["1", "2", "3", "4", "5", "6", "7"]
        time: ["00:00-12:00", "12:00-24:00"]
        text: The count of failed login is abnormal
        where:
          - result = fail
        func:
          - count(account)
        check: count > 10
      -
        text: The count of failed login(group by account's type) is abnormal
        group: type
        where:
          - result = fail
        func:
          - count(account)
        check:
          - count > 1 && type === 'vip'
          - count > 1 && type === 'normal'
      -
        day: "1-2"
        text: The check is pass
        pass: true
        check: type === 'test'
```

### timeout

- `ms` the timeout value

Set the query timeout

```js
const Warner = require('influxdb-warner');
const yamlConfig = require('fs').readFileSync('./config.yml', 'utf8');
const warner = new Warner(yamlConfig);
warner.timeout(5000);
```
