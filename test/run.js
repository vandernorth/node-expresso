"use strict";
const Expresso      = require('../bin/index'),
      bunyan        = require('bunyan'),
      requestLogger = req => {
          return {
              host:    req.hostname,
              session: req.session
          };
      },
      config        = {
          sessionsEnabled:          true,
          sessionCollection:        'sessions',
          sessionName:              'expresso-session',
          sessionSecret:            'I<3Expresso',
          logger:                   bunyan.createLogger({
              src:         true,
              name:        'expresso-test',
              streams:     [{
                  level:  'debug',
                  stream: process.stdout
              }],
              serializers: { req: requestLogger }
          }),
          loggerContext:            'HTTP-EXPRESSO',
          port:                     50011,
          handlebarLayoutDir:       __dirname + '/views',
          handlebarTemplateDir:     __dirname + '/views',
          databaseConnectionString: 'mongodb://localhost:27017/sessionStore',
          contentSecurity:          true
      },
      expresso      = new Expresso(config);

expresso.router.use(( req, res, next ) => {
    req.session.createdAt = new Date();
    req.session.someValue = 'session-value';
    next();
});

expresso.router.get('/', ( req, res ) => {
    res.render('test');
});

expresso.router.get('/session', function ( req, res ) {
    res.end('Session: ' + JSON.stringify(req.session));
});

module.exports = expresso;