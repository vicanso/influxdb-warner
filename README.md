# influxdb-warner

I used `influxdb` to record system performance statistics and monitoring, but at work I was not able to keep a close eye on statistical graphs, so I wrote `influxdb-warner` to read the most recent `influxdb` data using a simple configuration. When the check function is fail, then trigger a warn event. In the event I can send e-mail(I use this way), play a specific sound, etc., so I can handle the exception asap.

### Installation

```bash
npm install influxdb-warner
```

### API

```js
const Warner = require('influxdb-warner');
const yamlConfig = require('fs').readFileSync('./config.yml', 'utf8');
const warner = new Warner(yamlConfig);
warner.on('warn', (data) => {
  // { measurement: 'login',
  //   ql: 'select count("account") from "login" where "result" = \'fail\' group by "type"',
  //   text: 'The count of failed login(group by account\'s type) is abnormal',
  //   value: 34 }
  // send email
});
```

```yaml
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
  # pass: pass
  measurement:
    login:
      -
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
        end: "now()"
        # the influxdb function for data
        # [optional]
        func:
          - count(account)
        # check for each series of the result,
        # if the check return true,
        # the warn event will be emited
        check: count < 60
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
        check: count > 1
```
