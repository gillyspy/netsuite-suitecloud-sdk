For commands that will be completely reliant on hooks.

Good for temporary commands.

there are no additional command parameters supported. You will need to provide this support in your own way as any attempt to use command line arguments wil result in an error. 

Some options for you are: 
1. Use different configuration files and point to them with the `--config` option
2. Build your own interaction
3. Make a feature request to the author

# Usage: Example

```js
// in your sdf.config.js file you could have
module.exports = { 
	defaultProjectFolder: 'src',
    commands: { 
		'custom:hook': { 
			beforeExecuting(options) {
				// do stuff
                if (options.arguments.option1 === 'words') console.log(options.arguments.mulit1.join(' '));
            }, 
        }, 
    },
};
```


```shell
sdf custom:hook --option1 words --multi1 hi there guy --flag1
```