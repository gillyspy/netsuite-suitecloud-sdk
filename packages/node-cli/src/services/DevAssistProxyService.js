/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';
const http = require('node:http');
const https = require('node:https');
const { getAuthIds } = require('../utils/AuthenticationUtils');
const NodeTranslationService = require('./NodeTranslationService');
const { DEV_ASSIST_PROXY_SERVICE, ANSWERS_VALIDATION_MESSAGES } = require('./TranslationKeys');

const LOCAL_HOSTNAME = '127.0.0.1';

module.exports = class DevAssistProxyService {

	constructor(sdkPath) {
		this._sdkPath = sdkPath;
		this._proxy = http.createServer();
	}

	async start(authId, localPort) {

		//Parameters validation
		if (!authId) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.MISSING_AUTH_ID);
		}

		if (!localPort) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.MISSING_PORT);
		}

		if(isNaN(localPort)){
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.PORT_MUST_BE_NUMBER);
		}

		let { accessToken, hostName } = await this._retrieveAccessToken(authId);

		//TODO check a server is running or not


		this._proxy.addListener("request", async (req, res) => {
			console.log(`${req.method} ${req.url}`);

			const authorization = "Bearer " + accessToken;
			const options = {
				hostname: hostName,
				port: 443,
				path: req.url,
				method: req.method,
				headers: {...req.headers, authorization},
			};

			// Add agent for insecure connections when connecting to runboxes
			if (hostName && hostName.includes('vm.eng')) {
				console.log("Disabling reject unauthorized");
				options.agent = new https.Agent({
					rejectUnauthorized: false
				});
				options.rejectUnauthorized = false;
			}

			console.log('Target: ' + options.hostname);
			console.log('Path: ' + options.path);
			console.log('Authorization: ' + (options.headers?.authorization?.substring(0, 20) + '...'));

			const proxyReq = https.request(options, (proxyRes) => {
				console.log(`Proxy response: ${proxyRes.statusCode}`);

				if (proxyRes.statusCode == 401) {
					//checkIfReauthorizationIsNeeded ==> if false ==> forceRefreshAuthorization y devuelve el token
					//I have to do the petition again
				    //if true then I need to send you the
					//emit reauthorize event and forward a message to the
				}

				res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
				proxyRes.pipe(res, { end: true });
			});

			proxyReq.on('error', (err) => {
				console.error('Proxy request error:', err);
				res.writeHead(500);
				res.end('SuiteCloud Proxy error: ' + err.message);
			});

			req.pipe(proxyReq, { end: true });

		});

		this._proxy.listen(localPort, LOCAL_HOSTNAME, () => {
			const localURL = `http://${LOCAL_HOSTNAME}:${localPort}`
			console.log(`SuiteCloud Proxy server listening on ${localURL}`);
			console.log(`Set Cline Base URL to: ${localURL}/api/internal/devassist`);
			console.log('SuiteCloud Proxy running.');
			console.log(`Configure Cline Base URL to: ${localURL}/api/internal/devassist`);
			console.log(`SuiteCloud Proxy server listening on ${localURL}`);
			console.log(`SuiteCloud Proxy is using the ${authId} authID`);
			console.log(`Configure Cline Base URL to: ${localURL}/api/internal/devassist`);
		});
	}

	async stop() {
		if (this._proxy.listening) {
			this._proxy.close(() => {
				console.log('SuiteCloud Proxy stopped.');
				console.log('SuiteCloud Proxy stopped.');
				console.log('SuiteCloud Proxy stopped.');
				return new Promise((resolve) => { })
			});
		}
	}

	async _retrieveAccessToken(authId) {
		const authIDActionResult = await getAuthIds(this._sdkPath);

		if (!authIDActionResult.isSuccess()) {
			throw authIDActionResult.errorMessages;
		}

		if (!authIDActionResult.data.hasOwnProperty(authId)) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.NOT_EXISTING_AUTH_ID, authId);
		}
		return {
			accessToken: authIDActionResult.data[authId].token.accessToken,
			hostName: authIDActionResult.data[authId].hostInfo.hostName,
		}
	}
};
