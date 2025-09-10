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
    const devAssistConfig = vscode.workspace.getConfiguration(configKeys.devAssistSection);
    const { devAssistAuthID, enableProxy, localPort } = getSettingsParams();

    if (enableProxy) {
        let mutableAuhtID = devAssistAuthID;

        // check if authID exists on credentials
        const localStoredAuthData = await AuthenticationUtils.getAuthIds(getSdkPath());
        if (!localStoredAuthData.data[devAssistAuthID]) {
            // get first available authID as a backup plan
            mutableAuhtID = Object.keys(localStoredAuthData.data)[0];
            devAssistConfig.update(configKeys.auhtID, mutableAuhtID, vscode.ConfigurationTarget.Global);
        }

        try {
            initializeDevAssistProxy();
            await devAssistProxy.start(mutableAuhtID, localPort);
            console.log('Show notificaion about DevAssit proxy running.')
            // devAssistProxy.emit('reauthorize', devAssistAuthID);
        } catch (error) {
            console.log('There was a problem when starting the DevAssistProxy', { error });
        }
    } else {
        if (devAssistProxy) {
            // this shouldn't happen
            console.log("Stoping DevAssist proxy. This shouldn't happen.");
            devAssistProxy.stop()
        }
        console.log('DevAssist Authentication proxy is disabled.')
    }

    // just for testing purposes
    return devAssistProxy;
}

const initializeDevAssistProxy = () => {
    // TODO remove port and authid from initialization
    const { devAssistAuthID, localPort } = getSettingsParams()

    devAssistProxy = new DevAssistProxyService(getSdkPath(), executionEnvironmentContext);
    // devAssistProxy.start(devAssistAuthID, localPort);
    vsLogger.info(`Starting DevAssist Proxy started using authID: ${devAssistAuthID} and port: ${localPort}`)

    devAssistProxy.on('reauthorize', async (authID: string) => {
        // show message to user and
        vsLogger.info('Time to reauthorize')
        const { devAssistAuthID, localPort } = getSettingsParams()
        await refreshAuthorization(authID);
        devAssistProxy.stop();
        devAssistProxy.start(devAssistAuthID, localPort);
    })
};

const getSettingsParams = (): { enableProxy: boolean, devAssistAuthID: string, localPort: number } => {
    const devAssistConfig = vscode.workspace.getConfiguration(configKeys.devAssistSection);

    const enableProxy = devAssistConfig.get<boolean>(configKeys.enableProxy) || defaultSettings.enableProxy;
    const devAssistAuthID = devAssistConfig.get<string>(configKeys.auhtID) || defaultSettings.authID;
    const localPort = devAssistConfig.get<number>(configKeys.proxyPort) || defaultSettings.proxyPort;

    return { enableProxy, devAssistAuthID, localPort }
}

// refresh authorization with notification popups 
const refreshAuthorization = async (authID: string) => {
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
                await devAssistProxy.start(devAssistAuthID, localPort);
            } catch (error) {
                console.log('Problem starting DevAssist proxy', { error });
            }
        } else {
            await devAssistProxy?.stop();
        }
    }
};
