const validator = require('oas-validator')
const fs = require('fs')
const yaml = require('js-yaml')

const loader = require('speccy/lib/loader')
const linter = require('speccy/lib/linter')

module.exports = (app) => {
  app.log('Yay! The app was loaded!')
  
  app.on(['pull_request.opened', 'pull_request.edited', 'pull_request.synchronize'], async context => {
    // remember that the config.yml file is the repo you are running the bot in
    const config = await context.config('config.yml')
    
    // currently, can only target one file
    const target = config.targetFiles.toString()
            
    const ref = await context.payload.pull_request.head.ref
    const contents = await context.github.repos.getContent(context.repo({
      path: target,
      ref: ref
    }))
    const text = Buffer.from(contents.data.content, 'base64').toString()      
    
    let content
    try {
      // TODO load in spec with options like loader.loadSpec
      content = yaml.safeLoad(text)
    } catch (err) {
      context.github.issues.createComment(context.issue({ body: "Failed to load OpenAPI specficiation" }))
     }
    
    await lint(content, (err, _options) => {
        const { details, lintResults } = _options
        if (err) {
            context.github.issues.createComment(context.issue({ body: formatError(err, details) }))
            return
        } else if (lintResults.length) {
            const str = "## Specification contains " + lintResults.length + " lint errors: " + "\n" + formatLintResults(lintResults)
            context.github.issues.createComment(context.issue({ body: str }))
            return
        }
    
    })
  })
}

const truncateLongMessages = message => {
    let lines = message.split('\n')
    if (lines.length > 6) {
        lines = lines.slice(0, 5).concat(
            ['  ... snip ...'],
            lines.slice(-1)
        );
    }
    return lines.join('\n')
}

const formatLintResults = lintResults => {
    let output = ''
    lintResults.forEach(result => {
        const { rule, error, pointer } = result;

        output += `
### ${pointer} \n **${rule.name}** \n ${rule.description} \n
More information: https://speccy.io/rules/#${rule.name} \n
<details><summary>More details</summary>

${truncateLongMessages(error.message)}</details>
`
    })
  return output
}

const formatError = (err, details) => {
  return [{
    pointer: details.pop(),
    message: err.message,
    type:    err instanceof validator.CLIError ? 'validation' : 'linter',
  }];
}

const lint = async (spec, callback) => {
    linter.init();
    await loader.loadRuleFiles(['strict'])

    // TODO add a speccy config file
    const options = {
        skip: [],
        lint: true,
        linter: linter.lint,
        verbose: false,
    };

    return validator.validateSync(spec, options, callback);
};