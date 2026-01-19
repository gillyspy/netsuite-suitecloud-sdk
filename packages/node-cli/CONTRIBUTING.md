There were a lot of places where projectFolder means a relative location to the suitecloud.config.js file
Many have been removed.
There is now a concept of executionPath, projectFolder and projectPath and . see the [DELTA](./DELTA.md) glossary.

There are still many places in the command generator codes (i.e. [commands](./src/commands)) where `projectFolder` is being used, but it really means projectPath so to the generator invocation passes in projectPath

There are environment variables being used and created adhoc. They won't persist so if you are calling any sub-processes be sure to appropriately set `process.env` from the parent. 