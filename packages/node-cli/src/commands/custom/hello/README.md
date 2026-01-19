# Experimenting with creating a custom command inside the cli

this is a hello world example


# TODO
- copying from another command to see what i can do

# Discoveries
Internally "SDK" refers to the java application that will run commands against Netsuite.  The node cli is a wrapper to this SDK.


- A command such as `custom:hello` can  be setup in the [SdkCommandsMetadata.json](../../../metadata/SdkCommandsMetadata.json) file.
  - You don't need an entry in [SdkCommandMetadataPath.json](../../../metadata/SdkCommandsMetadataPatch.json)
- A generator needs to be setup in [CommandGenerators.json](../../../metadata/CommandGenerators.json)
- 
- If configured with `isSetupRequired` property then the `authId will be injected
- In `beforeExecuting` hooks only changes to the `options.arguments` are kept.  Changes to `projectFolder` are

## Command.run
After you "build" the Command (in your Command.js) the instance object that you have has a method `run` on it.  This could be overridden to not call the SDK (i.e. the java application)

## SKIP_AUHTORIZATION_CHECK and reauth
- There is a concept of reauthorization that is provided via (hidden?) properties on the command. 

## `projectFolder` and `defaultProjectFolder` can override
`defaultProjectFolder` can be set as a relative path to the location of the suitecloud.config.js file. 
This folder should be the containing directory of the `FileCabinet` directory.  But either way it is going to be the expected
location of the deploy and manifest files.  And other paths are going to be relative to that.  Such as `~/FileCabinet` and `~/Objects` folders

You can override this with `projectFolder` on any command hook.  

Example use-case: 
You are doing a file:upload


## current working directory

THis is by default uses as the `_executionPath` internally and is `node:path.join` with the projectFolder above in order to location the FileCabinet. 
it is expected that the suitecloud.config.js file reside there as well. 


# Features Todo

## Look for the closest suitecloud.config file instead of requiring it be in the working directory

## expand on the config that is accepted for a command
currently authid is available to `beforeExecuting` hooks BUT any chances you make to it are not respective. 
Instead it is already forced from a read of the project.json file. 
So we could extend the modification of options to include options.authid

- `authid` could be modifiedy-orprovided-by `beforeExecuting` 
  - e.g. you could provide a prompt
- `beforeExecuting` could be provided additional object to do things such as provide an interactive experience for the user.

```ts
const customCommandHandler = {
	beforeExecuting: (options: any, helpers: { 
		promptUser: any; // function,
        displayMesage: any; // function
    })=>{
		return options;
    }
}
```

- additionally: be able to know whether setup is required for a command.  As this should be determined immediately, you shouldn't be able to change it, but you should be able to know via a property in the options. `options.setupRequired: boolean` ?
- additionally: know whether the command will fire the SDK.  Any custom commands will not fire it.
- `options.isSDK : boolean`
- There are some commands where not both are true

## Make `beforeExecuting` more powerful
- carry-over changes to `options.projectFolder` property (see CommandActionExecutor#executeAction)
- Continue to not allow a change to options.CommandName

## Type definitions for the commands and arguments

adding some slowly