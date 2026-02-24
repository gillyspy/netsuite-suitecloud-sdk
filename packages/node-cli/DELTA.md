# Differences between this and @oracle/suitecloud-cli

- binary name is `sdf` (not `suitecloud`)
- package name is `@suitegeezus/suitecloud-cli`
- `package.json#configFile` can be used to set expected names of config files to hunt for
- environment variables for AUTHID, PROJECTFOLDER, PROJECTPATH
- `authid` option available on many commands
- `project` option available on many commands (to find resource files)
- `config` option available on many command (to be exact about config file to use)
- `customflag` option available on any command
- `customoptions` option available on any command

<p align="left"><a href="#"><img width="250" src="resources/netsuite_logo_simplified.png"></a></p>

- It can coexist with the regular version. You can install both at the same time. But why.
- They will share account credentials and the underlying SDK. They will reference the same `~/.suitecloud-sdk` resource folder. 
- Example, They can use different config files and not conflict with each other within the same project.
- By default, this uses `sdf.config.js`.
  - This can be changed in the package json file in the installed directory.  `package.json#configFile` setting. The reason this default is different is because older versions of suitecloud do not support "discovery" for a configuration file and thus
  - In this version you can also specify a `config` argument on the command line where you can point to a specific file (which can have any name).
  If you need to change the name or want to use the legacy `suitecloud.config.js` file then consider creating a `sdf.config.js` file that requires that config you already have.  Or if you must then you can go to the global package.json and modify this line:

```json
{
  "configFile": "sdf.config"
}
```

## Prerequisites

The following software is required to work with SuiteCloud CLI for Node.js:

- Node.js version 22 LTS
- Oracle JDK version 17 or 21

Read the full list of prerequisites in [SuiteCloud CLI for Node.js Installation Prerequisites](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1558708810.html).

## Supported Versions

To ensure that you get the latest features and bug fixes, you should use the latest version of the SuiteCloud CLI for Node.js available in NPM.

The following table shows the CLI versions currently available in NPM.

| CLI Versions Available in NPM | Available Since | Compatible NetSuite Version |
|:-----------------------------:|:---------------:|:---------------------------:|
|             3.0.X             |     2025.1      |      2024.2 and 2025.1      |

## Installation

> 📝 Note that the reason you have to download a file is because of how the source project is structured. i.e. it's not my fault!!!

Since CLI for Node.js is a development tool, use a global instance to install it by:

1. running the following command:

```shell
cd ~/Downloads
npm install -g --acceptSuiteCloudSDKLicense @suitegeezus/suitecloud-cli
```

You will now have this available from within any directory by running `sdf`.

you can verify the installation with this command:

```shell
sdf -h 
```

## Usage

This version CLI for Node.js uses the following syntax (`sdf` not `suitecloud`)

```shell
sdf <command> <option> <argument>
```

### Example: Importing several files

Note: this example does not require a config file

```shell
 sdf file:import --excludeproperties --authid MY-SANDBOX --project src --paths "/SuiteScripts/myFolder/myFile.js" "/SuiteScripts/myFolder/myFile2.js"
```

### Glossary

| Term                 | Definition                                                                                                      |
|----------------------|-----------------------------------------------------------------------------------------------------------------|
| Authentication ID    | The alias for a authentication configuration to connect to the account                                          |
| authId               | the current value used for the Authentication Id. Command parameter for this might be different for any command | 
| defaultAuthId        | the default value for the authId                                                                                |
| executionPath        | The location where suitecloud was launched. In this version it is not necessarily same as `config` location     |
| projectFolder        | The relative path from the execution path                                                                       |
| defaultProjectFolder | The default value for projectFolder provided in `config` files                                                  |
| projectPath          | the fully resolved form of executionPath + projectFolder                                                        |

### Commands

| Command                                                                                                              | Description                                                                                                                                                                                                                      |
|----------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [`account:manageauth`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_157304934116.html)      | Manages authentication IDs for all your projects.                                                                                                                                                                                |
| [`account:setup`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_89132630266.html)            | Sets up an account to use with SuiteCloud SDK and configures the default auth ID for the SuiteCloud project. It requires browser-based login to NetSuite.                                                                        |
| [`account:setup:ci`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_81134826821.html)         | Sets up an account to use with SuiteCloud SDK and configures the default auth ID for the SuiteCloud project. It does not require browser-based login to NetSuite. This command is helpful for automated environments such as CI. |
| `custom:hello`                                                                                                       | A sanity command to check configuration. You can use hooks but you should leave it ias it is.                                                                                                                                    |
| `custom:pass`                                                                                                        | A passthrough command that does nothing. You can build hooks for it                                                                                                                                                              |
| `custom:job`                                                                                                         | Run pre-configured commands such as running admindocs queries.  This also supports hooks                                                                                                                                         |
| `custom:config`                                                                                                      | Show location and contents of config file |
| [`file:create`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_162810635242.html)             | Creates SuiteScript files in the selected folder using the correct template with SuiteScript modules injected.                                                                                                                   |
| [`file:import`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156041963273.html)             | Imports files from an account to your account customization project.                                                                                                                                                             |
| [`file:list`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156042966488.html)               | Lists the files in the File Cabinet of your account.                                                                                                                                                                             |
| [`file:upload`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_159066070687.html)             | Uploads files from your project to an account.                                                                                                                                                                                   |
| [`object:import`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156042181820.html)           | Imports SDF custom objects from an account to your SuiteCloud project.                                                                                                                                                           |
| [`object:list`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156043303237.html)             | Lists the SDF custom objects deployed in an account.                                                                                                                                                                             |
| [`object:update`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156050566547.html)           | Overwrites the SDF custom objects in the project with their matching objects imported from the account. In the case of custom records, custom instances can be included.                                                         |
| [`project:adddependencies`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_155981452469.html) | Adds missing dependencies to the manifest file.                                                                                                                                                                                  |
| [`project:create`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156041348327.html)          | Creates a SuiteCloud project, either a SuiteApp or an account customization project (ACP).                                                                                                                                       |
| [`project:deploy`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156044636320.html)          | Deploys the folder containing the project.                                                                                                                                                                                       |
| [`project:package`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_159550971388.html)         | Generates a ZIP file from your project, respecting the structure specified in the deploy.xml file.                                                                                                                               |
| [`project:validate`](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156049843194.html)        | Validates the folder containing the SuiteCloud project.                                                                                                                                                                          |

To check the help for a specific command, run the following command:

```shell
sdf {command} -h
```

Read the detailed documentation for all the commands in [SuiteCloud CLI for Node.js Reference](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_155931263126.html).

#### About Custom Command Configuration: Authorization, Project-Folder and custom command hooks

Custom Configuration is provided via `sdf.config.js`. The `project:create` action will result in a `sdf.config.js` file.
This file can be changed at any time.
Previously, suitecloud required you to run in the same directory as the config file.
Now, when you run `sdf` executable it will "walk-up" the directory tree until it finds a `sdf.config.js` file. Specifically, it wil stop walking when it finds:

1. `sdf.config.js` or `sdf.config.json` file.
2. the project root (i.e. `package.json` file).
3. fallback to sub-folder containing any discovered `FileCabinet`, `Objects` or `AccountConfiguration` directory.

The location of the discovered `sdf.config` file is considered the project root.

Running this command will show you the discovered root and the contents of the sdf config file:

```shell
# TODO
sdf custom:config --show
```

#### Project Folder & Project Root

The projectFolder is not the location of the `sdf.config.js`. It can be anywhere on your file system, but typically it is the same directory or a subDirectory of the project. It can be overridden in some commands using the `--project` flag

If the config (or command line override) specifies a value for `defaultProjectFolder` then that value is appended to the project root to determine the `projectFolder`. That location is expected to contain things such as:

- manifest.xml
- deploy.xml
- FileCabinet directory
- Objects directory
- AccountConfiguration directory

many `sdf` commands can run without any config file. You may need to provide additional command line flags in lieu.

There are some commands where a `manifest.xml` file or `deploy.xml` file is required in the discovered root. In some cases you can use `--force` which will create a temporary `manifest.xml` file and then remove it when done.

Ranked from top priority to bottom priority

1. ~~value of `project` being returned by the `beforeExecuting` command hook via options. i.e. `options.arguments.project`.~~
    - this property is available in the method but changes to this specific property by the method will be ignored.
2. value of `projectFolder` property specified on the command's specific authId (if it has one)
3. value of `project` argument on the command line
4. value of `SUITECLOUD_PROJECT_FOLDER` environment variable
5. value of `defaultProjectFolder` in any project.json file (backwards compatibility)
6. value of `defaultProjectFolder` property at the top level of any discovered `sdf.config.js` file (backwards compatibility)
7. implied as the "Discovered" location

#### Authorization & Authenticated ID

Authorization is defined in advance as "authentication ID"s. You can have many of these available to you, but when you run a command you must designate one of them to use.

A command that requires authenticating supports the `authid` flag. This was always the case, but was suppressed in the command line interpreter and instead read from the `<projectFolder>/project.json` file. (This was previous a required file).

Further, authorization was provided ONLY via the local `project.json` file. This file is now optional, but support exists for backward compatibility. Setting authorization this way is deprecated and easily overridden.

Previously, when you wanted to run a command with a different authorization ID you would need to modify the `project.json` file manually or with a separate command. Then you would run the command that you want.  
Now, you can provide the authorization ID adhoc in several different ways. This multi-faceted configuration can be confusing, but there is a priority sequence for determining which authorization ID to use:

Ranked from top priority to bottom priority

1. value of `authid` being returned by the `beforeExecuting` command hook via options. i.e. `options.arguments.authid`.
2. value of `authId` property specified on the command's specific authId (if it has one)
3. value of `authid` argument on the command line
4. value of `SUITECLOUD_AUTHID` environment variable
5. value of `defaultAuthId` in the project.json file (backwards compatibility)
6. value of `defaultAuthId` property at the top level of any discovered `sdf.config.js` file

Note: the `authid` command option is never required as you can continue to provide it as a base-level configuration. However, it is highly recommended.

## Getting Started

🎞 To see how to install and set up CLI for Node.js, watch the following video:

<a href="https://videohub.oracle.com/media/Setting+Up+CLI+for+Nodej.s/0_091fc2ca"><img src="resources/video_setting_up_nodejs_cli.png" alt="Setting up CLI for Node.js video" width="400"></a>

Create a new project in an empty folder by running the following command:

```shell
sdf project:create -i
```

After you create a project, configure a NetSuite account, by running the following command within the project folder:

```shell
sdf account:setup
```

## Release Notes & Documentation

To read the 2025.1 NetSuite's release notes and documentation, check the following sections of NetSuite's Help Center:

- Read the release notes for NetSuite 2025.1 in [SuiteCloud SDK Release Notes](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1558730192.html).
- Read the latest updates under SuiteCloud SDK in the [Help Center Weekly Updates](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_3798389663.html).
- Read the CLI for Node.js documentation in [SuiteCloud CLI for Node.js Guide](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_1558708800.html).

## Contributing

SuiteCloud CLI for Node.js is an open source project. Pull Requests are currently not being accepted. See [Contributing](/CONTRIBUTING.md) for details.

## [License](/LICENSE.txt)

Copyright (c) 2022, 2023, 2024, 2025 Oracle and/or its affiliates The Universal Permissive License (UPL), Version 1.0.

By installing SuiteCloud CLI for Node.js, you are accepting the installation of the SuiteCloud SDK dependency under the [Oracle Free Use Terms and Conditions](https://www.oracle.com/downloads/licenses/oracle-free-license.html) license.