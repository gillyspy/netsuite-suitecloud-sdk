import * as vscode from 'vscode';
// import SuiteCloudProxy from './SuiteCloudProxy';
import { VSCODE_PLATFORM } from '../ApplicationConstants';
import { getSdkPath } from '../core/sdksetup/SdkProperties';
import VSConsoleLogger from "../loggers/VSConsoleLogger";
import MessageService from '../service/MessageService';
import { REFRESH_AUTHORIZATION } from '../service/TranslationKeys';
import { VSTranslationService } from '../service/VSTranslationService';
import type { DevAssistProxyService as DevAssistProxyServiceType } from '../util/ExtensionUtil';
import { AuthenticationUtils, DevAssistProxyService, ExecutionEnvironmentContext } from '../util/ExtensionUtil';


// CONSTANTS
const defaultSettings = {
    enableProxy: false,
    proxyPort: 8181,
    authID: 'runbox'
}

const proxyServiceEvents = {
    reauthorize: 'authRefreshManual'
}

// should be in sycn with vscode-extension package.json config properties
const configKeys = {
    devAssistSection: 'suitecloud.devAssist',
    enableProxy: 'enable',
    auhtID: 'authID',
    proxyPort: 'proxyPort'
}

const executionEnvironmentContext = new ExecutionEnvironmentContext({
    platform: VSCODE_PLATFORM,
    platformVersion: vscode.version,
});

let devAssistProxy: DevAssistProxyServiceType;
const vsLogger: VSConsoleLogger = new VSConsoleLogger();
const messageService = new MessageService('DevAssistProxy');
const translationService = new VSTranslationService();


export const startDevAssistProxyIfEnabled = async () => {
    const { devAssistAuthID, enableProxy, localPort } = getSettingsParams();

    if (enableProxy) {
        try {
            initializeDevAssistProxy();
            await devAssistProxy.start(devAssistAuthID, localPort);
            vsLogger.info(`DevAssit service running. Using auhtID ${devAssistAuthID} and localPort ${localPort}.`)
        } catch (error) {
            vsLogger.error(`There was a problem when starting the DevAssist service at startup.\n${error}`);
        }
    } else {
        if (devAssistProxy) {
            // this shouldn't happen
            vsLogger.info("Stoping DevAssist proxy. This shouldn't happen.");
            devAssistProxy.stop()
        }
        vsLogger.log('DevAssist service is not enabledß.')
    }

    // just for testing purposes
    return devAssistProxy;
}

const initializeDevAssistProxy = () => {
    const { devAssistAuthID, localPort } = getSettingsParams()

    try {
        devAssistProxy = new DevAssistProxyService(getSdkPath(), executionEnvironmentContext);
        vsLogger.info(`DevAssist initialized using authID: ${devAssistAuthID} and port: ${localPort}`)

        devAssistProxy.on(proxyServiceEvents.reauthorize, async (emitParams: { authId: string, message: string }) => {

            const { devAssistAuthID, localPort } = getSettingsParams()
            // TODO: not sure which authID we should use or if they could be different at all

            const refreshIsSuccessful = await refreshAuthorizationWithNotifications(emitParams.authId);
            // TODO: we could be using something like devAsssitProxy.reloadAccessToken() to avoid extra forceRefresh in next cline request
            if (refreshIsSuccessful) {
                devAssistProxy.stop();
                devAssistProxy.start(emitParams.authId, localPort);
                 vsLogger.info(`DevAssist service started. Using authId: ${emitParams.authId}, localPort: ${localPort}`);
            }
        })
    } catch (error) {
        vsLogger.error(`There was an error when initializing DevAssist service.\n${error}`)
    }


};

const getSettingsParams = (): { enableProxy: boolean, devAssistAuthID: string, localPort: number } => {
    const devAssistConfig = vscode.workspace.getConfiguration(configKeys.devAssistSection);

    const enableProxy = devAssistConfig.get<boolean>(configKeys.enableProxy) || defaultSettings.enableProxy;
    const devAssistAuthID = devAssistConfig.get<string>(configKeys.auhtID) || defaultSettings.authID;
    const localPort = devAssistConfig.get<number>(configKeys.proxyPort) || defaultSettings.proxyPort;

    return { enableProxy, devAssistAuthID, localPort }
}

// refresh authorization with notification popups 
const refreshAuthorizationWithNotifications = async (authID: string) => {
    const executionEnvironmentContext = new ExecutionEnvironmentContext({
        platform: VSCODE_PLATFORM,
        platformVersion: vscode.version,
    });
    messageService.showInformationMessage(
        translationService.getMessage(
            REFRESH_AUTHORIZATION.CREDENTIALS_NEED_TO_BE_REFRESHED, authID
        )
    );
    const refreshAuthzOperationResult = await AuthenticationUtils.refreshAuthorization(
        authID,
        getSdkPath(),
        executionEnvironmentContext
    );
    console.log('log from refreshAuthorization DevAssistConfiguration.', { refreshAuthzOperationResult });
    vsLogger.info('log from refreshAuthorization DevAssistConfiguration.')
    vsLogger.info(JSON.stringify(refreshAuthzOperationResult))

    if (!refreshAuthzOperationResult.isSuccess()) {
        // throw refreshAuthzOperationResult.errorMessages;
        messageService.showCommandError(refreshAuthzOperationResult.errorMessages.join('\n'), false);
        return false;
    }
    messageService.showInformationMessage(
        translationService.getMessage(
            REFRESH_AUTHORIZATION.AUTHORIZATION_REFRESH_COMPLETED
        )
    );
    return true;
}




export const devAssistConfigurationChangeHandler = async (configurationChangeEvent: vscode.ConfigurationChangeEvent) => {
    if (configurationChangeEvent.affectsConfiguration(configKeys.devAssistSection)) {
        const { devAssistAuthID, enableProxy, localPort } = getSettingsParams()
        console.log('DevAssist Proxy enabled: ' + enableProxy);
        if (enableProxy === true) {
            if (devAssistProxy) {
                devAssistProxy?.stop();
            } else {
                initializeDevAssistProxy();
            }
            try {
                vsLogger.info(`About to start DevAssist service. Using authId: ${devAssistAuthID}, localPort: ${localPort}`);
                await devAssistProxy.start(devAssistAuthID, localPort);
                vsLogger.info(`DevAssist service started. Using authId: ${devAssistAuthID}, localPort: ${localPort}`);
            } catch (error) {
                vsLogger.error(`Problem starting DevAssist service.\n${error}`);
            }
        } else {
            await devAssistProxy?.stop();
        }
    }
};
