"use strict";

const _            = require('lodash'),
      http         = require('http'),
      express      = require('express'),
      addRequestId = require('express-request-id')(),
      session      = require('express-session'),
      mongoose     = require('mongoose'),
      cookieParser = require('cookie-parser'),
      EventEmitter = require('events'),
      handlebars   = require('express-handlebars'),
      MongoDBStore = require('connect-mongodb-session')(session);

class Expresso extends EventEmitter {

    /**
     * @param {object} config                               Configuration for this instance
     * @param {number} config.port                          HTTP port to listen on
     * @param {bunyan} config.logger                        Bunyan logger
     * @param {string} [config.loggerContext]               Logger context. Defaults to HTTP
     * @param {string} config.sessionsEnabled               Set to false to turn session off. Defaults to true
     * @param {string} config.sessionSecret                 Session cookie secret
     * @param {string} config.sessionName                   Session cookie name
     * @param {string} config.sessionCollection             Session collection
     * @param {string} config.handlebarLayoutDir            Handlebars layout directory
     * @param {string} config.handlebarTemplateDir          Handlebars template directory
     * @param {string} config.databaseConnectionString      MongoDB connectionString
     * @param {string} config.databaseReplicaSet            MongoDB replica set name
     *
     */
    constructor( config ) {

        super();
        this._config = config;
        this.enableLogger();
        this.startHttpServer();
        this.setSessions();
        this.setLogging();
    }

    enableLogger() {
        if ( this.config.logger ) {
            this._log = this.config.logger.child({ context: this.config.loggerContext || 'HTTP' });
        } else {
            console.error('[expresso] No logger was passed to expresso.');
        }
    }

    startHttpServer() {
        this.log.info(`[expresso] starting http server on port ${this.config.port}`);
        this._express = express();
        this._server  = http.createServer(this._express);
        this._express.engine('handlebars', handlebars({
            defaultLayout: 'main',
            layoutsDir:    this.config.handlebarLayoutDir,
            partialsDir:   this.config.handlebarTemplateDir
        }));
        this._express.set('view engine', 'handlebars');
        this._express.set('views', this.config.handlebarTemplateDir);
        this._express.enable('trust proxy');
        this._express.set('x-powered-by', false);
        this._express.listen(this.config.port);
        this.handleServerError();
    }

    handleServerError() {
        this._server.on('error', error => {
            this.log.error(error, '[expresso] Error on http server', error);
            if ( error && (error.code === 'EADDRINUSE' || error.errno === 'EADDRINUSE') ) {
                this.portRetryTimeout += _.random(4 * 1000, 20 * 1000);
                if ( this.portRetryTimeout > (60 * 60 * 1000) ) {
                    this.portRetryTimeout = 60 * 1000;
                }
                this.log.info(`[expresso]  will retry port ${this.config.port} in ${this.portRetryTimeout / 1000} seconds`);
                setTimeout(()=> {
                    this.log.info(`[expresso] retrying to listen on ${this.config.port}`);
                    this._server(this.port);
                }, this.portRetryTimeout);
            }
        });
    }

    setLogging() {
        this._express.use(addRequestId);
        this._express.use(( req, res, next )=> {
            req.log = res.log = this._log.child({
                requestId: req.id
            });
            req.log.info({ req: req }, 'request', req.url);
            res.id = req.id;
            next();
        });
    }

    get router() {
        return this._express;
    }

    setSessions() {

        if ( this.config.sessionsEnabled === false ) {
            return false;
        }

        this._cookieParser = cookieParser();
        this._express.use(this._cookieParser);

        this.sessionStore = new MongoDBStore({
            collection:         this.config.sessionCollection,
            uri:                this.config.databaseConnectionString,
            ttl:                30 * 60,
            autoRemove:         'interval',
            autoRemoveInterval: 10,
            connectionOptions:  {
                replset: {
                    poolSize:          1,
                    socketOptions:     {
                        connectTimeoutMS: 60 * 1000
                    },
                    auto_reconnect:    true,
                    reconnectTries:    86400,
                    reconnectInterval: 1000,
                    rs_name:           this.config.databaseReplicaSet
                },
                server:  {
                    auto_reconnect:    true,
                    reconnectTries:    86400,
                    reconnectInterval: 1000
                },
                db:      {
                    readPreference: 'secondaryPreferred'
                }
            }
        });

        this.sessionStore.on('error', error => {
            this.log.error(error, '[expresso] error on session store', error);
        });

        this._session = session({
            secret:            this.config.sessionSecret,
            cookie:            {
                //== X-Forwarded-Proto must be available for this to work.
                secure:   true,
                httpOnly: true
            },
            name:              this.config.sessionName,
            saveUninitialized: true,
            proxy:             true,
            resave:            false,
            store:             this.sessionStore
        });

        this._express.use(this._session);

    }

    get config() {
        return this._config;
    }

    get log() {
        return this._log;
    }
}

module.exports = Expresso;
